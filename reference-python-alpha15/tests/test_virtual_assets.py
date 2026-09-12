from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import unittest
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

from p2rln_creator.builder import build_project
from p2rln_creator.project import PROJECT_FILE, add_file, add_web_content, new_project, save_project
from p2rln_reader.app import P2RLNReadingSystem, ReaderError, ReaderServer, _b64u
from p2rln_ref.delta import apply_delta, create_delta
from p2rln_ref.validator import validate_package
from p2rln_ref.web_content import MAPPING_EXTENSION, PROFILE as WEB_CONTENT_PROFILE

ROOT = Path(__file__).resolve().parents[1]


class VirtualAssetTests(unittest.TestCase):
    def new_project(self, root: Path) -> dict:
        project = new_project("Virtual assets", "es")
        save_project(root / PROJECT_FILE, project)
        return project

    def build_media_project(self, root: Path) -> tuple[Path, bytes]:
        project = self.new_project(root)
        video_bytes = bytes((index * 17) % 251 for index in range(128 * 1024))
        video = root / "lesson.mp4"
        video.write_bytes(video_bytes)
        text = root / "note.txt"
        text.write_text("hello\n", encoding="utf-8")
        add_file(root, project, video, "video", "Video", media_type="video/mp4", copy_file=False)
        add_file(root, project, text, "note", "Note", media_type="text/plain", copy_file=False)
        save_project(root / PROJECT_FILE, project)
        package = root / "media.p2rln"
        build_project(root, package)
        return package, video_bytes

    def test_creator_stores_seekable_media_and_delta_preserves_policy(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            base, _ = self.build_media_project(root)
            with zipfile.ZipFile(base) as zf:
                graph = json.loads(zf.read("content/graph.json"))
                reps = [rep for entity in graph["entities"] if entity["type"] == "resource" for rep in entity["representations"]]
                video = next(rep for rep in reps if rep["mediaType"] == "video/mp4")
                text = next(rep for rep in reps if rep["mediaType"] == "text/plain")
                self.assertEqual(zipfile.ZIP_STORED, zf.getinfo(video["location"]["path"]).compress_type)
                self.assertEqual(zipfile.ZIP_DEFLATED, zf.getinfo(text["location"]["path"]).compress_type)

            project = json.loads((root / PROJECT_FILE).read_text(encoding="utf-8"))
            (root / "note.txt").write_text("changed\n", encoding="utf-8")
            project["course"]["revision"] += 1
            save_project(root / PROJECT_FILE, project)
            target = root / "target.p2rln"
            build_project(root, target)
            delta = root / "update.p2rln.delta"
            rebuilt = root / "rebuilt.p2rln"
            create_delta(base, target, delta)
            apply_delta(base, delta, rebuilt)
            target_validation = validate_package(target)
            rebuilt_validation = validate_package(rebuilt)
            self.assertEqual(target_validation["contentRoot"], rebuilt_validation["contentRoot"])
            with zipfile.ZipFile(rebuilt) as zf:
                graph = json.loads(zf.read("content/graph.json"))
                video = next(rep for entity in graph["entities"] if entity["type"] == "resource" for rep in entity["representations"] if rep["mediaType"] == "video/mp4")
                self.assertEqual(zipfile.ZIP_STORED, zf.getinfo(video["location"]["path"]).compress_type)

    def test_web_directory_maps_relative_assets_and_reader_serves_them(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / "project"
            root.mkdir()
            site = Path(td) / "site"
            (site / "styles").mkdir(parents=True)
            (site / "images").mkdir(parents=True)
            (site / "index.html").write_text(
                '<!doctype html><link rel="stylesheet" href="styles/site.css"><img src="images/pic.png">',
                encoding="utf-8",
            )
            (site / "styles" / "site.css").write_text("body{font-family:sans-serif}\n", encoding="utf-8")
            image_bytes = b"\x89PNG\r\n\x1a\nvirtual-p2rln-image"
            (site / "images" / "pic.png").write_bytes(image_bytes)

            project = self.new_project(root)
            add_web_content(root, project, site, "index.html", "web", "Web bundle")
            save_project(root / PROJECT_FILE, project)
            package = root / "web-bundle.p2rln"
            build_project(root, package, strict_profiles=True)
            validate_package(package, strict_profiles=True, validate_profile_payloads_flag=True)

            with zipfile.ZipFile(package) as zf:
                graph = json.loads(zf.read("content/graph.json"))
                rep = next(
                    rep
                    for entity in graph["entities"]
                    if entity["type"] == "resource"
                    for rep in entity["representations"]
                    if rep.get("profile") == WEB_CONTENT_PROFILE
                )
                mapping = rep["extensions"][MAPPING_EXTENSION]
                self.assertEqual("index.html", mapping["entrypoint"])
                self.assertEqual({"index.html", "styles/site.css", "images/pic.png"}, set(mapping["assets"]))
                for embedded in mapping["assets"].values():
                    self.assertIn(embedded, zf.namelist())

            system = P2RLNReadingSystem(package)
            self.assertEqual(mapping["assets"]["styles/site.css"], system.resolve_web_asset(rep["id"], "styles/site.css"))
            with self.assertRaises(ReaderError):
                system.resolve_web_asset(rep["id"], "../secret")

            server = ReaderServer(system)
            server.start()
            try:
                base = f"http://127.0.0.1:{server.port}"
                rep_encoded = _b64u(rep["id"])
                css_url = f"{base}/virtual/web/{rep_encoded}/styles/site.css?t={server.token}"
                with urllib.request.urlopen(css_url, timeout=5) as response:
                    self.assertEqual(200, response.status)
                    self.assertEqual(b"body{font-family:sans-serif}\n", response.read())
                image_url = f"{base}/virtual/web/{rep_encoded}/images/pic.png?t={server.token}"
                with urllib.request.urlopen(image_url, timeout=5) as response:
                    self.assertEqual(image_bytes, response.read())
                missing = f"{base}/virtual/web/{rep_encoded}/missing.css?t={server.token}"
                with self.assertRaises(urllib.error.HTTPError) as caught:
                    urllib.request.urlopen(missing, timeout=5)
                self.assertEqual(400, caught.exception.code)
            finally:
                server.stop()


    def test_web_directory_rejects_symbolic_links_before_project_mutation(self):
        if not hasattr(os, "symlink"):
            self.skipTest("symlink support unavailable")
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / "project"
            root.mkdir()
            site = Path(td) / "site"
            site.mkdir()
            (site / "index.html").write_text("<p>safe</p>", encoding="utf-8")
            secret = Path(td) / "secret.txt"
            secret.write_text("outside", encoding="utf-8")
            try:
                (site / "escape.txt").symlink_to(secret)
            except OSError as exc:
                self.skipTest(f"cannot create symlink: {exc}")
            project = self.new_project(root)
            with self.assertRaisesRegex(Exception, "symbolic links"):
                add_web_content(root, project, site, "index.html", "web", "Web bundle")
            self.assertEqual([], project["resources"])
            self.assertEqual([], project["activities"])

    def test_reader_virtual_outer_ranges_seek_inside_stored_media(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            package, video_bytes = self.build_media_project(root)
            system = P2RLNReadingSystem(package)
            video_rep = next(
                rep
                for entity in system.reader.entities.values()
                if entity["type"] == "resource"
                for rep in entity["representations"]
                if rep["mediaType"] == "video/mp4"
            )
            embedded = video_rep["location"]["path"]
            info = system.virtual_outer_info(embedded)
            self.assertTrue(info["seekable"])
            server = ReaderServer(system)
            server.start()
            try:
                url = f"http://127.0.0.1:{server.port}/virtual/outer/{_b64u(embedded)}?t={server.token}"
                request = urllib.request.Request(url, headers={"Range": "bytes=1234-4321"})
                with urllib.request.urlopen(request, timeout=5) as response:
                    self.assertEqual(206, response.status)
                    self.assertEqual("bytes", response.headers.get("Accept-Ranges"))
                    self.assertEqual(f"bytes 1234-4321/{len(video_bytes)}", response.headers.get("Content-Range"))
                    self.assertTrue(response.headers.get("ETag", "").startswith('"p2rln-'))
                    self.assertEqual(video_bytes[1234:4322], response.read())
            finally:
                server.stop()


    @unittest.skipUnless(shutil.which("node"), "Node.js required for browser web-content mapping verification")
    def test_browser_web_mapping_uses_dedicated_extension_and_rejects_missing_assets(self):
        script = r'''
import {WEB_CONTENT_PROFILE,WEB_CONTENT_MAPPING_EXTENSION,webContentMapping} from './p2rln_reader/web/web-content-core.js';
const legacy={profile:WEB_CONTENT_PROFILE,location:{type:'embedded',path:'assets/a'},extensions:{[WEB_CONTENT_PROFILE]:{sourceProfile:'QTI'}}};
if(webContentMapping(legacy,new Set(['assets/a']))!==null)process.exit(2);
const rep={profile:WEB_CONTENT_PROFILE,location:{type:'embedded',path:'assets/a'},extensions:{[WEB_CONTENT_MAPPING_EXTENSION]:{version:'1',entrypoint:'index.html',assets:{'index.html':'assets/a','styles/site.css':'assets/b'}}}};
const mapping=webContentMapping(rep,new Set(['assets/a','assets/b']));
if(mapping.entrypoint!=='index.html'||mapping.assets['styles/site.css']!=='assets/b')process.exit(3);
let rejected=false;try{webContentMapping(rep,new Set(['assets/a']));}catch{rejected=true;}
if(!rejected)process.exit(4);
'''
        result = subprocess.run(
            ["node", "--input-type=module", "-e", script],
            cwd=ROOT, text=True, capture_output=True, check=False,
        )
        self.assertEqual(0, result.returncode, result.stderr)


    @unittest.skipUnless(shutil.which("node"), "Node.js required for browser package verification")
    def test_reference_web_bundle_example_opens_in_browser_verifier(self):
        package = ROOT / "examples" / "web-bundle-course.p2rln"
        script = r'''
import fs from 'node:fs';
import {openP2RLNPackageBytes} from './p2rln_reader/web/p2rln-player.js';
import {WEB_CONTENT_PROFILE,webContentMapping} from './p2rln_reader/web/web-content-core.js';
const data=fs.readFileSync(process.argv[1]);
const pkg=await openP2RLNPackageBytes(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength));
const rep=pkg.graph.entities.filter((e)=>e.type==='resource').flatMap((e)=>e.representations).find((r)=>r.profile===WEB_CONTENT_PROFILE);
if(!rep)process.exit(2);
const mapping=webContentMapping(rep,new Set(pkg.manifest.files.map((f)=>f.path)));
if(mapping.entrypoint!=='pages/index.html')process.exit(3);
if(!mapping.assets['styles/site.css']||!mapping.assets['images/diagram.svg'])process.exit(4);
'''
        result = subprocess.run(
            ["node", "--input-type=module", "-e", script, str(package)],
            cwd=ROOT, text=True, capture_output=True, check=False,
        )
        self.assertEqual(0, result.returncode, result.stderr)

    @unittest.skipUnless(shutil.which("node"), "Node.js required for browser package verification")
    def test_browser_exposes_zip_seekability_per_payload(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            package, _ = self.build_media_project(root)
            script = r'''
import fs from 'node:fs';
import {openP2RLNPackageBytes} from './p2rln_reader/web/p2rln-player.js';
const data=fs.readFileSync(process.argv[1]);
const ab=data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);
const pkg=await openP2RLNPackageBytes(ab);
const reps=pkg.graph.entities.filter((e)=>e.type==='resource').flatMap((e)=>e.representations);
const video=reps.find((r)=>r.mediaType==='video/mp4');
const text=reps.find((r)=>r.mediaType==='text/plain');
if(!pkg.payload(video.location.path).seekable)process.exit(2);
if(pkg.payload(video.location.path).compressionMethod!==0)process.exit(3);
if(pkg.payload(text.location.path).seekable)process.exit(4);
if(pkg.payload(text.location.path).compressionMethod!==8)process.exit(5);
'''
            result = subprocess.run(
                ["node", "--input-type=module", "-e", script, str(package)],
                cwd=ROOT,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(0, result.returncode, result.stderr)


if __name__ == "__main__":
    unittest.main()
