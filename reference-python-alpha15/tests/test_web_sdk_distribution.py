from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]
SDK = ROOT / "web_sdk"
DIST = SDK / "dist"
WEB = ROOT / "p2rln_reader" / "web"


def tree_hashes(root: Path) -> dict[str, str]:
    return {
        path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(root.rglob("*")) if path.is_file()
    }


class WebSdkDistributionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        subprocess.run(["python3", "tools/build_web_sdk.py"], cwd=ROOT, check=True)

    def test_01_dist_is_generated_from_runtime_without_reader_ui(self):
        self.assertTrue((DIST / "p2rln-player.js").is_file())
        self.assertTrue((DIST / "p2rln.js").is_file())
        self.assertTrue((DIST / "p2rln.esm.js").is_file())
        self.assertTrue((DIST / "p2rln-sw.js").is_file())
        self.assertFalse((DIST / "app.js").exists())
        self.assertFalse((DIST / "index.html").exists())
        self.assertFalse((DIST / "style.css").exists())
        self.assertEqual(
            (WEB / "p2rln-player.js").read_bytes(),
            (DIST / "p2rln-player.js").read_bytes(),
        )
        self.assertEqual(
            (WEB / "renderers" / "questionnaire-memory.js").read_bytes(),
            (DIST / "renderers" / "questionnaire-memory.js").read_bytes(),
        )

    def test_02_build_is_reproducible_and_release_manifest_matches_files(self):
        with tempfile.TemporaryDirectory() as td:
            a = Path(td) / "a"
            b = Path(td) / "b"
            subprocess.run(["python3", "tools/build_web_sdk.py", "--output", str(a)], cwd=ROOT, check=True)
            subprocess.run(["python3", "tools/build_web_sdk.py", "--output", str(b)], cwd=ROOT, check=True)
            self.assertEqual(tree_hashes(a), tree_hashes(b))
        release = json.loads((DIST / "release.json").read_text(encoding="utf-8"))
        schema = json.loads((SDK / "schemas" / "web-sdk-release.schema.json").read_text(encoding="utf-8"))
        Draft202012Validator(schema).validate(release)
        declared = {item["path"]: item for item in release["files"]}
        actual = {path.relative_to(DIST).as_posix(): path for path in DIST.rglob("*") if path.is_file() and path.name != "release.json"}
        self.assertEqual(set(actual), set(declared))
        for rel, path in actual.items():
            self.assertEqual(path.stat().st_size, declared[rel]["bytes"])
            self.assertEqual("sha256:" + hashlib.sha256(path.read_bytes()).hexdigest(), declared[rel]["sha256"])

    @unittest.skipUnless(shutil.which("node"), "Node.js required")
    def test_03_esm_entry_exports_api_and_registers_versioned_global(self):
        script = r'''
globalThis.HTMLElement=class {};
const registry=new Map();
globalThis.customElements={get:(name)=>registry.get(name),define:(name,value)=>registry.set(name,value)};
const mod = await import('./web_sdk/dist/p2rln.esm.js?esm-test=1');
if(mod.version!=='0.4.0-alpha.15')process.exit(2);
if(mod.toolkitVersion!=='0.4.0a15'||mod.coreVersion!=='0.4.0')process.exit(3);
if(globalThis.P2RLN?.version!==mod.version)process.exit(4);
if(typeof mod.mountP2RLN!=='function'||typeof mod.openP2RLNPackageURL!=='function'||typeof mod.configureRuntimeHost!=='function')process.exit(5);
if(mod.renderers().length<10||mod.components().length<2)process.exit(6);
if(customElements.get('p2rln-player')!==mod.P2RLNPlayerElement)process.exit(7);
'''
        result = subprocess.run(["node", "--input-type=module", "-e", script], cwd=ROOT, text=True, capture_output=True)
        self.assertEqual(0, result.returncode, result.stderr)

    @unittest.skipUnless(shutil.which("node"), "Node.js required")
    def test_04_classic_loader_uses_its_own_url_and_exposes_ready_promise(self):
        loader = (DIST / "p2rln.js").resolve().as_uri()
        script = r'''
const loader=process.argv[1];
globalThis.document={currentScript:{src:loader}};
await import(loader+'?loader-test=1');
const api=await globalThis.P2RLNReady;
if(api.version!=='0.4.0-alpha.15')process.exit(2);
const state=globalThis.__P2RLN_CDN_LOADER__;
if(!state||state.version!==api.version)process.exit(3);
if(state.moduleUrl!==new URL('./p2rln.esm.js',loader).href)process.exit(4);
'''
        result = subprocess.run(["node", "--input-type=module", "-e", script, loader], cwd=ROOT, text=True, capture_output=True)
        self.assertEqual(0, result.returncode, result.stderr)

    @unittest.skipUnless(shutil.which("node"), "Node.js required")
    def test_05_different_runtime_version_is_rejected_explicitly(self):
        script = r'''
globalThis.P2RLN=Object.freeze({version:'9.9.9'});
try{await import('./web_sdk/dist/p2rln.esm.js?conflict-test=1');process.exit(2)}
catch(error){if(error.code!=='P2RLN_VERSION_CONFLICT'){console.error(error);process.exit(3)}}
'''
        result = subprocess.run(["node", "--input-type=module", "-e", script], cwd=ROOT, text=True, capture_output=True)
        self.assertEqual(0, result.returncode, result.stderr)

    @unittest.skipUnless(shutil.which("npm"), "npm required")
    def test_06_npm_dry_pack_contains_only_public_sdk_payload(self):
        result = subprocess.run(["npm", "pack", "--json", "--dry-run", "./web_sdk"], cwd=ROOT, text=True, capture_output=True)
        self.assertEqual(0, result.returncode, result.stderr)
        meta = json.loads(result.stdout)[0]
        paths = {item["path"] for item in meta["files"]}
        self.assertIn("dist/p2rln.js", paths)
        self.assertIn("dist/p2rln.esm.js", paths)
        self.assertIn("dist/p2rln-sw.js", paths)
        self.assertIn("types/index.d.ts", paths)
        self.assertIn("schemas/web-sdk-release.schema.json", paths)
        self.assertIn("dist/runtime-host/scorm.html", paths)
        self.assertIn("dist/runtime-host/scorm-host.js", paths)
        self.assertIn("server/runtime-host.mjs", paths)
        self.assertIn("types/server.d.ts", paths)
        self.assertNotIn("dist/app.js", paths)
        self.assertNotIn("dist/index.html", paths)
        self.assertFalse(any(path.startswith("tests/") or path.startswith("p2rln_reader/") for path in paths))

    @unittest.skipUnless(shutil.which("npm") and shutil.which("node"), "npm/node required")
    def test_07_packed_sdk_installs_offline_and_imports_by_package_name(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            pack = subprocess.run(["npm", "pack", str(SDK), "--pack-destination", str(root), "--json"], cwd=ROOT, text=True, capture_output=True)
            self.assertEqual(0, pack.returncode, pack.stderr)
            tarball = root / json.loads(pack.stdout)[0]["filename"]
            (root / "package.json").write_text('{"type":"module","dependencies":{}}\n', encoding="utf-8")
            install = subprocess.run(["npm", "install", "--ignore-scripts", "--no-audit", "--no-fund", str(tarball)], cwd=root, text=True, capture_output=True)
            self.assertEqual(0, install.returncode, install.stderr)
            probe = "import p,{version} from '@p2rln/player'; if(version!=='0.4.0-alpha.15'||p.version!==version)process.exit(2); console.log(version);"
            loaded = subprocess.run(["node", "--input-type=module", "-e", probe], cwd=root, text=True, capture_output=True)
            self.assertEqual(0, loaded.returncode, loaded.stderr)

    @unittest.skipUnless(shutil.which("tsc"), "TypeScript compiler required")
    def test_08_types_compile_for_element_global_and_module_api(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            source = root / "probe.ts"
            source.write_text('''
import P2RLN, {createHostAdapter, mountP2RLN, version} from "@p2rln/player";
const player = document.createElement("p2rln-player");
player.adapter = createHostAdapter({saveState: async (_state, _context) => {}});
void mountP2RLN(player, {src: "/course.p2rln"});
const v: "0.4.0-alpha.15" = version;
void P2RLN; void v;
''', encoding="utf-8")
            node_modules = root / "node_modules" / "@p2rln" / "player"
            shutil.copytree(SDK, node_modules)
            command = ["tsc", "--noEmit", "--strict", "--target", "ES2022", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--lib", "ES2022,DOM", str(source)]
            result = subprocess.run(command, cwd=root, text=True, capture_output=True)
            self.assertEqual(0, result.returncode, result.stderr + result.stdout)

    @unittest.skipUnless(shutil.which("node"), "Node.js required")
    def test_09_all_distributed_javascript_passes_node_syntax_check(self):
        failures = []
        for path in sorted(DIST.rglob("*.js")):
            result = subprocess.run(["node", "--check", str(path)], text=True, capture_output=True)
            if result.returncode:
                failures.append(f"{path.relative_to(ROOT)}: {result.stderr}")
        self.assertFalse(failures, "\n".join(failures))

    def test_10_reader_runtime_and_sdk_runtime_are_not_forked(self):
        for source in sorted(WEB.rglob("*")):
            if not source.is_file() or source.suffix not in {".js", ".css"}:
                continue
            rel = source.relative_to(WEB)
            if len(rel.parts) == 1 and rel.name in {"app.js", "index.html", "style.css"}:
                continue
            target = DIST / rel
            self.assertTrue(target.is_file(), rel.as_posix())
            self.assertEqual(source.read_bytes(), target.read_bytes(), rel.as_posix())

    @unittest.skipUnless(shutil.which("npm") and shutil.which("node"), "npm/node required")
    def test_11_copy_sw_bin_installs_exact_distributed_worker(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            pack = subprocess.run(["npm", "pack", str(SDK), "--pack-destination", str(root), "--json"], cwd=ROOT, text=True, capture_output=True)
            self.assertEqual(0, pack.returncode, pack.stderr)
            tarball = root / json.loads(pack.stdout)[0]["filename"]
            (root / "package.json").write_text('{"type":"module","dependencies":{}}\n', encoding="utf-8")
            install = subprocess.run(["npm", "install", "--ignore-scripts", "--no-audit", "--no-fund", str(tarball)], cwd=root, text=True, capture_output=True)
            self.assertEqual(0, install.returncode, install.stderr)
            copied = subprocess.run([str(root / "node_modules" / ".bin" / "p2rln-copy-sw"), str(root / "public")], cwd=root, text=True, capture_output=True)
            self.assertEqual(0, copied.returncode, copied.stderr)
            target = root / "public" / "p2rln-sw.js"
            self.assertEqual((SDK / "dist" / "p2rln-sw.js").read_bytes(), target.read_bytes())

    @unittest.skipUnless(shutil.which("node"), "Node.js required")
    def test_12_runtime_host_server_export_serves_scorm_shell_under_configurable_route(self):
        script = r'''
import {startP2RLNRuntimeHost} from './web_sdk/server/runtime-host.mjs';
const host=await startP2RLNRuntimeHost({basePath:'/runtime'});
try {
  if(!host.baseUrl.endsWith('/runtime/'))process.exit(2);
  const health=await fetch(host.baseUrl+'health');
  const info=await health.json();
  if(health.status!==200||info.runtime!=='p2rln-scorm'||info.version!=='0.4.0-alpha.15')process.exit(3);
  const page=await fetch(host.baseUrl+'scorm/');
  if(page.status!==200||!(await page.text()).includes('scorm-host.js'))process.exit(4);
  const csp=page.headers.get('content-security-policy')||'';
  if(!csp.includes("connect-src 'none'")||!csp.includes('frame-ancestors'))process.exit(5);
  const core=await fetch(host.baseUrl+'scorm-runtime-core.js');
  if(core.status!==200||!(await core.text()).includes('createScormApi'))process.exit(6);
} finally { await host.close(); }
'''
        result = subprocess.run(["node", "--input-type=module", "-e", script], cwd=ROOT, text=True, capture_output=True)
        self.assertEqual(0, result.returncode, result.stderr)


    @unittest.skipUnless(shutil.which("npm") and shutil.which("node"), "npm/node required")
    def test_13_packed_sdk_server_export_starts_offline(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            pack = subprocess.run(["npm", "pack", str(SDK), "--pack-destination", str(root), "--json"], cwd=ROOT, text=True, capture_output=True)
            self.assertEqual(0, pack.returncode, pack.stderr)
            tarball = root / json.loads(pack.stdout)[0]["filename"]
            (root / "package.json").write_text('{"type":"module","dependencies":{}}\n', encoding="utf-8")
            install = subprocess.run(["npm", "install", "--ignore-scripts", "--no-audit", "--no-fund", str(tarball)], cwd=root, text=True, capture_output=True)
            self.assertEqual(0, install.returncode, install.stderr)
            probe = r'''
import {startP2RLNRuntimeHost} from '@p2rln/player/server';
const host=await startP2RLNRuntimeHost({basePath:'/runtime'});
try { const r=await fetch(host.baseUrl+'scorm/'); if(r.status!==200)process.exit(2); console.log(host.baseUrl); } finally { await host.close(); }
'''
            loaded = subprocess.run(["node", "--input-type=module", "-e", probe], cwd=root, text=True, capture_output=True)
            self.assertEqual(0, loaded.returncode, loaded.stderr)


if __name__ == "__main__":
    unittest.main()
