from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import unittest
import urllib.request
import zipfile
from pathlib import Path

from p2rln_creator.aulap2p_course import (
    AULAP2P_COURSE_ENVELOPE,
    extract_aulap2p_course,
    ingest_aulap2p_course,
)
from p2rln_creator.aulap2p_questionnaire import questionnaire_from_aulap2p
from p2rln_creator.builder import build_project
from p2rln_creator.project import PROJECT_FILE, add_questionnaire, new_project, save_project
from p2rln_reader import P2RLNReadingSystem
from p2rln_reader.app import ReaderServer
from p2rln_ref.native_questionnaire import (
    MEDIA_TYPE,
    PROFILE,
    NativeQuestionnaireError,
    score_questionnaire,
    validate_questionnaire,
)
from p2rln_ref.validator import validate_package

ROOT = Path(__file__).resolve().parents[1]
EXAMPLE = ROOT / "examples" / "native-questionnaire.json"


class NativeQuestionnaireTests(unittest.TestCase):
    def payload(self) -> dict:
        return json.loads(EXAMPLE.read_text(encoding="utf-8"))

    def perfect_answers(self, payload: dict) -> dict:
        answers: dict[str, dict] = {}
        for question in payload["questions"]:
            solution = question["solution"]
            if question["type"] in {"single-choice", "multiple-choice", "true-false"}:
                answers[question["id"]] = {"choiceIds": solution["choiceIds"]}
            elif question["type"] == "text":
                answers[question["id"]] = {"text": solution["acceptedAnswers"][0]}
            elif question["type"] == "fill-blanks":
                answers[question["id"]] = {"blanks": {key: values[0] for key, values in solution["answers"].items()}}
            elif question["type"] == "ordering":
                answers[question["id"]] = {"order": solution["order"]}
            elif question["type"] == "matching":
                answers[question["id"]] = {"pairs": {pair["left"]: pair["right"] for pair in solution["pairs"]}}
        return answers

    def test_01_all_seven_native_types_validate_and_score(self):
        payload = validate_questionnaire(self.payload())
        self.assertEqual(
            {"single-choice", "multiple-choice", "true-false", "text", "fill-blanks", "ordering", "matching"},
            {question["type"] for question in payload["questions"]},
        )
        score = score_questionnaire(payload, self.perfect_answers(payload))
        self.assertTrue(score["graded"])
        self.assertEqual(score["raw"], score["max"])
        self.assertEqual(1.0, score["normalized"])

    def test_02_partial_with_penalty_is_bounded(self):
        payload = {
            "schema": "https://p2rln.org/schema/native-questionnaire/0.4.0",
            "version": "0.4.0",
            "title": "Penalty",
            "grading": {"mode": "embedded-key"},
            "questions": [{
                "id": "q1", "type": "multiple-choice", "prompt": "P", "points": 4,
                "penalty": 1, "scoring": "partial-with-penalty",
                "choices": [{"id": "a", "text": "A"}, {"id": "b", "text": "B"}, {"id": "c", "text": "C"}],
                "solution": {"choiceIds": ["a", "b"]},
            }],
        }
        score = score_questionnaire(payload, {"q1": {"choiceIds": ["a", "c"]}})
        self.assertEqual(1.0, score["raw"])
        self.assertEqual(0.25, score["normalized"])

    def test_03_host_grading_never_invents_a_score(self):
        payload = self.payload()
        payload["grading"] = {"mode": "host"}
        for question in payload["questions"]:
            question.pop("solution", None)
        score = score_questionnaire(payload, {})
        self.assertFalse(score["graded"])
        self.assertIsNone(score["normalized"])
        self.assertTrue(all(not result["graded"] for result in score["questions"]))

    def test_04_invalid_solution_reference_is_rejected(self):
        payload = self.payload()
        payload["questions"][0]["solution"] = {"choiceIds": ["missing"]}
        with self.assertRaises(NativeQuestionnaireError):
            validate_questionnaire(payload)

    def test_05_aulap2p_mapping_uses_portable_ids_and_all_supported_types(self):
        quiz = {
            "id": 811001,
            "titulo": "AulaP2P portable",
            "preguntas": [
                {"id": 900001, "tipo": "OPCION_UNICA", "enunciado": "Uno", "puntos": 1,
                 "opciones": [{"id": 910001, "texto": "A"}, {"id": 910002, "texto": "B"}],
                 "solucion": {"opcionIds": [910002]}},
                {"id": 900002, "tipo": "OPCION_MULTIPLE", "enunciado": "Dos", "puntos": 2,
                 "opciones": [{"id": 920001, "texto": "A"}, {"id": 920002, "texto": "B"}, {"id": 920003, "texto": "C"}],
                 "solucion": {"opcionIds": [920001, 920002]}},
                {"id": 900003, "tipo": "VERDADERO_FALSO", "enunciado": "Tres", "puntos": 1, "solucion": True},
                {"id": 900004, "tipo": "RESPUESTA_ESCRITA", "enunciado": "Cuatro", "puntos": 1, "solucion": {"respuestasValidas": ["agua"]}},
                {"id": 900005, "tipo": "RELLENAR_HUECOS", "enunciado": "Cinco", "puntos": 2,
                 "configuracion": {"huecos": [{"id": "local-blank-771", "opciones": ["luz", "calor"]}]},
                 "solucion": {"huecos": [{"id": "local-blank-771", "respuestasValidas": ["luz"]}]}},
                {"id": 900006, "tipo": "ORDENAR_ELEMENTOS", "enunciado": "Seis", "puntos": 2,
                 "configuracion": {"elementos": [{"id": 960001, "texto": "Primero"}, {"id": 960002, "texto": "Segundo"}]},
                 "solucion": {"ordenCorrecto": [960001, 960002]}},
                {"id": 900007, "tipo": "RELACIONAR_COLUMNAS", "enunciado": "Siete", "puntos": 2,
                 "configuracion": {
                     "izquierda": [{"id": 970001, "texto": "HTTP"}],
                     "derecha": [{"id": 970002, "texto": "Web"}],
                 },
                 "solucion": {"paresCorrectos": [{"izquierda": 970001, "derecha": 970002}]}},
            ],
        }
        payload = questionnaire_from_aulap2p(quiz)
        self.assertEqual("embedded-key", payload["grading"]["mode"])
        self.assertEqual(7, len(payload["questions"]))
        raw = json.dumps(payload, ensure_ascii=False)
        for local_id in (811001, 900001, 910001, 920001, 960001, 970001, 970002):
            self.assertNotIn(str(local_id), raw)
        self.assertNotIn("local-blank-771", raw)

    def test_06_creator_builds_strict_native_package_and_reader_delivers_it(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project = new_project("Curso nativo")
            save_project(root / PROJECT_FILE, project)
            add_questionnaire(root, project, EXAMPLE, "quiz", copy_file=True)
            save_project(root / PROJECT_FILE, project)
            package = root / "course.p2rln"
            build_project(root, package, strict_profiles=True)
            validate_package(package, strict_profiles=True, validate_profile_payloads_flag=True)
            system = P2RLNReadingSystem(package)
            activity = next(entity for entity in system.reader.entities.values() if entity["type"] == "activity")
            target = system.view_target(activity["id"], "token")
            self.assertEqual("ready", target.status)
            self.assertEqual("native-questionnaire", target.kind)
            self.assertEqual("p2rln-native-questionnaire", target.runtime)
            self.assertEqual(MEDIA_TYPE, target.media_type)

    def test_07_aulap2p_quiz_without_qti_gets_one_native_representation_and_roundtrips(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            course = {
                "version": "aulap2p.curso.v1",
                "curso": {"id": 1, "titulo": "Curso"},
                "modulos": [], "materiales": [],
                "cuestionarios": [{
                    "id": 88, "titulo": "Quiz",
                    "preguntas": [{
                        "id": 99, "tipo": "OPCION_UNICA", "enunciado": "2+2", "puntos": 1,
                        "opciones": [{"id": 1001, "texto": "3"}, {"id": 1002, "texto": "4"}],
                        "solucion": {"opcionIds": [1002]},
                    }],
                }],
            }
            source = root / "course.json"
            source.write_text(json.dumps(course), encoding="utf-8")
            package = root / "course.p2rln"
            ingest_aulap2p_course(source, package, strict_profiles=True)
            validate_package(package, strict_profiles=True, validate_profile_payloads_flag=True)
            with zipfile.ZipFile(package) as zf:
                graph = json.loads(zf.read("content/graph.json"))
                manifest = json.loads(zf.read("META-INF/manifest.json"))
            native_reps = [
                rep for entity in graph["entities"] if entity["type"] == "resource"
                for rep in entity.get("representations", []) if rep.get("profile") == PROFILE
            ]
            self.assertEqual(1, len(native_reps))
            self.assertTrue(any(profile["id"] == PROFILE for profile in manifest["profiles"]))
            extracted = root / "roundtrip.json"
            extract_aulap2p_course(package, extracted)
            envelope = json.loads(extracted.read_text(encoding="utf-8"))
            self.assertEqual("Quiz", envelope["course"]["cuestionarios"][0]["titulo"])
            self.assertFalse(any(asset.get("mediaType") == MEDIA_TYPE for asset in envelope.get("assets", [])))

    def test_08_qti_sidecar_remains_authoritative_over_generated_native_representation(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            qti = root / "quiz.zip"
            with zipfile.ZipFile(qti, "w") as zf:
                zf.writestr("imsmanifest.xml", "<manifest/>")
            course = {
                "version": "aulap2p.curso.v1",
                "curso": {"titulo": "Curso"}, "modulos": [], "materiales": [],
                "cuestionarios": [{"titulo": "QTI", "preguntas": [{"tipo": "RESPUESTA_ESCRITA", "enunciado": "X", "solucion": "x"}]}],
            }
            envelope = {
                "schema": AULAP2P_COURSE_ENVELOPE,
                "course": course,
                "qtiPackages": [{"canonicalPath": "cuestionarios/0", "path": "quiz.zip", "sourceVersion": "2.2"}],
            }
            source = root / "course.json"
            source.write_text(json.dumps(envelope), encoding="utf-8")
            package = root / "course.p2rln"
            ingest_aulap2p_course(source, package, asset_root=root, strict_profiles=True)
            with zipfile.ZipFile(package) as zf:
                graph = json.loads(zf.read("content/graph.json"))
            profiles = [rep.get("profile") for entity in graph["entities"] if entity["type"] == "resource" for rep in entity.get("representations", [])]
            self.assertIn("https://p2rln.org/profile/qti", profiles)
            self.assertNotIn(PROFILE, profiles)

    @unittest.skipUnless(shutil.which("node"), "Node.js required for browser-runtime verification")
    def test_09_browser_verifier_opens_real_native_package(self):
        package = ROOT / "examples" / "native-questionnaire-course.p2rln"
        script = r'''import fs from 'node:fs';
import {openP2RLNPackageBytes} from './p2rln_reader/web/p2rln-player.js';
const source = fs.readFileSync(process.argv[1]);
const ab = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
const pkg = await openP2RLNPackageBytes(ab);
const reps = pkg.graph.entities.flatMap(e => e.type === 'resource' ? (e.representations ?? []) : []);
if (!reps.some(rep => rep.profile === 'https://p2rln.org/profile/native-questionnaire')) process.exit(9);
console.log(pkg.manifest.integrity.contentRoot);
'''
        completed = subprocess.run(
            ["node", "--input-type=module", "-e", script, str(package)],
            cwd=ROOT, text=True, capture_output=True, check=False,
        )
        self.assertEqual(0, completed.returncode, completed.stderr)
        self.assertTrue(completed.stdout.strip().startswith("sha256:"))

    def test_10_timed_questionnaire_is_deliverable_and_deadline_survives_runtime_state(self):
        payload = self.payload()
        payload["attemptPolicy"] = {"timeLimitSeconds": 60}
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            source = root / "timed.json"
            source.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
            project = new_project("Timed")
            save_project(root / PROJECT_FILE, project)
            add_questionnaire(root, project, source, "timed", copy_file=True)
            save_project(root / PROJECT_FILE, project)
            package = root / "timed.p2rln"
            build_project(root, package, strict_profiles=True)
            validate_package(package, strict_profiles=True, validate_profile_payloads_flag=True)
            system = P2RLNReadingSystem(package)
            activity = next(entity for entity in system.reader.entities.values() if entity["type"] == "activity")
            target = system.view_target(activity["id"], "token")
            self.assertEqual("ready", target.status)
            self.assertEqual("native-questionnaire", target.kind)
            if shutil.which("node"):
                script = """import fs from 'node:fs';
import {QuestionnaireSession} from './p2rln_reader/web/questionnaire-session.js';
const payload = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
let now = 1000;
const session = new QuestionnaireSession(payload, {clock: () => now, autoTiming: false, supportsQuestionTiming: true});
await session.mount();
if (session.state.timing.attemptDeadlineAt !== 61000) process.exit(7);
now = 62000;
await session.checkTiming();
if (!session.state.completed || session.state.completionReason !== 'time-limit') process.exit(8);
if (session.state.attemptsCompleted !== 1) process.exit(9);
"""
                completed = subprocess.run(
                    ["node", "--input-type=module", "-e", script, str(source)],
                    cwd=ROOT, text=True, capture_output=True, check=False,
                )
                self.assertEqual(0, completed.returncode, completed.stderr)

    def test_11_aulap2p_native_mapping_failure_is_explicit_and_does_not_delete_canonical_quiz(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            course = {
                "version": "aulap2p.curso.v1",
                "curso": {"titulo": "Curso"},
                "modulos": [], "materiales": [],
                "cuestionarios": [{
                    "titulo": "Incompleto",
                    "preguntas": [{"tipo": "OPCION_UNICA", "enunciado": "Sin opciones", "puntos": 1}],
                }],
            }
            source = root / "course.json"
            source.write_text(json.dumps(course), encoding="utf-8")
            package = root / "course.p2rln"
            result = ingest_aulap2p_course(source, package, strict_profiles=True)
            self.assertTrue(any("native questionnaire mapping unavailable" in loss.get("reason", "") for loss in result["losses"]))
            extracted = root / "roundtrip.json"
            extract_aulap2p_course(package, extracted)
            envelope = json.loads(extracted.read_text(encoding="utf-8"))
            self.assertEqual("Incompleto", envelope["course"]["cuestionarios"][0]["titulo"])
            self.assertEqual("Sin opciones", envelope["course"]["cuestionarios"][0]["preguntas"][0]["enunciado"])

    def test_12_local_reader_serves_external_runtime_styles_under_existing_csp(self):
        system = P2RLNReadingSystem(ROOT / "examples" / "native-questionnaire-course.p2rln")
        server = ReaderServer(system)
        server.start()
        try:
            base = f"http://127.0.0.1:{server.port}"
            for path, expected_type in [
                ("/questionnaire.css", "text/css"),
                ("/p2rln-player.css", "text/css"),
                ("/questionnaire-runtime.js", "text/javascript"),
            ]:
                with urllib.request.urlopen(f"{base}{path}?t={server.token}", timeout=5) as response:
                    self.assertEqual(200, response.status)
                    self.assertTrue(response.headers.get("Content-Type", "").startswith(expected_type))
                    csp = response.headers.get("Content-Security-Policy", "")
                    self.assertIn("style-src 'self'", csp)
                    self.assertGreater(len(response.read()), 20)
        finally:
            server.stop()

    @unittest.skipUnless(shutil.which("node"), "Node.js required for browser-runtime verification")
    def test_13_browser_verifier_rejects_tampered_inventory_content(self):
        original = ROOT / "examples" / "native-questionnaire-course.p2rln"
        with tempfile.TemporaryDirectory() as td:
            tampered = Path(td) / "tampered.p2rln"
            with zipfile.ZipFile(original, "r") as source:
                graph = json.loads(source.read("content/graph.json"))
                native_path = next(
                    rep["location"]["path"]
                    for entity in graph["entities"] if entity["type"] == "resource"
                    for rep in entity.get("representations", []) if rep.get("profile") == PROFILE
                )
                with zipfile.ZipFile(tampered, "w", zipfile.ZIP_DEFLATED) as target:
                    for info in source.infolist():
                        data = source.read(info.filename)
                        if info.filename == native_path:
                            data = bytes([data[0] ^ 1]) + data[1:]
                        target.writestr(info.filename, data)
            script = """import fs from 'node:fs';
import {openP2RLNPackageBytes} from './p2rln_reader/web/p2rln-player.js';
const source = fs.readFileSync(process.argv[1]);
const ab = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
try { await openP2RLNPackageBytes(ab); process.exit(7); }
catch (error) { if (!String(error.message).includes('byteDigest mismatch')) process.exit(8); }
"""
            completed = subprocess.run(
                ["node", "--input-type=module", "-e", script, str(tampered)],
                cwd=ROOT, text=True, capture_output=True, check=False,
            )
            self.assertEqual(0, completed.returncode, completed.stderr)


    @unittest.skipUnless(shutil.which("node"), "Node.js required for scoring parity verification")
    def test_14_python_and_browser_scoring_are_identical_for_reference_fixture(self):
        payload = self.payload()
        answers = self.perfect_answers(payload)
        expected = score_questionnaire(payload, answers)
        with tempfile.TemporaryDirectory() as td:
            payload_path = Path(td) / "payload.json"
            answers_path = Path(td) / "answers.json"
            payload_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
            answers_path.write_text(json.dumps(answers, ensure_ascii=False), encoding="utf-8")
            script = """import fs from 'node:fs';
import {scoreQuestionnaire} from './p2rln_reader/web/questionnaire-core.js';
const payload = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
const answers = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
process.stdout.write(JSON.stringify(scoreQuestionnaire(payload, answers)));
"""
            completed = subprocess.run(
                ["node", "--input-type=module", "-e", script, str(payload_path), str(answers_path)],
                cwd=ROOT, text=True, capture_output=True, check=False,
            )
            self.assertEqual(0, completed.returncode, completed.stderr)
            self.assertEqual(expected, json.loads(completed.stdout))


if __name__ == "__main__":
    unittest.main()
