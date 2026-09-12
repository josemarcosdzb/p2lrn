from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import unittest
import urllib.request
import zipfile
from pathlib import Path

from p2rln_creator.builder import build_project
from p2rln_creator.project import PROJECT_FILE, RENDERER_HINT_EXTENSION, add_questionnaire, new_project, save_project
from p2rln_reader import P2RLNReadingSystem
from p2rln_ref.validator import ValidationFailure, validate_graph_semantics
from p2rln_reader.app import ReaderServer

ROOT = Path(__file__).resolve().parents[1]
EXAMPLE = ROOT / "examples" / "native-questionnaire.json"
MEMORY = "https://p2rln.org/renderer/questionnaire/memory"


@unittest.skipUnless(shutil.which("node"), "Node.js required for modular-runtime verification")
class ModularRuntimeTests(unittest.TestCase):
    def run_node(self, script: str, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["node", "--input-type=module", "-e", script, *args],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )

    def test_01_renderer_registry_prefers_hint_but_marks_it_optional(self):
        script = r'''
import {RendererRegistry, RENDERER_HINT_EXTENSION} from './p2rln_reader/web/renderer-registry.js';
const registry = new RendererRegistry();
registry.register({id:'https://p2rln.org/r/standard', priority:100, mediaTypes:['application/test'], load:async()=>({render(){}})});
registry.register({id:'https://p2rln.org/r/game', priority:1, mediaTypes:['application/test'], load:async()=>({render(){}})});
const rep={id:'r', role:'primary', mediaType:'application/test'};
const entity={extensions:{[RENDERER_HINT_EXTENSION]:{preferred:'https://p2rln.org/r/game',version:'1',required:false}}};
const selected=await registry.select({representations:[rep],entity,resource:{},roleRank:()=>1});
if(selected.descriptor.id!=='https://p2rln.org/r/game')process.exit(2);
if(selected.selection.source!=='hint'||selected.selection.required!==false)process.exit(3);
const fallback=await registry.select({representations:[rep],entity,resource:{},roleRank:()=>1,excludeRendererIds:[selected.descriptor.id]});
if(fallback.descriptor.id!=='https://p2rln.org/r/standard')process.exit(4);
const mismatch={extensions:{[RENDERER_HINT_EXTENSION]:{preferred:'https://p2rln.org/r/game',version:'2',required:false}}};
const versionFallback=await registry.select({representations:[rep],entity:mismatch,resource:{},roleRank:()=>1});if(versionFallback.descriptor.id!=='https://p2rln.org/r/standard')process.exit(5);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_02_permission_gate_denies_ungranted_renderer_capabilities(self):
        script = r'''
