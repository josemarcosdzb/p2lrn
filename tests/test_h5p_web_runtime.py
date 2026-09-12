from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fake_h5p_standalone(root: Path) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    (root / "styles").mkdir(exist_ok=True)
    (root / "main.bundle.js").write_text(
        "globalThis.H5PStandalone={H5P:class{constructor(){return Promise.resolve('fake')}}};\n",
        encoding="utf-8",
    )
    (root / "frame.bundle.js").write_text("globalThis.H5P=globalThis.H5P||{};\n", encoding="utf-8")
    (root / "styles" / "h5p.css").write_text(".h5p-content{display:block}\n", encoding="utf-8")
    return root


@unittest.skipUnless(shutil.which("node"), "Node.js required")
class H5PWebRuntimeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        result = subprocess.run(
            ["python3", "tools/build_web_sdk.py"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        if result.returncode:
            raise RuntimeError(result.stderr or result.stdout)

    def run_node(self, script: str, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["node", "--input-type=module", "-e", script, *args],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )

    def test_h5p_package_inspection_uses_exact_library_versions(self):
        script = r'''
import {inspectH5PPackage} from './p2rln_reader/web/h5p-package.js';
const enc=new TextEncoder();
const files=new Map([
 ['h5p.json',enc.encode(JSON.stringify({title:'Demo',mainLibrary:'H5P.Demo',preloadedDependencies:[{machineName:'H5P.Demo',majorVersion:1,minorVersion:2}]}))],
 ['content/content.json',enc.encode('{}')],
 ['H5P.Demo/library.json',enc.encode(JSON.stringify({machineName:'H5P.Demo',majorVersion:1,minorVersion:1,patchVersion:0,runnable:1}))],
]);
const nested={names:()=>[...files.keys()],read:async(path)=>files.get(path)};
const inspected=await inspectH5PPackage(nested);
if(inspected.dependencyMode!=='external'||inspected.missing.length!==1)process.exit(2);
files.set('H5P.Demo/library.json',enc.encode(JSON.stringify({machineName:'H5P.Demo',majorVersion:1,minorVersion:2,patchVersion:0,runnable:1})));
const exact=await inspectH5PPackage(nested);
if(exact.dependencyMode!=='bundled'||exact.missing.length!==0||exact.libraryCount!==1)process.exit(3);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_h5p_renderer_is_registered_for_embedded_original_package(self):
        script = r'''
globalThis.HTMLElement=class {};
import {defaultRendererRegistry} from './p2rln_reader/web/p2rln-player.js';
const rep={id:'r',profile:'https://p2rln.org/profile/h5p',role:'original-package',mediaType:'application/zip',location:{type:'embedded',path:'packages/h5p.zip'}};
const candidate=await defaultRendererRegistry.select({representations:[rep],entity:{id:'a'},resource:{id:'r'}});
if(candidate?.descriptor?.id!=='https://p2rln.org/renderer/h5p/runtime')process.exit(2);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_h5p_runtime_url_requires_isolated_origin(self):
        script = r'''
import {configureRuntimeHost,resolveH5pRuntimeUrl} from './p2rln_reader/web/runtime-host-config.js';
configureRuntimeHost({baseUrl:'https://runtime.example.test/runtime'});
if(resolveH5pRuntimeUrl(null,{applicationOrigin:'https://app.example.test'})!=='https://runtime.example.test/runtime/h5p/')process.exit(2);
try{resolveH5pRuntimeUrl('https://app.example.test/runtime/',{applicationOrigin:'https://app.example.test'});process.exit(3)}
catch(error){if(error.code!=='P2RLN_H5P_RUNTIME_ORIGIN_NOT_ISOLATED')process.exit(4)}
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_h5p_shell_has_state_xapi_and_private_channel_hooks(self):
        source = (ROOT / "p2rln_reader" / "web" / "runtime-host" / "h5p-host.js").read_text(encoding="utf-8")
        self.assertIn("externalDispatcher", source)
        self.assertIn("getCurrentState", source)
        self.assertIn("event.ports", source)
        self.assertIn("port.postMessage", source)
        self.assertIn("p2rln-h5p-runtime/1", source)
        self.assertNotIn("location.hash", source)
        self.assertNotIn("access_token", source)

    def test_runtime_health_keeps_h5p_closed_when_assets_are_missing(self):
        script = r'''
import {startP2RLNRuntimeHost} from './web_sdk/server/runtime-host.mjs';
const host=await startP2RLNRuntimeHost({basePath:'/runtime'});
try{
 const health=await (await fetch(host.baseUrl+'health')).json();
 if(health.h5p?.configured!==false||health.runtime!=='p2rln-scorm')process.exit(2);
 const page=await fetch(host.baseUrl+'h5p/');
 if(page.status!==503)process.exit(3);
}finally{await host.close()}
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def _server_session_script(self) -> str:
        return r'''
import {startP2RLNRuntimeHost} from './web_sdk/server/runtime-host.mjs';
const standalone=process.argv[1];
const shared=process.argv[2]==='-'?undefined:process.argv[2];
const mode=process.argv[3];
function sessionPayload(files){
 const enc=new TextEncoder();let offset=0;const chunks=[];const descriptors=[];
 for(const [path,text] of files){const data=enc.encode(text);descriptors.push({path,offset,length:data.byteLength});chunks.push(data);offset+=data.byteLength;}
 const manifest=enc.encode(JSON.stringify({protocol:'p2rln-h5p-session/1',files:descriptors}));
 const header=new Uint8Array(8);const view=new DataView(header.buffer);view.setUint32(0,0x50324835,false);view.setUint32(4,manifest.byteLength,false);
 return new Blob([header,manifest,...chunks],{type:'application/vnd.p2rln.h5p-session'});
}
const dep={machineName:'H5P.Demo',majorVersion:1,minorVersion:2};
const files=[
 ['h5p.json',JSON.stringify({title:'Demo',mainLibrary:'H5P.Demo',preloadedDependencies:[dep]})],
 ['content/content.json',JSON.stringify({question:'hello'})],
];
if(mode==='bundled')files.push(['H5P.Demo/library.json',JSON.stringify({...dep,patchVersion:0,runnable:1})]);
const host=await startP2RLNRuntimeHost({basePath:'/runtime',h5pStandaloneDir:standalone,h5pLibrariesDir:shared,allowedParentOrigins:['https://app.example.test']});
try{
 const health=await (await fetch(host.baseUrl+'health')).json();if(!health.h5p?.configured)process.exit(2);
 const denied=await fetch(host.baseUrl+'h5p/session',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/vnd.p2rln.h5p-session'},body:sessionPayload(files)});
 if(denied.status!==403)process.exit(3);
 const response=await fetch(host.baseUrl+'h5p/session',{method:'POST',headers:{Origin:'https://app.example.test','Content-Type':'application/vnd.p2rln.h5p-session'},body:sessionPayload(files)});
 const info=await response.json();
 if(mode==='missing'){
   if(response.status!==409||info.code!=='P2RLN_H5P_LIBRARIES_MISSING'||info.missing?.[0]?.machineName!=='H5P.Demo')process.exit(4);
   process.exitCode=0;
 }else if(mode==='assets-missing'){
   if(response.status!==409||info.code!=='P2RLN_H5P_LIBRARY_ASSETS_MISSING'||!info.missingAssets?.some((path)=>path.endsWith('/dist/demo.js')))process.exit(11);
   process.exitCode=0;
 }else{
   if(response.status!==201||!info.ok||!String(info.sessionUrl).startsWith('/runtime/h5p/session/')||info.runtimeAssetsUrl!=='/runtime/h5p/assets/')process.exit(5);
   const sessionUrl=new URL(info.sessionUrl,host.origin).href;
   const content=await fetch(new URL('content/content.json',sessionUrl));if(content.status!==200||(await content.json()).question!=='hello')process.exit(6);
   const lib=await fetch(new URL('H5P.Demo/library.json',sessionUrl));if(lib.status!==200||(await lib.json()).machineName!=='H5P.Demo')process.exit(7);
   const versioned=await fetch(new URL('H5P.Demo-1.2/library.json',sessionUrl));if(versioned.status!==200||(await versioned.json()).machineName!=='H5P.Demo')process.exit(8);
   const deleted=await fetch(sessionUrl,{method:'DELETE',headers:{Origin:'https://app.example.test'}});if(deleted.status!==204)process.exit(9);
   const gone=await fetch(sessionUrl);if(gone.status!==404)process.exit(10);
 }
}finally{await host.close()}
'''

    def test_session_server_accepts_bundled_h5p_and_uses_relative_urls(self):
        with tempfile.TemporaryDirectory() as td:
            standalone = fake_h5p_standalone(Path(td) / "standalone")
            result = self.run_node(self._server_session_script(), str(standalone), "-", "bundled")
            self.assertEqual(0, result.returncode, result.stderr + result.stdout)

    def test_session_server_rejects_missing_exact_library_and_unknown_origin(self):
        with tempfile.TemporaryDirectory() as td:
            standalone = fake_h5p_standalone(Path(td) / "standalone")
            result = self.run_node(self._server_session_script(), str(standalone), "-", "missing")
            self.assertEqual(0, result.returncode, result.stderr + result.stdout)

    def test_session_server_resolves_external_library_from_host_store(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            standalone = fake_h5p_standalone(root / "standalone")
            older = root / "libraries" / "H5P.Demo-1.1"
            older.mkdir(parents=True)
            (older / "library.json").write_text(
                json.dumps({"machineName": "H5P.Demo", "majorVersion": 1, "minorVersion": 1, "patchVersion": 0, "runnable": 1}),
                encoding="utf-8",
            )
            library = root / "libraries" / "H5P.Demo-1.2"
            library.mkdir(parents=True)
            (library / "library.json").write_text(
                json.dumps({"machineName": "H5P.Demo", "majorVersion": 1, "minorVersion": 2, "patchVersion": 0, "runnable": 1}),
                encoding="utf-8",
            )
            result = self.run_node(self._server_session_script(), str(standalone), str(root / "libraries"), "external")
            self.assertEqual(0, result.returncode, result.stderr + result.stdout)

    def test_session_server_rejects_library_metadata_whose_preloaded_assets_are_missing(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            standalone = fake_h5p_standalone(root / "standalone")
            library = root / "libraries" / "H5P.Demo-1.2"
            library.mkdir(parents=True)
            (library / "library.json").write_text(
                json.dumps({
                    "machineName": "H5P.Demo", "majorVersion": 1, "minorVersion": 2,
                    "patchVersion": 0, "runnable": 1,
                    "preloadedJs": [{"path": "dist/demo.js"}],
                }),
                encoding="utf-8",
            )
            result = self.run_node(self._server_session_script(), str(standalone), str(root / "libraries"), "assets-missing")
            self.assertEqual(0, result.returncode, result.stderr + result.stdout)

    def test_session_server_enforces_media_type_and_aggregate_memory_cap(self):
        with tempfile.TemporaryDirectory() as td:
            standalone = fake_h5p_standalone(Path(td) / "standalone")
            script = r'''
import {startP2RLNRuntimeHost} from './web_sdk/server/runtime-host.mjs';
function payload(){const enc=new TextEncoder();const dep={machineName:'H5P.Demo',majorVersion:1,minorVersion:0};const files=[['h5p.json',JSON.stringify({mainLibrary:'H5P.Demo',preloadedDependencies:[dep]})],['content/content.json','{}'],['H5P.Demo/library.json',JSON.stringify({...dep,runnable:1})]];let offset=0;const desc=[];const chunks=[];for(const [path,text] of files){const data=enc.encode(text);desc.push({path,offset,length:data.length});chunks.push(data);offset+=data.length;}const manifest=enc.encode(JSON.stringify({protocol:'p2rln-h5p-session/1',files:desc}));const head=new Uint8Array(8);const view=new DataView(head.buffer);view.setUint32(0,0x50324835,false);view.setUint32(4,manifest.length,false);return new Blob([head,manifest,...chunks]);}
const body=payload();
const host=await startP2RLNRuntimeHost({basePath:'/runtime',h5pStandaloneDir:process.argv[1],allowedParentOrigins:['https://app.example.test'],maxH5pSessionBytesTotal:32});
try{
 const wrong=await fetch(host.baseUrl+'h5p/session',{method:'POST',headers:{Origin:'https://app.example.test','Content-Type':'application/octet-stream'},body});if(wrong.status!==415)process.exit(2);
 const capped=await fetch(host.baseUrl+'h5p/session',{method:'POST',headers:{Origin:'https://app.example.test','Content-Type':'application/vnd.p2rln.h5p-session'},body});const info=await capped.json();if(capped.status!==413||info.code!=='P2RLN_H5P_SESSION_CAPACITY')process.exit(3);
 const health=await (await fetch(host.baseUrl+'health')).json();if(health.h5p.activeSessions!==0||health.h5p.activeSessionBytes!==0)process.exit(4);
}finally{await host.close()}
'''
            result = self.run_node(script, str(standalone))
            self.assertEqual(0, result.returncode, result.stderr + result.stdout)

    def test_dependency_graph_rejects_two_versions_of_same_library(self):
        script = r'''
import {createH5PSessionRegistry} from './web_sdk/server/h5p-session.mjs';
function payload(files){const enc=new TextEncoder();let off=0;const chunks=[];const desc=[];for(const [path,obj] of files){const data=enc.encode(typeof obj==='string'?obj:JSON.stringify(obj));desc.push({path,offset:off,length:data.length});chunks.push(data);off+=data.length;}const manifest=enc.encode(JSON.stringify({protocol:'p2rln-h5p-session/1',files:desc}));const out=new Uint8Array(8+manifest.length+off);const view=new DataView(out.buffer);view.setUint32(0,0x50324835,false);view.setUint32(4,manifest.length,false);out.set(manifest,8);let cursor=8+manifest.length;for(const c of chunks){out.set(c,cursor);cursor+=c.length;}return Buffer.from(out);}
const rootA={machineName:'H5P.RootA',majorVersion:1,minorVersion:0};const rootB={machineName:'H5P.RootB',majorVersion:1,minorVersion:0};
const shared1={machineName:'H5P.Shared',majorVersion:1,minorVersion:0};const shared2={machineName:'H5P.Shared',majorVersion:2,minorVersion:0};
const files=[
 ['h5p.json',{mainLibrary:'H5P.RootA',preloadedDependencies:[rootA,rootB]}],['content/content.json','{}'],
 ['H5P.RootA/library.json',{...rootA,runnable:1,preloadedDependencies:[shared1]}],
 ['H5P.RootB/library.json',{...rootB,runnable:1,preloadedDependencies:[shared2]}],
 ['H5P.Shared1/library.json',{...shared1,runnable:1}],['H5P.Shared2/library.json',{...shared2,runnable:1}],
];
const result=createH5PSessionRegistry().create(payload(files));
if(result.ok||result.code!=='P2RLN_H5P_LIBRARY_VERSION_CONFLICT')process.exit(2);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr + result.stdout)

    def test_runtime_rejects_symbolic_link_escapes(self):
        if not hasattr(os, "symlink"):
            self.skipTest("symbolic links unavailable")
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            standalone = fake_h5p_standalone(root / "standalone")
            outside = root / "outside.txt"
            outside.write_text("secret", encoding="utf-8")
            library = root / "libraries" / "H5P.Demo-1.2"
            library.mkdir(parents=True)
            (library / "library.json").write_text(
                json.dumps({"machineName": "H5P.Demo", "majorVersion": 1, "minorVersion": 2, "patchVersion": 0, "runnable": 1}),
                encoding="utf-8",
            )
            try:
                os.symlink(outside, library / "leak.txt")
            except OSError as exc:
                self.skipTest(f"cannot create symbolic link: {exc}")
            script = r'''
import {startP2RLNRuntimeHost} from './web_sdk/server/runtime-host.mjs';
function payload(){const enc=new TextEncoder();const dep={machineName:'H5P.Demo',majorVersion:1,minorVersion:2};const files=[['h5p.json',JSON.stringify({mainLibrary:'H5P.Demo',preloadedDependencies:[dep]})],['content/content.json','{}']];let offset=0;const desc=[];const chunks=[];for(const [path,text] of files){const data=enc.encode(text);desc.push({path,offset,length:data.length});chunks.push(data);offset+=data.length;}const manifest=enc.encode(JSON.stringify({protocol:'p2rln-h5p-session/1',files:desc}));const head=new Uint8Array(8);const view=new DataView(head.buffer);view.setUint32(0,0x50324835,false);view.setUint32(4,manifest.length,false);return new Blob([head,manifest,...chunks]);}
const host=await startP2RLNRuntimeHost({basePath:'/runtime',h5pStandaloneDir:process.argv[1],h5pLibrariesDir:process.argv[2],allowedParentOrigins:['https://app.example.test']});
try{
 const response=await fetch(host.baseUrl+'h5p/session',{method:'POST',headers:{Origin:'https://app.example.test','Content-Type':'application/vnd.p2rln.h5p-session'},body:payload()});
 const info=await response.json();if(response.status!==201)process.exit(2);
 const sessionUrl=new URL(info.sessionUrl,host.origin);
 const escaped=await fetch(new URL('H5P.Demo/leak.txt',sessionUrl));if(escaped.status!==404)process.exit(3);
}finally{await host.close()}
'''
            result = self.run_node(script, str(standalone), str(root / "libraries"))
            self.assertEqual(0, result.returncode, result.stderr + result.stdout)

    def test_server_csp_keeps_h5p_on_runtime_origin(self):
        with tempfile.TemporaryDirectory() as td:
            standalone = fake_h5p_standalone(Path(td) / "standalone")
            script = r'''
import {startP2RLNRuntimeHost} from './web_sdk/server/runtime-host.mjs';
const host=await startP2RLNRuntimeHost({basePath:'/runtime',h5pStandaloneDir:process.argv[1],allowedParentOrigins:['https://app.example.test']});
try{
 const page=await fetch(host.baseUrl+'h5p/');
 const csp=page.headers.get('content-security-policy')||'';
 if(page.status!==200||!csp.includes("connect-src 'self'")||!csp.includes("object-src 'none'")||!csp.includes("img-src 'self' data: blob:")||csp.includes("img-src 'self' data: blob: https:")||csp.includes("media-src 'self' data: blob: https:")||csp.includes("frame-src 'self' about: blob: https:")||!csp.includes('frame-ancestors https://app.example.test'))process.exit(2);
 const html=await page.text();if(!html.includes('h5p-host.js')||!html.includes('assets/main.bundle.js'))process.exit(3);
}finally{await host.close()}
'''
            result = self.run_node(script, str(standalone))
            self.assertEqual(0, result.returncode, result.stderr + result.stdout)


if __name__ == "__main__":
    unittest.main()
