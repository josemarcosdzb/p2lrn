from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

from p2rln_creator.builder import _json_bytes, build_project
from p2rln_creator.project import PROJECT_FILE, add_composite, add_questionnaire, new_project, save_project
from p2rln_ref.validator import ValidationFailure, compute_content_root, content_digest, sha256, validate_graph_semantics, validate_package

ROOT = Path(__file__).resolve().parents[1]
EXAMPLE = ROOT / "examples" / "native-questionnaire.json"


class CompositeCreatorTests(unittest.TestCase):
    def test_creator_composite_reparents_children_and_stays_thin(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project = new_project("Composite")
            save_project(root / PROJECT_FILE, project)
            add_questionnaire(root, project, EXAMPLE, "q1")
            add_questionnaire(root, project, EXAMPLE, "q2")
            self.assertEqual(["act-q1", "act-q2"], project["course"]["children"])
            _, composite = add_composite(
                root,
                project,
                "lesson",
                "Leccion compuesta",
                children=["act-q1", "act-q2"],
            )
            self.assertEqual(["act-lesson"], project["course"]["children"])
            self.assertEqual(["act-q1", "act-q2"], composite["children"])
            save_project(root / PROJECT_FILE, project)
            package = root / "composite.p2rln"
            build_project(root, package, strict_profiles=True)
            validate_package(package, strict_profiles=True, validate_profile_payloads_flag=True)
            with zipfile.ZipFile(package) as zf:
                names = zf.namelist()
                graph = json.loads(zf.read("content/graph.json"))
                composite_out = next(e for e in graph["entities"] if e.get("activityType") == "https://p2rln.org/type/composite")
                resource = next(e for e in graph["entities"] if e.get("id") == composite_out["resource"])
                rep = next(r for r in resource["representations"] if r.get("profile") == "https://p2rln.org/profile/native-composite")
                payload = json.loads(zf.read(rep["location"]["path"]))
            self.assertEqual({"schema", "version", "mode", "completion", "title", "navigation"}, set(payload))
            self.assertNotIn("children", payload)
            self.assertFalse(any(name.endswith(".js") or "renderers/" in name for name in names))
            self.assertLess(package.stat().st_size, 100_000)

    def test_creator_composite_failure_is_transactional(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project = new_project("Composite")
            before = json.dumps(project, sort_keys=True)
            with self.assertRaises(Exception):
                add_composite(root, project, "bad", "Bad", mode="free", navigation="linear")
            self.assertEqual(before, json.dumps(project, sort_keys=True))
            self.assertFalse((root / "assets" / "bad.composite.json").exists())

    def test_creator_rejects_empty_composite_before_mutation(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project = new_project("Composite")
            before = json.dumps(project, sort_keys=True)
            with self.assertRaises(Exception):
                add_composite(root, project, "empty", "Empty")
            self.assertEqual(before, json.dumps(project, sort_keys=True))
            self.assertFalse((root / "assets" / "empty.composite.json").exists())

    def test_reference_validator_rejects_invalid_composite_structure(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project = new_project("Composite")
            add_questionnaire(root, project, EXAMPLE, "q1")
            add_composite(root, project, "lesson", "Lesson", children=["act-q1"])
            save_project(root / PROJECT_FILE, project)
            package = root / "composite.p2rln"
            build_project(root, package, strict_profiles=True)
            with zipfile.ZipFile(package) as zf:
                manifest = json.loads(zf.read("META-INF/manifest.json"))
                graph = json.loads(zf.read("content/graph.json"))
            composite = next(e for e in graph["entities"] if e.get("activityType") == "https://p2rln.org/type/composite")
            composite["children"] = []
            with self.assertRaises(ValidationFailure):
                validate_graph_semantics(graph, manifest)

    def test_reference_validator_requires_embedded_composite_media_type(self):
        package = ROOT / "examples" / "native-composite-course.p2rln"
        with zipfile.ZipFile(package) as zf:
            manifest = json.loads(zf.read("META-INF/manifest.json"))
            graph = json.loads(zf.read("content/graph.json"))
        composite = next(e for e in graph["entities"] if e.get("activityType") == "https://p2rln.org/type/composite")
        resource = next(e for e in graph["entities"] if e.get("id") == composite["resource"])
        rep = next(r for r in resource["representations"] if r.get("profile") == "https://p2rln.org/profile/native-composite")
        rep["mediaType"] = "application/json"
        with self.assertRaises(ValidationFailure):
            validate_graph_semantics(graph, manifest)

    def test_runtime_event_and_composite_state_schemas_accept_reference_shapes(self):
        event_schema = json.loads((ROOT / "schemas" / "runtime-event.schema.json").read_text(encoding="utf-8"))
        state_schema = json.loads((ROOT / "schemas" / "native-composite-state.schema.json").read_text(encoding="utf-8"))
        Draft202012Validator(event_schema, format_checker=FormatChecker()).validate({
            "schema": "https://p2rln.org/schema/runtime-event/1",
            "version": "1",
            "type": "p2rln:complete",
            "timestamp": "2026-09-08T21:00:00Z",
            "context": {"entityId": "urn:test:a"},
            "payload": {"reason": "children"},
        })
        Draft202012Validator(state_schema, format_checker=FormatChecker()).validate({
            "version": "p2rln-composite-state/0.1",
            "currentChild": "urn:test:a",
            "completedChildren": ["urn:test:a"],
            "completed": False,
            "completionReason": None,
            "scores": {},
        })


@unittest.skipUnless(shutil.which("node"), "Node.js required for composite runtime verification")
class CompositeJavascriptTests(unittest.TestCase):
    def run_node(self, script: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["node", "--input-type=module", "-e", script],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )

    def test_runtime_event_envelope_is_versioned_and_forwarded_in_order(self):
        script = r'''
import {createHostAdapter} from './p2rln_reader/web/host-adapter.js';
import {dispatchRuntimeEvent} from './p2rln_reader/web/runtime-events.js';
if(typeof globalThis.CustomEvent==='undefined')globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,options={}){super(type);this.detail=options.detail;}};
const seen=[];const dom=[];
const target=new EventTarget();
target.adapter=createHostAdapter({emitEvent:async(event)=>{seen.push(event.type);}});
target.addEventListener('p2rln:answer',(event)=>dom.push(event.detail));
const first=dispatchRuntimeEvent(target,'p2rln:answer',{questionId:'q1'},{entityId:'urn:test:a'},{clock:()=>1000});
dispatchRuntimeEvent(target,'p2rln:progress',{value:.5},{entityId:'urn:test:a'},{clock:()=>2000});
await new Promise((resolve)=>setTimeout(resolve,0));
if(first.schema!=='https://p2rln.org/schema/runtime-event/1'||first.version!=='1')process.exit(2);
if(first.timestamp!=='1970-01-01T00:00:01.000Z')process.exit(3);
if(dom[0]?.event?.type!=='p2rln:answer'||dom[0]?.questionId!=='q1')process.exit(4);
if(seen.join(',')!=='p2rln:answer,p2rln:progress')process.exit(5);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_native_composite_core_uses_graph_children_only(self):
        script = r'''
import {validateNativeComposite,resolveCompositeChildren,sanitizeCompositeState} from './p2rln_reader/web/native-composite-core.js';
const payload=validateNativeComposite({schema:'https://p2rln.org/schema/native-composite/0.1',version:'0.1',mode:'sequence',completion:'all'});
if(payload.navigation!=='linear')process.exit(2);
const entities=new Map([['urn:a',{id:'urn:a',type:'activity'}],['urn:b',{id:'urn:b',type:'activity'}]]);
const entity={id:'urn:c',type:'activity',children:['urn:a','urn:b']};
const children=resolveCompositeChildren(entity,{entities});if(children.map(x=>x.id).join(',')!=='urn:a,urn:b')process.exit(3);
const state=sanitizeCompositeState({currentChild:'urn:outside',completedChildren:['urn:a','urn:outside'],scores:{'urn:a':{normalized:1},'urn:outside':{normalized:0}}},['urn:a','urn:b']);
if(state.currentChild!=='urn:a'||state.completedChildren.join(',')!=='urn:a'||Object.keys(state.scores).join(',')!=='urn:a')process.exit(4);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_builtins_lazy_load_native_composite_renderer(self):
        source = (ROOT / "p2rln_reader" / "web" / "built-in-renderers.js").read_text(encoding="utf-8")
        player = (ROOT / "p2rln_reader" / "web" / "p2rln-player.js").read_text(encoding="utf-8")
        self.assertIn("import('./renderers/native-composite.js')", source)
        self.assertNotIn("./renderers/native-composite.js", player)
        self.assertIn("renderActivity:", player)

    def test_sequence_state_cannot_restore_a_gap_or_jump_ahead(self):
        script = r'''
import {sanitizeCompositeState} from './p2rln_reader/web/native-composite-core.js';
const state=sanitizeCompositeState({currentChild:'c',completedChildren:['a','c'],scores:{}},['a','b','c'],{mode:'sequence'});
if(state.completedChildren.join(',')!=='a')process.exit(2);
if(state.currentChild!=='b')process.exit(3);
const free=sanitizeCompositeState({currentChild:'c',completedChildren:['a','c'],scores:{}},['a','b','c'],{mode:'free'});
if(free.completedChildren.join(',')!=='a,c'||free.currentChild!=='c')process.exit(4);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_nested_composites_propagate_only_direct_child_completion(self):
        script = r'''
import {CompositeRuntime} from './p2rln_reader/web/composite-runtime.js';
if(typeof globalThis.CustomEvent==='undefined')globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,options={}){super(type);this.detail=options.detail;}};
class ElementMock {constructor(tag){this.tagName=tag;this.children=[];this.disabled=false;this.attributes={};this.className='';this.textContent='';}append(...items){this.children.push(...items);}replaceChildren(...items){this.children=[...items];}setAttribute(name,value){this.attributes[name]=String(value);}addEventListener(){}}
globalThis.document={createElement:(tag)=>new ElementMock(tag)};
const target=new EventTarget();
const entities=new Map([
 ['q',{id:'q',type:'activity',title:{und:'Q'}}],
 ['inner',{id:'inner',type:'activity',title:{und:'Inner'}}],
 ['b',{id:'b',type:'activity',title:{und:'B'}}],
]);
const payload={schema:'https://p2rln.org/schema/native-composite/0.1',version:'0.1',mode:'sequence',completion:'all'};
const outer=new CompositeRuntime(payload,{container:new ElementMock('div'),entity:{id:'outer',type:'activity',children:['inner','b']},package:{entities},renderActivity:async()=>null,eventTarget:target,context:{entityId:'outer'}});
const inner=new CompositeRuntime(payload,{container:new ElementMock('div'),entity:{id:'inner',type:'activity',children:['q']},package:{entities},renderActivity:async()=>null,eventTarget:target,context:{entityId:'inner'}});
await outer.mount();await inner.mount();
target.dispatchEvent(new CustomEvent('p2rln:complete',{detail:{context:{entityId:'q'},event:{payload:{}}}}));
if(inner.state.completedChildren.join(',')!=='q'||!inner.state.completed)process.exit(2);
if(outer.state.completedChildren.join(',')!=='inner')process.exit(3);
outer.destroy();inner.destroy();
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_sequence_ignores_completion_from_non_current_direct_child(self):
        script = r'''
import {CompositeRuntime} from './p2rln_reader/web/composite-runtime.js';
if(typeof globalThis.CustomEvent==='undefined')globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,options={}){super(type);this.detail=options.detail;}};
class ElementMock {
  constructor(tag){this.tagName=tag;this.children=[];this.disabled=false;this.attributes={};this.className='';this.textContent='';}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=[...items];}
  setAttribute(name,value){this.attributes[name]=String(value);}
  addEventListener(){}
}
globalThis.document={createElement:(tag)=>new ElementMock(tag)};
const eventTarget=new EventTarget();
const entities=new Map([
  ['a',{id:'a',type:'activity',title:{und:'A'}}],
  ['b',{id:'b',type:'activity',title:{und:'B'}}],
]);
const runtime=new CompositeRuntime({schema:'https://p2rln.org/schema/native-composite/0.1',version:'0.1',mode:'sequence',completion:'all'}, {
  container:new ElementMock('div'), entity:{id:'c',type:'activity',children:['a','b'],title:{und:'C'}}, package:{entities},
  renderActivity:async()=>null,eventTarget,context:{entityId:'c'},
});
await runtime.mount();
eventTarget.dispatchEvent(new CustomEvent('p2rln:complete',{detail:{context:{entityId:'b'},event:{payload:{}}}}));
if(runtime.state.completedChildren.length!==0)process.exit(2);
eventTarget.dispatchEvent(new CustomEvent('p2rln:complete',{detail:{context:{entityId:'a'},event:{payload:{}}}}));
if(runtime.state.completedChildren.join(',')!=='a')process.exit(3);
runtime.destroy();
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_direct_runtime_adapter_receives_events_without_target_adapter_property(self):
        script = r'''
import {QuestionnaireSession} from './p2rln_reader/web/questionnaire-session.js';
if(typeof globalThis.CustomEvent==='undefined')globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,options={}){super(type);this.detail=options.detail;}};
const seen=[];
const adapter={emitEvent:async(event)=>seen.push(event.type)};
const target=new EventTarget();
const payload={schema:'https://p2rln.org/schema/native-questionnaire/0.4.0',version:'0.4.0',title:'Q',grading:{mode:'embedded-key'},questions:[{id:'q1',type:'single-choice',prompt:'P',points:1,choices:[{id:'a',text:'A'},{id:'b',text:'B'}],solution:{choiceIds:['a']}}]};
const session=new QuestionnaireSession(payload,{eventTarget:target,adapter,autoTiming:false});
await session.mount();
session.replaceAnswer('q1',{choiceIds:['a']});
await new Promise((resolve)=>setTimeout(resolve,0));
for(const expected of ['p2rln:activityready','p2rln:answer','p2rln:progress','p2rln:statechange'])if(!seen.includes(expected))process.exit(2);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_player_top_level_renderer_attribute_is_not_shadowed_by_default(self):
        player = (ROOT / "p2rln_reader" / "web" / "p2rln-player.js").read_text(encoding="utf-8")
        self.assertIn("{requestedRenderer = undefined}", player)
        self.assertNotIn("{requestedRenderer = null}", player)

    def test_browser_verifier_opens_real_composite_package(self):
        package = ROOT / "examples" / "native-composite-course.p2rln"
        script = r'''
import fs from 'node:fs';
import {openP2RLNPackageBytes} from './p2rln_reader/web/p2rln-player.js';
const source=fs.readFileSync(process.argv[1]);
const ab=source.buffer.slice(source.byteOffset,source.byteOffset+source.byteLength);
const pkg=await openP2RLNPackageBytes(ab);
const composite=pkg.graph.entities.find((entity)=>entity.activityType==='https://p2rln.org/type/composite');
if(!composite||composite.children.length!==2)process.exit(2);
const resource=pkg.entities.get(composite.resource);
if(!resource?.representations?.some((rep)=>rep.profile==='https://p2rln.org/profile/native-composite'))process.exit(3);
'''
        result = subprocess.run(
            ["node", "--input-type=module", "-e", script, str(package)],
            cwd=ROOT, text=True, capture_output=True, check=False,
        )
        self.assertEqual(0, result.returncode, result.stderr)

    def test_browser_verifier_rejects_integrity_valid_hierarchy_cycle(self):
        source = ROOT / "examples" / "native-composite-course.p2rln"
        with tempfile.TemporaryDirectory() as td:
            tampered = Path(td) / "cycle.p2rln"
            with zipfile.ZipFile(source) as zf:
                payloads = {name: zf.read(name) for name in zf.namelist()}
            manifest = json.loads(payloads["META-INF/manifest.json"])
            graph = json.loads(payloads["content/graph.json"])
            composite = next(entity for entity in graph["entities"] if entity.get("activityType") == "https://p2rln.org/type/composite")
            composite["children"].append(composite["id"])
            graph_bytes = _json_bytes(graph)
            payloads["content/graph.json"] = graph_bytes
            manifest["graph"]["size"] = len(graph_bytes)
            manifest["graph"]["byteDigest"] = sha256(graph_bytes)
            manifest["graph"]["contentDigest"] = content_digest(graph_bytes, "application/json", "content/graph.json")
            manifest["integrity"]["contentRoot"] = compute_content_root(manifest)
            payloads["META-INF/manifest.json"] = _json_bytes(manifest)
            with zipfile.ZipFile(tampered, "w", compression=zipfile.ZIP_DEFLATED) as zf:
                for name, data in payloads.items():
                    zf.writestr(name, data)
            script = r'''
import fs from 'node:fs';
import {openP2RLNPackageBytes} from './p2rln_reader/web/p2rln-player.js';
const source=fs.readFileSync(process.argv[1]);
const ab=source.buffer.slice(source.byteOffset,source.byteOffset+source.byteLength);
try{await openP2RLNPackageBytes(ab);process.exit(2);}catch(error){if(!String(error.message).includes('Hierarchy cycle')){console.error(error);process.exit(3);}}
'''
            result = subprocess.run(
                ["node", "--input-type=module", "-e", script, str(tampered)],
                cwd=ROOT, text=True, capture_output=True, check=False,
            )
            self.assertEqual(0, result.returncode, result.stderr)


if __name__ == "__main__":
    unittest.main()
