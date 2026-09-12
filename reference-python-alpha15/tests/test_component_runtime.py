from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import unittest
import urllib.request
import zipfile
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

from p2rln_creator.builder import build_project
from p2rln_creator.project import PROJECT_FILE, ProjectError, add_component, new_project, save_project
from p2rln_reader.app import P2RLNReadingSystem, ReaderServer
from p2rln_ref.native_component import (
    ACTIVITY_TYPE,
    MEDIA_TYPE,
    PROFILE,
    NativeComponentError,
    require_runtime_contract,
    validate_component_instance,
)
from p2rln_ref.validator import ValidationFailure, validate_graph_semantics, validate_package

ROOT = Path(__file__).resolve().parents[1]
EXAMPLE = ROOT / "examples" / "native-component-callout.json"
TIMELINE = ROOT / "examples" / "native-component-timeline.json"


class NativeComponentPythonTests(unittest.TestCase):
    def test_component_capability_document_has_its_own_tooling_schema(self):
        schema = json.loads((ROOT / "schemas" / "component-capabilities.schema.json").read_text(encoding="utf-8"))
        document = json.loads((ROOT / "p2rln_reader" / "component-capabilities.json").read_text(encoding="utf-8"))
        errors = list(Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(document))
        self.assertEqual([], errors)

    def test_component_instance_schema_and_contract_are_validated(self):
        payload = json.loads(EXAMPLE.read_text(encoding="utf-8"))
        self.assertEqual("1", validate_component_instance(payload)["component"]["dataVersion"])
        payload["component"]["runtimeContractVersion"] = "2"
        self.assertEqual("2", validate_component_instance(payload)["component"]["runtimeContractVersion"])
        with self.assertRaises(NativeComponentError):
            require_runtime_contract(payload)

    def test_creator_add_component_is_thin_and_transactional(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project = new_project("Components")
            before = json.dumps(project, sort_keys=True)
            with self.assertRaises(ProjectError):
                add_component(root, project, EXAMPLE, "notice", parent="missing-parent")
            self.assertEqual(before, json.dumps(project, sort_keys=True))
            self.assertFalse((root / "assets" / "notice.json").exists())

            _, activity = add_component(root, project, EXAMPLE, "notice")
            self.assertEqual(ACTIVITY_TYPE, activity["activityType"])
            save_project(root / PROJECT_FILE, project)
            package = root / "component.p2rln"
            build_project(root, package, strict_profiles=True)
            validate_package(package, strict_profiles=True, validate_profile_payloads_flag=True)
            with zipfile.ZipFile(package) as zf:
                names = zf.namelist()
                graph = json.loads(zf.read("content/graph.json"))
                component_activity = next(e for e in graph["entities"] if e.get("activityType") == ACTIVITY_TYPE)
                resource = next(e for e in graph["entities"] if e.get("id") == component_activity["resource"])
                rep = next(r for r in resource["representations"] if r.get("profile") == PROFILE)
                self.assertEqual(MEDIA_TYPE, rep["mediaType"])
                self.assertEqual("embedded", rep["location"]["type"])
                self.assertEqual("1", json.loads(zf.read(rep["location"]["path"]))["component"]["dataVersion"])
                self.assertFalse(any(name.endswith(".js") or "renderers/" in name for name in names))
            self.assertLess(package.stat().st_size, 100_000)

    def test_creator_cli_add_component_builds_strict_package(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project_root = root / "course"
            package = root / "course.p2rln"
            commands = [
                ["python", "-m", "p2rln_creator.cli", "init", str(project_root), "--title", "Component CLI"],
                ["python", "-m", "p2rln_creator.cli", "add-component", str(project_root), str(EXAMPLE), "--key", "notice"],
                ["python", "-m", "p2rln_creator.cli", "build", str(project_root), str(package), "--strict-profiles"],
            ]
            for command in commands:
                completed = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, check=False)
                self.assertEqual(0, completed.returncode, completed.stderr or completed.stdout)
            validate_package(package, strict_profiles=True, validate_profile_payloads_flag=True)

    def test_timeline_component_build_is_thin_and_strict(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project = new_project("Timeline")
            add_component(root, project, TIMELINE, "timeline")
            save_project(root / PROJECT_FILE, project)
            package = root / "timeline.p2rln"
            build_project(root, package, strict_profiles=True)
            validate_package(package, strict_profiles=True, validate_profile_payloads_flag=True)
            with zipfile.ZipFile(package) as zf:
                self.assertFalse(any(name.endswith(".js") for name in zf.namelist()))
                self.assertEqual(3, len(zf.namelist()))
            self.assertLess(package.stat().st_size, 100_000)

    def test_reference_validator_requires_exact_component_representation(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project = new_project("Components")
            add_component(root, project, EXAMPLE, "notice")
            save_project(root / PROJECT_FILE, project)
            package = root / "component.p2rln"
            build_project(root, package, strict_profiles=True)
            with zipfile.ZipFile(package) as zf:
                manifest = json.loads(zf.read("META-INF/manifest.json"))
                graph = json.loads(zf.read("content/graph.json"))
            activity = next(e for e in graph["entities"] if e.get("activityType") == ACTIVITY_TYPE)
            resource = next(e for e in graph["entities"] if e.get("id") == activity["resource"])
            rep = next(r for r in resource["representations"] if r.get("profile") == PROFILE)
            rep["mediaType"] = "application/json"
            with self.assertRaises(ValidationFailure):
                validate_graph_semantics(graph, manifest)

    def test_reader_plans_native_component_runtime(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project = new_project("Components")
            add_component(root, project, EXAMPLE, "notice")
            save_project(root / PROJECT_FILE, project)
            package = root / "component.p2rln"
            build_project(root, package, strict_profiles=True)
            system = P2RLNReadingSystem(package)
            activity = next(e for e in system.reader.graph["entities"] if e.get("activityType") == ACTIVITY_TYPE)
            target = system.view_target(activity["id"], "test")
            self.assertEqual("ready", target.status)
            self.assertEqual("native-component", target.kind)
            self.assertEqual("p2rln-native-component", target.runtime)

    def test_future_runtime_contract_is_valid_and_preservable_but_not_claimed_deliverable(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            source = root / "future.json"
            payload = json.loads(EXAMPLE.read_text(encoding="utf-8"))
            payload["component"]["runtimeContractVersion"] = "2"
            source.write_text(json.dumps(payload), encoding="utf-8")
            project = new_project("Future")
            add_component(root, project, source, "future")
            save_project(root / PROJECT_FILE, project)
            package = root / "future.p2rln"
            build_project(root, package, strict_profiles=True)
            validate_package(package, strict_profiles=True, validate_profile_payloads_flag=True)
            system = P2RLNReadingSystem(package)
            activity = next(e for e in system.reader.graph["entities"] if e.get("activityType") == ACTIVITY_TYPE)
            target = system.view_target(activity["id"], "test")
            self.assertEqual("runtime-required", target.status)
            self.assertTrue(target.metadata["preservable"])
            self.assertIn("runtime contract 2", target.reason)


@unittest.skipUnless(shutil.which("node"), "Node.js required for native component runtime verification")
class NativeComponentJavascriptTests(unittest.TestCase):
    def run_node(self, script: str, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["node", "--input-type=module", "-e", script, *args],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )

    def test_component_registry_migrates_deterministically_without_mutating_source(self):
        script = r'''
import {createDefaultComponentRegistry,CALLOUT_COMPONENT} from './p2rln_reader/web/component-registry.js';
const registry=createDefaultComponentRegistry();
const source={schema:'https://p2rln.org/schema/native-component/0.1',version:'0.1',component:{id:CALLOUT_COMPONENT,componentVersion:'1',dataVersion:'1',runtimeContractVersion:'1'},data:{heading:'H',text:'Body',tone:'note'}};
const before=JSON.stringify(source);
const a=await registry.prepare(source,{entityId:'urn:a'});const b=await registry.prepare(source,{entityId:'urn:a'});
if(JSON.stringify(source)!==before)process.exit(2);
if(a.instance.component.dataVersion!=='2'||a.instance.data.body!=='Body'||a.instance.data.text!==undefined)process.exit(3);
if(JSON.stringify(a.instance)!==JSON.stringify(b.instance)||!a.migrated)process.exit(4);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_component_registry_rejects_unknown_version_contract_and_missing_migration(self):
        script = r'''
import {ComponentRegistry} from './p2rln_reader/web/component-registry.js';
const r=new ComponentRegistry();
r.register({id:'urn:test:c',componentVersion:'1',runtimeContractVersion:'1',rendererId:'urn:test:r',targetDataVersion:'2',supportedDataVersions:['2'],migrations:[],validateData:()=>true});
const make=(cv='1',dv='1',rv='1')=>({component:{id:'urn:test:c',componentVersion:cv,dataVersion:dv,runtimeContractVersion:rv},data:{}});
for(const [instance,code] of [[make('2'),'P2RLN_COMPONENT_VERSION_UNAVAILABLE'],[make('1','1','2'),'P2RLN_COMPONENT_CONTRACT_MISMATCH'],[make(),'P2RLN_COMPONENT_MIGRATION_UNAVAILABLE']]){
 try{await r.prepare(instance);process.exit(2);}catch(error){if(error.code!==code){console.error(error);process.exit(3);}}
}
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_internal_component_renderer_cannot_be_selected_by_package_or_embed(self):
        script = r'''
import {RendererRegistry,CALLOUT_COMPONENT_RENDERER} from './p2rln_reader/web/renderer-registry.js';
const r=new RendererRegistry();
r.register({id:CALLOUT_COMPONENT_RENDERER,version:'1',selectable:false,profiles:['urn:p'],mediaTypes:['application/json'],load:async()=>({render(){}})});
const rep={id:'rep',profile:'urn:p',mediaType:'application/json',role:'primary'};
try{await r.select({representations:[rep],requestedRenderer:CALLOUT_COMPONENT_RENDERER});process.exit(2);}catch(error){if(error.code!=='P2RLN_RENDERER_NOT_SELECTABLE')process.exit(3);}
const entity={extensions:{'https://p2rln.org/ext/renderer-preference/1':{preferred:CALLOUT_COMPONENT_RENDERER,required:false}}};
if(await r.select({representations:[rep],entity}))process.exit(4);
const descriptor=r.get(CALLOUT_COMPONENT_RENDERER);const module=await r.load({descriptor,representation:rep,entity,resource:null,selection:{source:'component-registry',required:true}});if(typeof module.render!=='function')process.exit(5);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_native_component_router_delegates_only_through_component_registry(self):
        script = r'''
import {RendererRegistry} from './p2rln_reader/web/renderer-registry.js';
import {ComponentRegistry} from './p2rln_reader/web/component-registry.js';
import {render} from './p2rln_reader/web/renderers/native-component.js';
const rendererRegistry=new RendererRegistry();let rendered=null;
rendererRegistry.register({id:'urn:test:impl',selectable:false,load:async()=>({render:async({componentInstance})=>{rendered=componentInstance;return {destroy(){}};}})});
const componentRegistry=new ComponentRegistry();
componentRegistry.register({id:'urn:test:component',componentVersion:'1',rendererId:'urn:test:impl',targetDataVersion:'2',migrations:[{from:'1',to:'2',migrate:(data)=>({body:data.text})}],validateData:(data)=>data.body==='ok'});
const source={schema:'https://p2rln.org/schema/native-component/0.1',version:'0.1',component:{id:'urn:test:component',componentVersion:'1',dataVersion:'1',runtimeContractVersion:'1'},data:{text:'ok'}};
const runtime=await render({container:{replaceChildren(){}},bytes:new TextEncoder().encode(JSON.stringify(source)),decodeJson:(bytes)=>JSON.parse(new TextDecoder().decode(bytes)),representation:{profile:'x',mediaType:'x'},entity:{},resource:{},componentRegistry,rendererRegistry,context:{}});
if(rendered?.component?.dataVersion!=='2'||rendered?.data?.body!=='ok'||typeof runtime.destroy!=='function')process.exit(2);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_player_and_builtins_keep_component_implementation_lazy(self):
        player = (ROOT / "p2rln_reader" / "web" / "p2rln-player.js").read_text(encoding="utf-8")
        builtins = (ROOT / "p2rln_reader" / "web" / "built-in-renderers.js").read_text(encoding="utf-8")
        self.assertNotIn("./renderers/component-callout.js", player)
        self.assertIn("import('./renderers/native-component.js')", builtins)
        self.assertIn("import('./renderers/component-callout.js')", builtins)
        self.assertIn("import('./renderers/component-timeline.js')", builtins)
        self.assertIn("selectable: false", builtins)
        reader_app = (ROOT / "p2rln_reader" / "web" / "app.js").read_text(encoding="utf-8")
        self.assertIn("'native-composite', 'native-component'", reader_app)

    def test_browser_verifier_opens_real_native_component_package(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project = new_project("Components")
            add_component(root, project, EXAMPLE, "notice")
            save_project(root / PROJECT_FILE, project)
            package = root / "component.p2rln"
            build_project(root, package, strict_profiles=True)
            script = r'''
import fs from 'node:fs';
import {openP2RLNPackageBytes} from './p2rln_reader/web/p2rln-player.js';
const source=fs.readFileSync(process.argv[1]);const ab=source.buffer.slice(source.byteOffset,source.byteOffset+source.byteLength);
const pkg=await openP2RLNPackageBytes(ab);const activity=pkg.graph.entities.find((e)=>e.activityType==='https://p2rln.org/type/component');if(!activity)process.exit(2);const resource=pkg.entities.get(activity.resource);if(!resource?.representations?.some((r)=>r.profile==='https://p2rln.org/profile/native-component'))process.exit(3);
'''
            result = self.run_node(script, str(package))
            self.assertEqual(0, result.returncode, result.stderr)

    def test_built_in_component_renders_real_package_through_router_and_registry(self):
        package = ROOT / "examples" / "native-component-course.p2rln"
        script = r'''
import fs from 'node:fs';
import {openP2RLNPackageBytes,defaultRendererRegistry,defaultComponentRegistry} from './p2rln_reader/web/p2rln-player.js';
import {COMPONENT_ROUTER_RENDERER} from './p2rln_reader/web/renderer-registry.js';
class ElementMock{constructor(tag){this.tagName=tag;this.children=[];this.className='';this.textContent='';this.parent=null;}append(...items){for(const item of items){item.parent=this;this.children.push(item);}}replaceChildren(...items){this.children=[];this.append(...items);}remove(){if(this.parent)this.parent.children=this.parent.children.filter((x)=>x!==this);}}
globalThis.HTMLElement=ElementMock;globalThis.document={createElement:(tag)=>new ElementMock(tag)};
if(typeof globalThis.CustomEvent==='undefined')globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,options={}){super(type);this.detail=options.detail;}};
const source=fs.readFileSync(process.argv[1]);const ab=source.buffer.slice(source.byteOffset,source.byteOffset+source.byteLength);const pkg=await openP2RLNPackageBytes(ab);
const entity=pkg.graph.entities.find((e)=>e.activityType==='https://p2rln.org/type/component');const resource=pkg.entities.get(entity.resource);const rep=resource.representations[0];
const candidate=await defaultRendererRegistry.select({representations:[rep],entity,resource});if(candidate?.descriptor?.id!==COMPONENT_ROUTER_RENDERER)process.exit(2);
const module=await defaultRendererRegistry.load(candidate,{entityId:entity.id});const bytes=await pkg.zip.read(rep.location.path);const container=new ElementMock('main');
const runtime=await module.render({container,bytes,representation:rep,entity,resource,package:pkg,decodeJson:(b)=>JSON.parse(new TextDecoder().decode(b)),eventTarget:new EventTarget(),adapter:null,componentRegistry:defaultComponentRegistry,rendererRegistry:defaultRendererRegistry,context:{entityId:entity.id}});
const article=container.children[0];if(article?.tagName!=='article'||article.children.at(-1)?.textContent!=='Comprueba que has guardado tu trabajo antes de cerrar la actividad.')process.exit(3);if(!article.className.includes('tone-note'))process.exit(4);runtime.destroy();
'''
        result = self.run_node(script, str(package))
        self.assertEqual(0, result.returncode, result.stderr)

    def test_timeline_component_renders_through_same_router_and_registry(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project = new_project("Timeline")
            add_component(root, project, TIMELINE, "timeline")
            save_project(root / PROJECT_FILE, project)
            package = root / "timeline.p2rln"
            build_project(root, package, strict_profiles=True)
            script = r'''
import fs from 'node:fs';
import {openP2RLNPackageBytes,defaultRendererRegistry,defaultComponentRegistry} from './p2rln_reader/web/p2rln-player.js';
import {COMPONENT_ROUTER_RENDERER} from './p2rln_reader/web/renderer-registry.js';
class ElementMock{constructor(tag){this.tagName=tag;this.children=[];this.className='';this.textContent='';this.parent=null;}append(...items){for(const item of items){item.parent=this;this.children.push(item);}}replaceChildren(...items){this.children=[];this.append(...items);}remove(){if(this.parent)this.parent.children=this.parent.children.filter((x)=>x!==this);}}
globalThis.HTMLElement=ElementMock;globalThis.document={createElement:(tag)=>new ElementMock(tag)};
if(typeof globalThis.CustomEvent==='undefined')globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,options={}){super(type);this.detail=options.detail;}};
const source=fs.readFileSync(process.argv[1]);const ab=source.buffer.slice(source.byteOffset,source.byteOffset+source.byteLength);const pkg=await openP2RLNPackageBytes(ab);
const entity=pkg.graph.entities.find((e)=>e.activityType==='https://p2rln.org/type/component');const resource=pkg.entities.get(entity.resource);const rep=resource.representations[0];
const candidate=await defaultRendererRegistry.select({representations:[rep],entity,resource});if(candidate?.descriptor?.id!==COMPONENT_ROUTER_RENDERER)process.exit(2);
const module=await defaultRendererRegistry.load(candidate,{entityId:entity.id});const bytes=await pkg.zip.read(rep.location.path);const container=new ElementMock('main');
const runtime=await module.render({container,bytes,representation:rep,entity,resource,package:pkg,decodeJson:(b)=>JSON.parse(new TextDecoder().decode(b)),eventTarget:new EventTarget(),adapter:null,componentRegistry:defaultComponentRegistry,rendererRegistry:defaultRendererRegistry,context:{entityId:entity.id}});
const section=container.children[0];const list=section?.children?.[0];if(section?.tagName!=='section'||list?.tagName!=='ol'||list.children.length!==3)process.exit(3);if(list.children[0].children[1]?.textContent!=='Propuesta de la Web')process.exit(4);runtime.destroy();
'''
            result = self.run_node(script, str(package))
            self.assertEqual(0, result.returncode, result.stderr)

    def test_reader_serves_component_runtime_modules(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project = new_project("Components")
            add_component(root, project, EXAMPLE, "notice")
            save_project(root / PROJECT_FILE, project)
            package = root / "component.p2rln"
            build_project(root, package, strict_profiles=True)
            system = P2RLNReadingSystem(package)
            server = ReaderServer(system)
            server.start()
            try:
                base = f"http://127.0.0.1:{server.port}"
                for path in [
                    "/component-registry.js",
                    "/native-component-core.js",
                    "/renderers/native-component.js",
                    "/renderers/component-callout.js",
                    "/renderers/component-timeline.js",
                    "/component.css",
                ]:
                    with urllib.request.urlopen(f"{base}{path}?t={server.token}", timeout=5) as response:
                        self.assertEqual(200, response.status)
                        self.assertGreater(len(response.read()), 20)
            finally:
                server.stop()


if __name__ == "__main__":
    unittest.main()