import {RendererRegistry} from './p2rln_reader/web/renderer-registry.js';
const registry = new RendererRegistry();
const descriptor=registry.register({id:'https://p2rln.org/r/camera',mediaTypes:['application/test'],permissions:['camera'],load:async()=>({render(){}})});
const candidate={descriptor,representation:{id:'r',mediaType:'application/test'},selection:{required:true}};
try { await registry.load(candidate); process.exit(2); } catch(error) { if(error.code!=='P2RLN_PERMISSION_DENIED') { console.error(error); process.exit(3); } }
registry.setPermissionPolicy((permission)=>permission==='camera');
const module=await registry.load(candidate); if(typeof module.render!=='function')process.exit(4);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_03_game_core_covers_all_ported_2d_and_3d_renderers_without_partial_conversion(self):
        script = r'''
import {buildQuestionnaireGame} from './p2rln_reader/web/questionnaire-games-core.js';
import {MEMORY_RENDERER,MATCHING_RENDERER,ORDERING_RENDERER,TRUE_FALSE_RENDERER,WORD_SEARCH_RENDERER,CROSSWORD_RENDERER,ROSCO_RENDERER,THREE_D_RENDERER} from './p2rln_reader/web/renderer-registry.js';
const base=(title,questions)=>({schema:'https://p2rln.org/schema/native-questionnaire/0.4.0',version:'0.4.0',title,grading:{mode:'embedded-key'},questions});
const choice=(id,answer)=>({id,type:'single-choice',prompt:`Pista ${id}`,points:1,required:true,choices:[{id:'a',text:answer},{id:'b',text:`Error ${id}`}],solution:{choiceIds:['a']}});
const lexical=base('Lexical',[choice('q1','CASA'),choice('q2','SACO'),choice('q3','COSA'),choice('q4','ASCO')]);
for(const id of [MEMORY_RENDERER,MATCHING_RENDERER,WORD_SEARCH_RENDERER,CROSSWORD_RENDERER,ROSCO_RENDERER]){const game=buildQuestionnaireGame(lexical,id,{seedSource:'test'});if(!game.compatible){console.error(id,game.reasons);process.exit(10);}}
const ordering=base('Ordering',[{id:'o1',type:'ordering',prompt:'Ordena',points:1,required:true,items:[{id:'a',text:'Uno'},{id:'b',text:'Dos'},{id:'c',text:'Tres'}],solution:{order:['a','b','c']}}]);
if(!buildQuestionnaireGame(ordering,ORDERING_RENDERER).compatible)process.exit(11);
const tf=(id,correct)=>({id,type:'true-false',prompt:`VF ${id}`,points:1,required:true,choices:[{id:'t',text:'Verdadero'},{id:'f',text:'Falso'}],solution:{choiceIds:[correct?'t':'f']}});
const trueFalse=base('VF',[tf('v1',true),tf('v2',false)]);if(!buildQuestionnaireGame(trueFalse,TRUE_FALSE_RENDERER).compatible)process.exit(12);
const mixed3d=base('3D',[ordering.questions[0],{id:'m1',type:'matching',prompt:'Relaciona',points:1,required:true,left:[{id:'l1',text:'CPU'},{id:'l2',text:'RAM'}],right:[{id:'r1',text:'Procesador'},{id:'r2',text:'Memoria'}],solution:{pairs:[{left:'l1',right:'r1'},{left:'l2',right:'r2'}]}}]);
if(!buildQuestionnaireGame(mixed3d,THREE_D_RENDERER,{seedSource:'test'}).compatible)process.exit(13);
const incompatible=base('Mixed',[choice('x','CASA'),ordering.questions[0]]);const partial=buildQuestionnaireGame(incompatible,MEMORY_RENDERER);if(partial.compatible||!partial.reasons.length)process.exit(14);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_04_creator_renderer_hint_is_declarative_and_does_not_bundle_runtime(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project = new_project("Thin")
            save_project(root / PROJECT_FILE, project)
            _, activity = add_questionnaire(root, project, EXAMPLE, "quiz", renderer=MEMORY, renderer_version="1")
            self.assertEqual(MEMORY, activity["extensions"][RENDERER_HINT_EXTENSION]["preferred"])
            self.assertEqual("1", activity["extensions"][RENDERER_HINT_EXTENSION]["version"])
            save_project(root / PROJECT_FILE, project)
            package = root / "thin.p2rln"
            build_project(root, package, strict_profiles=True)
            with zipfile.ZipFile(package) as zf:
                names = zf.namelist()
                self.assertFalse(any(name.endswith(".js") or "renderers/" in name for name in names))
                graph = json.loads(zf.read("content/graph.json"))
            activity_out = next(e for e in graph["entities"] if e["type"] == "activity")
            self.assertEqual(MEMORY, activity_out["extensions"][RENDERER_HINT_EXTENSION]["preferred"])
            self.assertEqual("1", activity_out["extensions"][RENDERER_HINT_EXTENSION]["version"])
            self.assertLess(package.stat().st_size, 100_000)

    def test_05_invalid_renderer_hint_is_rejected_before_project_mutation(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project = new_project("Thin")
            before = json.dumps(project, sort_keys=True)
            with self.assertRaises(Exception):
                add_questionnaire(root, project, EXAMPLE, "quiz", renderer="relative-renderer")
            self.assertEqual(before, json.dumps(project, sort_keys=True))

    def test_06_player_has_no_eager_questionnaire_runtime_or_game_renderer_import(self):
        source = (ROOT / "p2rln_reader" / "web" / "p2rln-player.js").read_text(encoding="utf-8")
        self.assertNotIn("./questionnaire-runtime.js", source)
        self.assertNotIn("./renderers/questionnaire-memory.js", source)
        builtins = (ROOT / "p2rln_reader" / "web" / "built-in-renderers.js").read_text(encoding="utf-8")
        self.assertIn("import('./renderers/questionnaire-memory.js')", builtins)
        self.assertIn("import('./renderers/questionnaire-3d.js')", builtins)

    def test_07_local_reader_serves_lazy_renderer_modules_and_package_endpoint(self):
        system = P2RLNReadingSystem(ROOT / "examples" / "native-questionnaire-course.p2rln")
        server = ReaderServer(system)
        server.start()
        try:
            base = f"http://127.0.0.1:{server.port}"
            for path in [
                "/renderer-registry.js",
                "/dependency-registry.js",
                "/built-in-renderers.js",
                "/questionnaire-games-core.js",
                "/renderers/questionnaire-memory.js",
                "/renderers/questionnaire-3d.js",
                "/questionnaire-games.css",
                "/runtime-events.js",
                "/host-adapter.js",
                "/native-composite-core.js",
                "/composite-runtime.js",
                "/renderers/native-composite.js",
                "/composite.css",
            ]:
                with urllib.request.urlopen(f"{base}{path}?t={server.token}", timeout=5) as response:
                    self.assertEqual(200, response.status)
                    self.assertGreater(len(response.read()), 20)
            with urllib.request.urlopen(f"{base}/package.p2rln?t={server.token}", timeout=5) as response:
                self.assertEqual("application/vnd.p2rln+zip", response.headers.get("Content-Type"))
                self.assertEqual(system.package.read_bytes(), response.read())
        finally:
            server.stop()

    def test_08_all_runtime_javascript_files_pass_node_syntax_check(self):
        js_files = sorted((ROOT / "p2rln_reader" / "web").rglob("*.js"))
        failures = []
        for path in js_files:
            completed = subprocess.run(["node", "--check", str(path)], text=True, capture_output=True, check=False)
            if completed.returncode:
                failures.append(f"{path.relative_to(ROOT)}: {completed.stderr}")
        self.assertFalse(failures, "\n".join(failures))

    def test_09_webgl_cube_buffer_contains_exactly_36_vertices(self):
        import re
        source = (ROOT / "p2rln_reader" / "web" / "renderers" / "questionnaire-3d.js").read_text(encoding="utf-8")
        match = re.search(r"new Float32Array\(\[([^\]]+)\]\)", source)
        self.assertIsNotNone(match)
        values = [part for part in match.group(1).split(",") if part.strip()]
        self.assertEqual(108, len(values))
        self.assertEqual(36, len(values) // 3)

    def test_10_reference_validator_checks_renderer_preference_extension(self):
        package = ROOT / "examples" / "native-questionnaire-games-course.p2rln"
        with zipfile.ZipFile(package) as zf:
            manifest = json.loads(zf.read("META-INF/manifest.json"))
            graph = json.loads(zf.read("content/graph.json"))

        validate_graph_semantics(graph, manifest)
        activity = next(entity for entity in graph["entities"] if entity["type"] == "activity")
        activity["extensions"][RENDERER_HINT_EXTENSION] = {
            "preferred": MEMORY,
            "version": "",
            "required": False,
        }
        with self.assertRaises(ValidationFailure):
            validate_graph_semantics(graph, manifest)

        del activity["extensions"][RENDERER_HINT_EXTENSION]
        resource = next(entity for entity in graph["entities"] if entity["type"] == "resource")
        resource.setdefault("extensions", {})[RENDERER_HINT_EXTENSION] = {
            "preferred": MEMORY
        }
        with self.assertRaises(ValidationFailure):
            validate_graph_semantics(graph, manifest)

    def test_11_shared_session_enforces_question_timing_and_migrates_v01_state(self):
        script = r'''
