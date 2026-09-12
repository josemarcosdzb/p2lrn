import json
import tempfile
from pathlib import Path
import unittest
import zipfile

from p2rln_creator.builder import build_project
from p2rln_creator.project import new_project, save_project, add_file, add_unit, add_url, ProjectError, PROJECT_FILE
from p2rln_ref.validator import validate_package


class P2RLNCreatorTests(unittest.TestCase):
    def make_project(self, root: Path):
        project = new_project("Curso de prueba", "es", "Creado por el builder")
        save_project(root / PROJECT_FILE, project)
        return project

    def test_native_project_builds_valid_p2rln(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project = self.make_project(root)
            add_unit(project, "modulo", "Módulo", "es", "module", "course")
            asset = root / "intro.html"
            asset.write_text("<h1>Hola</h1>", encoding="utf-8")
            add_file(root, project, asset, "intro", "Introducción", parent="modulo", media_type="text/html", profile="https://p2rln.org/profile/web-content", copy_file=False)
            save_project(root / PROJECT_FILE, project)
            out = root / "curso.p2rln"
            result = build_project(root, out, strict_profiles=True)
            self.assertEqual(4, result["entities"])
            valid = validate_package(out, strict_profiles=True)
            self.assertEqual("0.4.0", valid["formatVersion"])

    def test_rebuild_is_byte_reproducible_and_ids_stable(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project = self.make_project(root)
            asset = root / "a.txt"
            asset.write_text("mismo", encoding="utf-8")
            add_file(root, project, asset, "a", "A", media_type="text/plain", copy_file=False)
            save_project(root / PROJECT_FILE, project)
            a = root / "a.p2rln"
            b = root / "b.p2rln"
            ra = build_project(root, a)
            rb = build_project(root, b)
            self.assertEqual(a.read_bytes(), b.read_bytes())
            self.assertEqual(ra["packageId"], rb["packageId"])
            self.assertEqual(ra["contentRoot"], rb["contentRoot"])

    def test_duplicate_file_bytes_are_stored_once(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project = self.make_project(root)
            asset = root / "same.bin"
            asset.write_bytes(b"same bytes")
            add_file(root, project, asset, "one", "Uno", media_type="application/octet-stream", copy_file=False)
            add_file(root, project, asset, "two", "Dos", media_type="application/octet-stream", copy_file=False)
            save_project(root / PROJECT_FILE, project)
            out = root / "dedup.p2rln"
            build_project(root, out)
            with zipfile.ZipFile(out) as zf:
                manifest = json.loads(zf.read("META-INF/manifest.json"))
                asset_files = [f for f in manifest["files"] if f["path"].startswith("assets/sha256/")]
                self.assertEqual(1, len(asset_files))

    def test_remote_resource_is_not_fetched_to_build(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project = self.make_project(root)
            add_url(project, "https://127.0.0.1:1/never-fetch", "remote", "Remoto")
            save_project(root / PROJECT_FILE, project)
            out = root / "remote.p2rln"
            build_project(root, out)
            with zipfile.ZipFile(out) as zf:
                graph = json.loads(zf.read("content/graph.json"))
                reps = [r for e in graph["entities"] if e["type"] == "resource" for r in e["representations"]]
                self.assertEqual("remote", reps[0]["location"]["type"])
                self.assertEqual("https://127.0.0.1:1/never-fetch", reps[0]["location"]["href"])

    def test_project_file_cannot_escape_workspace(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / "project"
            root.mkdir()
            outside = Path(td) / "outside.txt"
            outside.write_text("x")
            project = self.make_project(root)
            project["resources"].append({
                "key": "res-x",
                "representations": [{"key": "primary", "role": "primary", "mediaType": "text/plain", "source": {"type": "file", "path": "../outside.txt"}}],
            })
            project["activities"].append({"key": "act-x", "activityType": "https://p2rln.org/type/resource", "title": {"es": "X"}, "resource": "res-x"})
            project["course"]["children"].append("act-x")
            save_project(root / PROJECT_FILE, project)
            with self.assertRaisesRegex(ProjectError, "escapes workspace"):
                build_project(root, root / "bad.p2rln")


if __name__ == "__main__":
    unittest.main()

class P2RLNAulaP2PReaderIngestTests(unittest.TestCase):
    def canonical(self):
        return {
            "version": "aulap2p.documento.extraido.v2",
            "origen": {
                "nombreArchivo": "tema.docx",
                "extensionOriginal": ".docx",
                "mimeOriginal": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "tipoArchivoDetectado": "DOCX",
                "estrategiaExtraccion": "NATIVA",
            },
            "metadatos": {"tituloDetectado": "Tema de prueba", "idiomaDetectado": "es"},
            "bloques": [],
            "tablas": [],
            "secuenciaMultimodal": {
                "version": "aulap2p.documento.multimodal.v2",
                "nodos": [
                    {"id": "n1", "tipo": "TITULO", "orden": 1, "texto": "Tema de prueba", "pagina": 1,
                     "confianza": 0.99, "procedencia": {"motor": "NATIVO", "referencia": "p1"}},
                    {"id": "n2", "tipo": "PARRAFO", "orden": 2, "texto": "Contenido", "pagina": 1,
                     "bbox": {"x": 1, "y": 2, "width": 3, "height": 4, "sistemaCoordenadas": "TOP_LEFT"},
                     "procedencia": {"motor": "DOCLING"}},
                ],
            },
            "procedenciaExtraccion": {},
            "advertencias": [],
        }

    def test_aulap2p_canonical_document_builds_p2rln_with_provenance_and_source(self):
        from p2rln_creator.aulap2p_ingest import ingest_aulap2p_reader
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            doc = root / "reader.json"
            doc.write_text(json.dumps(self.canonical()), encoding="utf-8")
            original = root / "tema.docx"
            original.write_bytes(b"PK fake docx original bytes")
            out = root / "tema.p2rln"
            result = ingest_aulap2p_reader(doc, out, source_file=original)
            self.assertTrue(result["sourcePreserved"])
            self.assertEqual(2, result["createdActivities"])
            validate_package(out)
            with zipfile.ZipFile(out) as zf:
                names = set(zf.namelist())
                self.assertIn("provenance/transformation.json", names)
                graph = json.loads(zf.read("content/graph.json"))
                raw = json.dumps(graph)
                self.assertNotIn("archivoId", raw)
                self.assertNotIn("localhost", raw)
                source_reps = [r for e in graph["entities"] if e["type"] == "resource" for r in e["representations"] if r.get("role") == "source"]
                self.assertEqual(1, len(source_reps))
                source_bytes = zf.read(source_reps[0]["location"]["path"])
                self.assertEqual(original.read_bytes(), source_bytes)
                provenance = json.loads(zf.read("provenance/transformation.json"))
                self.assertEqual("AulaP2PReaderAdapter", provenance["source"]["adapter"])

    def test_local_aulap2p_asset_identity_and_url_do_not_leak(self):
        from p2rln_creator.aulap2p_ingest import ingest_aulap2p_reader
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            canonical = self.canonical()
            canonical["secuenciaMultimodal"] = {
                "version": "aulap2p.documento.multimodal.v2",
                "nodos": [{
                    "id": "img1", "tipo": "IMAGEN", "texto": "Imagen", "orden": 1,
                    "procedencia": {"motor": "NATIVO", "referencia": "img1"},
                }],
            }
            canonical["bloques"] = [{
                "tempId": "img1", "tipo": "IMAGEN_REFERENCIADA", "texto": "Imagen", "orden": 1,
                "archivoId": 783,
                "archivo": {"id": 783, "url": "http://localhost/private/783", "nombre": "x.png", "mimeType": "image/png", "tamanoBytes": 3},
                "fuente": {"tipo": "DOCX", "raw": {"archivoId": 783, "rutaArchivo": "word/media/image1.png"}},
            }]
            doc = root / "reader.json"
            doc.write_text(json.dumps(canonical), encoding="utf-8")
            out = root / "tema.p2rln"
            result = ingest_aulap2p_reader(doc, out)
            self.assertEqual(1, result["unresolvedImages"])
            with zipfile.ZipFile(out) as zf:
                combined = b"\n".join(zf.read(name) for name in zf.namelist() if name.endswith(".json")).decode("utf-8")
                self.assertNotIn("localhost/private/783", combined)
                self.assertNotIn('"archivoId": 783', combined)
                provenance = json.loads(zf.read("provenance/transformation.json"))
                self.assertEqual("unresolved-local-asset", provenance["losses"][0]["kind"])


    def test_document_question_nodes_are_not_assessment_authority(self):
        from p2rln_creator.aulap2p_ingest import ingest_aulap2p_reader
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            canonical = self.canonical()
            canonical["secuenciaMultimodal"]["nodos"] = [
                {"id": "q1", "tipo": "PREGUNTA", "orden": 1, "texto": "2 + 2?", "procedencia": {"motor": "NATIVO"}},
                {"id": "s1", "tipo": "SOLUCION", "orden": 2, "texto": "4", "procedencia": {"motor": "NATIVO"}},
            ]
            doc = root / "reader.json"
            doc.write_text(json.dumps(canonical), encoding="utf-8")
            out = root / "tema.p2rln"
            ingest_aulap2p_reader(doc, out)
            with zipfile.ZipFile(out) as zf:
                graph = json.loads(zf.read("content/graph.json"))
                activities = [e for e in graph["entities"] if e["type"] == "activity"]
                self.assertTrue(activities)
                self.assertTrue(all(e.get("activityType") != "https://p2rln.org/type/assessment" for e in activities))

    def test_legacy_document_v1_is_rejected_at_bridge_boundary(self):
        from p2rln_creator.aulap2p_ingest import AulaP2PIngestError, ingest_aulap2p_reader
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            canonical = self.canonical()
            canonical["version"] = "aulap2p.documento.extraido.v1"
            doc = root / "reader.json"
            doc.write_text(json.dumps(canonical), encoding="utf-8")
            with self.assertRaises(AulaP2PIngestError):
                ingest_aulap2p_reader(doc, root / "tema.p2rln")

    def test_materialized_aulap2p_asset_is_packaged_by_bytes(self):
        from p2rln_creator.aulap2p_ingest import ingest_aulap2p_reader, BRIDGE_SCHEMA
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            canonical = self.canonical()
            canonical["secuenciaMultimodal"] = {
                "version": "aulap2p.documento.multimodal.v2",
                "nodos": [{
                    "id": "img1", "tipo": "IMAGEN", "texto": "Diagrama", "orden": 1,
                    "procedencia": {"motor": "NATIVO", "referencia": "img1"},
                }],
            }
            canonical["bloques"] = [{"tempId": "img1", "tipo": "IMAGEN_REFERENCIADA", "texto": "Diagrama", "orden": 1, "archivoId": 99, "fuente": {"tipo": "DOCX"}}]
            asset = root / "image.png"
            asset.write_bytes(b"\x89PNG\r\nportable-image")
            envelope = {"schema": BRIDGE_SCHEMA, "document": canonical, "assets": [{"blockTempId": "img1", "path": asset.name}]}
            inp = root / "envelope.json"
            inp.write_text(json.dumps(envelope), encoding="utf-8")
            out = root / "tema.p2rln"
            result = ingest_aulap2p_reader(inp, out, asset_root=root)
            self.assertEqual(0, result["unresolvedImages"])
            self.assertEqual(1, result["createdActivities"])
            with zipfile.ZipFile(out) as zf:
                graph = json.loads(zf.read("content/graph.json"))
                reps = [r for e in graph["entities"] if e["type"] == "resource" for r in e["representations"]]
                self.assertEqual(asset.read_bytes(), zf.read(reps[0]["location"]["path"]))
