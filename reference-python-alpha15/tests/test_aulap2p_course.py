import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from p2rln_creator.aulap2p_course import (
    AULAP2P_COURSE_ENVELOPE,
    AULAP2P_COURSE_IMPORT,
    AULAP2P_EXT,
    AulaP2PCourseError,
    extract_aulap2p_course,
    ingest_aulap2p_course,
)


class AulaP2PCourseBridgeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def _course(self):
        return {
            "version": "aulap2p.curso.v1",
            "curso": {"id": 99, "titulo": "Fisica", "descripcion": "Curso", "revision": 7},
            "modulos": [{
                "id": 11, "titulo": "Mecanica", "orden": 1,
                "lecciones": [{
                    "id": 12, "titulo": "Cinematica", "orden": 1,
                    "bloques": [{"id": 13, "tipo": "TEXTO", "contenido": {"html": "<p>Hola</p>"}, "orden": 1}],
                    "materiales": [],
                    "cuestionarios": [],
                }],
            }],
            "materiales": [],
            "cuestionarios": [],
        }

    def _write(self, obj, name="course.json"):
        path = self.root / name
        path.write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")
        return path

    def _ingest(self, obj, name="course.p2rln", asset_root=None):
        source = self._write(obj)
        output = self.root / name
        result = ingest_aulap2p_course(source, output, asset_root=asset_root)
        return output, result

    def _graph(self, package):
        with zipfile.ZipFile(package) as zf:
            return json.loads(zf.read("content/graph.json")), json.loads(zf.read("META-INF/manifest.json")), zf.namelist()

    def test_01_raw_canonical_course_round_trips_hierarchy(self):
        package, result = self._ingest(self._course())
        self.assertEqual(result["created"]["modules"], 1)
        self.assertEqual(result["created"]["lessons"], 1)
        self.assertEqual(result["created"]["blocks"], 1)
        extracted = self.root / "import.json"
        report = extract_aulap2p_course(package, extracted)
        self.assertEqual(report["schema"], AULAP2P_COURSE_IMPORT)
        data = json.loads(extracted.read_text(encoding="utf-8"))
        self.assertEqual(data["course"]["modulos"][0]["lecciones"][0]["bloques"][0]["contenido"]["html"], "<p>Hola</p>")

    def test_02_local_ids_do_not_affect_content_root(self):
        a = self._course()
        b = self._course()
        b["curso"]["id"] = 123456
        b["modulos"][0]["id"] = 654321
        pa, ra = self._ingest(a, "a.p2rln")
        pb, rb = self._ingest(b, "b.p2rln")
        self.assertEqual(ra["contentRoot"], rb["contentRoot"])
        self.assertEqual(pa.read_bytes(), pb.read_bytes())

    def test_03_internal_urls_and_archivo_ids_do_not_leak(self):
        course = self._course()
        course["materiales"] = [{
            "id": 8, "archivoId": 783, "titulo": "PDF", "contenido": {"url": "https://aula.local/api/files/783"},
            "archivo": {"url": "https://aula.local/private/783", "archivoId": 783},
        }]
        envelope = {"schema": AULAP2P_COURSE_ENVELOPE, "course": course, "internalHosts": ["aula.local"]}
        package, _ = self._ingest(envelope)
        raw = package.read_bytes()
        self.assertNotIn(b"783", raw)
        self.assertNotIn(b"aula.local", raw)
        self.assertNotIn(b"archivoId", raw)

    def test_04_materialized_asset_is_content_addressed(self):
        asset = self.root / "document.pdf"
        asset.write_bytes(b"PDF-BYTES")
        course = self._course()
        course["materiales"] = [{"titulo": "Documento", "archivoId": 91}]
        envelope = {
            "schema": AULAP2P_COURSE_ENVELOPE,
            "course": course,
            "assets": [{"canonicalPath": "materiales/0", "path": "document.pdf", "mediaType": "application/pdf", "originalName": "document.pdf"}],
        }
        package, _ = self._ingest(envelope, asset_root=self.root)
        _, _, names = self._graph(package)
        assets = [x for x in names if x.startswith("assets/sha256/")]
        self.assertEqual(len(assets), 1)
        with zipfile.ZipFile(package) as zf:
            self.assertEqual(zf.read(assets[0]), b"PDF-BYTES")

    def test_05_unmaterialized_asset_is_explicit_loss(self):
        course = self._course()
        course["materiales"] = [{"titulo": "Documento", "archivoId": 91}]
        envelope = {
            "schema": AULAP2P_COURSE_ENVELOPE,
            "course": course,
            "assets": [{"canonicalPath": "materiales/0", "path": "missing.pdf"}],
        }
        _, result = self._ingest(envelope, asset_root=self.root)
        self.assertTrue(any("not materialized" in x["reason"] for x in result["losses"]))

    def test_06_external_url_is_preserved_without_fetching(self):
        course = self._course()
        course["materiales"] = [{"titulo": "Web", "contenido": {"url": "https://example.org/recurso"}}]
        package, _ = self._ingest(course)
        graph, _, _ = self._graph(package)
        remote = [r for e in graph["entities"] if e["type"] == "resource" for r in e["representations"] if r["location"]["type"] == "remote"]
        self.assertEqual(remote[0]["location"]["href"], "https://example.org/recurso")

    def test_07_task_material_is_emitted_once_as_assignment(self):
        course = self._course()
        course["materiales"] = [{"titulo": "Entrega", "descripcion": "Sube tu trabajo", "contenido": {"tipo": "TAREA"}}]
        package, result = self._ingest(course)
        graph, _, _ = self._graph(package)
        aula_acts = [e for e in graph["entities"] if e["type"] == "activity" and AULAP2P_EXT in (e.get("extensions") or {})]
        assignments = [e for e in aula_acts if e["extensions"][AULAP2P_EXT].get("kind") == "assignment"]
        materials = [e for e in aula_acts if e["extensions"][AULAP2P_EXT].get("kind") == "material"]
        self.assertEqual(len(assignments), 1)
        self.assertEqual(len(materials), 0)
        self.assertEqual(result["created"]["materials"], 1)
        self.assertEqual(result["created"]["tasks"], 1)

    def test_08_task_sidecar_preserves_all_design_fields(self):
        course = self._course()
        course["materiales"] = [{"titulo": "Entrega", "contenido": {"tipo": "TAREA"}}]
        task = {
            "canonicalPath": "tasks/0", "materialPath": "materiales/0", "parentPath": "course",
            "titulo": "Trabajo final", "descripcion": "Memoria", "puntuacionMaxima": 100,
            "fechaEntrega": "2026-10-01T20:00:00Z", "permiteRetraso": True,
            "tituloVisible": "Proyecto", "obligatorio": True, "positionKey": "b10", "desbloqueadoEn": "2026-09-15T08:00:00Z",
        }
        envelope = {"schema": AULAP2P_COURSE_ENVELOPE, "course": course, "tasks": [task]}
        package, _ = self._ingest(envelope)
        extracted = self.root / "import.json"
        extract_aulap2p_course(package, extracted)
        got = json.loads(extracted.read_text(encoding="utf-8"))["tasks"][0]
        for field in ("titulo", "descripcion", "puntuacionMaxima", "fechaEntrega", "permiteRetraso", "tituloVisible", "obligatorio", "positionKey", "desbloqueadoEn"):
            self.assertEqual(got[field], task[field])

    def test_09_task_rejects_alumno_id(self):
        envelope = {"schema": AULAP2P_COURSE_ENVELOPE, "course": self._course(), "tasks": [{"titulo": "T", "alumnoId": 44}]}
        with self.assertRaises(AulaP2PCourseError):
            self._ingest(envelope)

    def test_10_task_rejects_entregas_and_attempts_nested(self):
        envelope = {"schema": AULAP2P_COURSE_ENVELOPE, "course": self._course(), "tasks": [{"titulo": "T", "config": {"entregas": [{"intentos": 2}]}}]}
        with self.assertRaises(AulaP2PCourseError):
            self._ingest(envelope)

    def test_11_task_rejects_local_database_ids(self):
        envelope = {"schema": AULAP2P_COURSE_ENVELOPE, "course": self._course(), "tasks": [{"titulo": "T", "materialId": 7}]}
        with self.assertRaises(AulaP2PCourseError):
            self._ingest(envelope)

    def test_12_task_rejects_grade_and_feedback(self):
        envelope = {"schema": AULAP2P_COURSE_ENVELOPE, "course": self._course(), "tasks": [{"titulo": "T", "nota": 10, "feedback": "ok"}]}
        with self.assertRaises(AulaP2PCourseError):
            self._ingest(envelope)

    def test_13_standalone_task_creates_assignment_without_fake_material_duplication(self):
        envelope = {"schema": AULAP2P_COURSE_ENVELOPE, "course": self._course(), "tasks": [{"canonicalPath": "tasks/0", "titulo": "Ensayo", "puntuacionMaxima": 20}]}
        package, result = self._ingest(envelope)
        self.assertEqual(result["created"]["tasks"], 1)
        self.assertEqual(result["created"]["materials"], 0)
        graph, _, _ = self._graph(package)
        assignment = next(e for e in graph["entities"] if e["type"] == "activity" and (e.get("extensions") or {}).get(AULAP2P_EXT, {}).get("kind") == "assignment")
        self.assertNotIn("resource", assignment)

    def test_14_unknown_task_parent_is_loss_and_not_persisted(self):
        envelope = {"schema": AULAP2P_COURSE_ENVELOPE, "course": self._course(), "tasks": [{"canonicalPath": "tasks/0", "parentPath": "modulos/999", "titulo": "T"}]}
        _, result = self._ingest(envelope)
        self.assertEqual(result["created"]["tasks"], 0)
        self.assertTrue(any("parentPath not found" in x["reason"] for x in result["losses"]))

    def test_15_quiz_questions_round_trip_without_attempt_state(self):
        course = self._course()
        course["cuestionarios"] = [{
            "titulo": "Test", "configuracion": {"barajar": True},
            "preguntas": [{"enunciado": "2+2", "tipo": "OPCION_MULTIPLE", "puntos": 1, "opciones": ["3", "4"], "solucion": "4"}],
        }]
        package, _ = self._ingest(course)
        extracted = self.root / "import.json"
        extract_aulap2p_course(package, extracted)
        quiz = json.loads(extracted.read_text(encoding="utf-8"))["course"]["cuestionarios"][0]
        self.assertEqual(quiz["preguntas"][0]["solucion"], "4")
        self.assertNotIn("intentos", json.dumps(quiz, ensure_ascii=False))

    def test_16_qti_sidecar_is_profiled_and_recoverable_as_descriptor(self):
        qti = self.root / "quiz.zip"
        with zipfile.ZipFile(qti, "w") as zf:
            zf.writestr("imsmanifest.xml", "<manifest/>")
        course = self._course()
        course["cuestionarios"] = [{"titulo": "QTI", "preguntas": []}]
        envelope = {
            "schema": AULAP2P_COURSE_ENVELOPE, "course": course,
            "qtiPackages": [{"canonicalPath": "cuestionarios/0", "path": "quiz.zip", "sourceVersion": "2.2", "originalName": "quiz.zip"}],
        }
        package, _ = self._ingest(envelope, asset_root=self.root)
        graph, manifest, _ = self._graph(package)
        self.assertTrue(any(p["id"] == "https://p2rln.org/profile/qti" for p in manifest["profiles"]))
        self.assertTrue(any(rep.get("profile") == "https://p2rln.org/profile/qti" for e in graph["entities"] if e["type"] == "resource" for rep in e["representations"]))
        extracted = self.root / "import.json"
        extract_aulap2p_course(package, extracted)
        self.assertEqual(json.loads(extracted.read_text(encoding="utf-8"))["qtiPackages"][0]["sourceVersion"], "2.2")

    def test_17_task_roundtrip_reconstructs_one_material_plus_one_task_sidecar(self):
        course = self._course()
        course["modulos"][0]["lecciones"][0]["materiales"] = [{"titulo": "Practica", "contenido": {"tipo": "TAREA"}, "orden": 2}]
        path = "modulos/0/lecciones/0/materiales/0"
        envelope = {
            "schema": AULAP2P_COURSE_ENVELOPE, "course": course,
            "tasks": [{"canonicalPath": "tasks/0", "materialPath": path, "parentPath": "modulos/0/lecciones/0", "titulo": "Practica", "positionKey": "m5", "obligatorio": True}],
        }
        package, _ = self._ingest(envelope)
        extracted = self.root / "import.json"
        extract_aulap2p_course(package, extracted)
        data = json.loads(extracted.read_text(encoding="utf-8"))
        lesson = data["course"]["modulos"][0]["lecciones"][0]
        self.assertEqual(len(lesson["materiales"]), 1)
        self.assertEqual(len(data["tasks"]), 1)
        self.assertEqual(data["tasks"][0]["materialPath"], path)
        self.assertEqual(data["tasks"][0]["positionKey"], "m5")
        self.assertNotIn("orden", data["tasks"][0])


if __name__ == "__main__":
    unittest.main()