import {QuestionnaireSession} from './p2rln_reader/web/questionnaire-session.js';
let now=1000;
const question=(id,seconds)=>({id,type:'single-choice',prompt:id,points:1,required:true,timeLimitSeconds:seconds,choices:[{id:'a',text:'A'},{id:'b',text:'B'}],solution:{choiceIds:['a']}});
const payload={schema:'https://p2rln.org/schema/native-questionnaire/0.4.0',version:'0.4.0',title:'Timed',grading:{mode:'embedded-key'},questions:[question('q1',1),question('q2',2)]};
const legacy={version:'p2rln-questionnaire-state/0.1',currentQuestion:0,questionOrder:['q1','q2'],answers:{q1:{choiceIds:['a']}},completed:false,attemptsCompleted:0};
const adapter={loadState:async()=>legacy,saveState:async()=>{}};
const session=new QuestionnaireSession(payload,{clock:()=>now,autoTiming:false,supportsQuestionTiming:true,adapter});
await session.mount();
if(session.state.version!=='p2rln-questionnaire-state/0.2')process.exit(2);
if(session.state.answers.q1.choiceIds[0]!=='a')process.exit(3);
if(session.state.timing.questionDeadlineAt.q1!==2000)process.exit(4);
now=2100;await session.checkTiming();
if(session.state.currentQuestion!==1||!session.state.timing.expiredQuestions.includes('q1'))process.exit(5);
if(session.state.timing.questionDeadlineAt.q2!==4100)process.exit(6);
now=4200;await session.checkTiming();
if(!session.state.completed||session.state.completionReason!=='question-time-limit')process.exit(7);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_12_game_renderer_rejects_per_question_timing_without_reinterpreting_it(self):
        script = r'''
import {QuestionnaireGameRuntime} from './p2rln_reader/web/questionnaire-game-runtime.js';
const payload={schema:'https://p2rln.org/schema/native-questionnaire/0.4.0',version:'0.4.0',title:'Timed',grading:{mode:'embedded-key'},questions:[{id:'q1',type:'single-choice',prompt:'P',points:1,timeLimitSeconds:1,choices:[{id:'a',text:'A'},{id:'b',text:'B'}],solution:{choiceIds:['a']}}]};
const runtime=new QuestionnaireGameRuntime(payload,{rendererId:'https://p2rln.org/renderer/questionnaire/memory',autoTiming:false});
try{await runtime.mount(null);process.exit(2);}catch(error){if(error.code!=='P2RLN_TIMING_UNSUPPORTED')process.exit(3);}
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_13_questionnaire_state_schema_accepts_reference_v02_shape(self):
        from jsonschema import Draft202012Validator
        schema = json.loads((ROOT / "schemas" / "native-questionnaire-state.schema.json").read_text(encoding="utf-8"))
        state = {
            "version": "p2rln-questionnaire-state/0.2",
            "currentQuestion": 0,
            "questionOrder": ["q1"],
            "answers": {},
            "completed": False,
            "attemptsCompleted": 0,
            "completionReason": None,
            "gameState": {},
            "timing": {
                "attemptStartedAt": 1000,
                "attemptDeadlineAt": 61000,
                "questionStartedAt": {},
                "questionDeadlineAt": {},
                "expiredQuestions": [],
            },
        }
        Draft202012Validator(schema).validate(state)


if __name__ == "__main__":
    unittest.main()
