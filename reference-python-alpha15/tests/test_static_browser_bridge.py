from __future__ import annotations

import json
import math
import shutil
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path

from p2rln_creator.builder import build_project
from p2rln_creator.project import PROJECT_FILE, add_file, new_project, save_project
from p2rln_ref import validator as v
from p2rln_ref.range_integrity import MEDIA_TYPE as RANGE_MEDIA_TYPE
from p2rln_ref.validator import ValidationFailure, validate_package

ROOT = Path(__file__).resolve().parents[1]
GRAPH_EXTENSION = "org.p2rln.rangeIntegrity"


class StaticBrowserBridgeTests(unittest.TestCase):
    def build_video(self, root: Path, size: int = 2_500_000) -> tuple[Path, Path]:
        video = root / "lesson.mp4"
        video.write_bytes(bytes((index * 29 + 7) % 251 for index in range(size)))
        project = new_project("Static bridge")
        save_project(root / PROJECT_FILE, project)
        add_file(root, project, video, "video", "Video", media_type="video/mp4", copy_file=False)
        save_project(root / PROJECT_FILE, project)
        package = root / "video.p2rln"
        build_project(root, package, strict_profiles=True)
        return package, video

    def test_creator_emits_chunk_integrity_for_seekable_media(self):
        with tempfile.TemporaryDirectory() as td:
            package, video = self.build_video(Path(td))
            result = validate_package(package, strict_profiles=True)
            self.assertEqual("P2RLN", result["format"])
            with zipfile.ZipFile(package) as zf:
                graph = json.loads(zf.read("content/graph.json"))
                pointer = graph["extensions"][GRAPH_EXTENSION]
                self.assertEqual("1", pointer["version"])
                index_path = pointer["indexPath"]
                manifest = json.loads(zf.read("META-INF/manifest.json"))
                descriptor = next(item for item in manifest["files"] if item["path"] == index_path)
                self.assertEqual(RANGE_MEDIA_TYPE, descriptor["mediaType"])
                index = json.loads(zf.read(index_path))
                rep = next(
                    rep
                    for entity in graph["entities"]
                    if entity["type"] == "resource"
                    for rep in entity["representations"]
                    if rep["mediaType"] == "video/mp4"
                )
                media_path = rep["location"]["path"]
                entry = index["entries"][media_path]
                self.assertEqual(video.stat().st_size, entry["size"])
                self.assertEqual(math.ceil(video.stat().st_size / index["chunkSize"]), len(entry["chunks"]))
                self.assertEqual(zipfile.ZIP_STORED, zf.getinfo(media_path).compress_type)
                self.assertEqual(v.sha256(video.read_bytes()), entry["byteDigest"])

    def test_validator_rejects_forged_chunk_map_even_with_recomputed_content_root(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            package, _video = self.build_video(root, size=200_000)
            forged = root / "forged.p2rln"
            with zipfile.ZipFile(package) as source:
                infos = {info.filename: info for info in source.infolist() if not info.is_dir()}
                files = {name: source.read(name) for name in infos}
            manifest = json.loads(files["META-INF/manifest.json"])
            graph = json.loads(files["content/graph.json"])
            index_path = graph["extensions"][GRAPH_EXTENSION]["indexPath"]
            index = json.loads(files[index_path])
            target = next(iter(index["entries"].values()))
            target["chunks"][0] = "sha256:" + "0" * 64
            new_index = (json.dumps(index, ensure_ascii=False, indent=2) + "\n").encode()
            files[index_path] = new_index
            descriptor = next(item for item in manifest["files"] if item["path"] == index_path)
            descriptor["size"] = len(new_index)
            descriptor["byteDigest"] = v.sha256(new_index)
            descriptor["contentDigest"] = v.content_digest(new_index, descriptor["mediaType"], index_path)
            manifest["integrity"]["contentRoot"] = v.compute_content_root(manifest)
            files["META-INF/manifest.json"] = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode()
            with zipfile.ZipFile(forged, "w", allowZip64=True) as out:
                for name in sorted(files):
                    info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                    info.compress_type = infos[name].compress_type
                    info.external_attr = 0o100644 << 16
                    out.writestr(info, files[name])
            with self.assertRaisesRegex(ValidationFailure, "range-integrity chunk digest mismatch"):
                validate_package(forged)

    @unittest.skipUnless(shutil.which("node"), "Node.js required")
    def test_alpha9_package_without_chunk_map_remains_browser_compatible(self):
        package = ROOT / "examples" / "web-bundle-course.p2rln"
        script = r'''
import fs from 'node:fs';
import {openP2RLNPackageBytes} from './p2rln_reader/web/p2rln-player.js';
const data=fs.readFileSync(process.argv[1]);const pkg=await openP2RLNPackageBytes(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength));
if(pkg.graph.extensions?.['org.p2rln.rangeIntegrity'])process.exit(2);
const rep=pkg.graph.entities.filter(e=>e.type==='resource').flatMap(e=>e.representations).find(r=>r.location?.type==='embedded');
if(await pkg.payload(rep.location.path).rangeIntegrity()!==null)process.exit(3);
'''
        result = subprocess.run(["node", "--input-type=module", "-e", script, str(package)], cwd=ROOT, text=True, capture_output=True, check=False)
        self.assertEqual(0, result.returncode, result.stderr)

    @unittest.skipUnless(shutil.which("node"), "Node.js required")
    def test_service_worker_translates_virtual_range_and_verifies_covering_chunk(self):
        with tempfile.TemporaryDirectory() as td:
            package, video = self.build_video(Path(td))
            script = r'''
import fs from 'node:fs';
import {openP2RLNPackageBytes} from './p2rln_reader/web/p2rln-player.js';
import {serveVirtualResource} from './p2rln_reader/web/p2rln-sw.js';
const packageBytes=fs.readFileSync(process.argv[1]);
const expected=fs.readFileSync(process.argv[2]);
const ab=packageBytes.buffer.slice(packageBytes.byteOffset,packageBytes.byteOffset+packageBytes.byteLength);
const pkg=await openP2RLNPackageBytes(ab);
const rep=pkg.graph.entities.filter(e=>e.type==='resource').flatMap(e=>e.representations).find(r=>r.mediaType==='video/mp4');
const payload=pkg.payload(rep.location.path);const ri=await payload.rangeIntegrity();
if(!ri||ri.chunks.length<3)process.exit(2);
const route={version:'1',routeId:'a'.repeat(48),sourceUrl:'https://example.test/course.p2rln',contentRoot:pkg.manifest.integrity.contentRoot,resources:{asset:{embeddedPath:payload.path,mediaType:payload.mediaType,size:payload.size,byteDigest:payload.byteDigest,archiveEntry:payload.archiveEntry,rangeIntegrity:ri}}};
const seen=[];
const fakeFetch=async(_url,options={})=>{const h=options.headers?.Range;const m=/^bytes=(\d+)-(\d+)$/.exec(h||'');if(!m)throw new Error('missing range');const start=Number(m[1]),end=Number(m[2]);seen.push([start,end]);const body=packageBytes.subarray(start,end+1);return new Response(body,{status:206,headers:{'Content-Range':`bytes ${start}-${end}/${packageBytes.length}`}});};
const start=1_100_000,end=1_160_000;
const response=await serveVirtualResource(route,'asset',new Request('https://example.test/__p2rln__/v1/'+'a'.repeat(48)+'/asset',{headers:{Range:`bytes=${start}-${end}`}}),{fetchImpl:fakeFetch});
if(response.status!==206||response.headers.get('Accept-Ranges')!=='bytes')process.exit(3);
const actual=Buffer.from(await response.arrayBuffer());const wanted=expected.subarray(start,end+1);if(!actual.equals(wanted))process.exit(4);
const large=seen.filter(([a,b])=>b-a+1>100000);if(large.length!==1||large[0][1]-large[0][0]+1>ri.chunkSize)process.exit(5);
if(seen.some(([a,b])=>a===0&&b===packageBytes.length-1))process.exit(6);
'''
            result = subprocess.run(["node", "--input-type=module", "-e", script, str(package), str(video)], cwd=ROOT, text=True, capture_output=True, check=False)
            self.assertEqual(0, result.returncode, result.stderr)

    @unittest.skipUnless(shutil.which("node"), "Node.js required")
    def test_service_worker_rejects_tampered_chunk(self):
        with tempfile.TemporaryDirectory() as td:
            package, _video = self.build_video(Path(td), size=1_500_000)
            script = r'''
import fs from 'node:fs';
import {openP2RLNPackageBytes} from './p2rln_reader/web/p2rln-player.js';
import {serveVirtualResource} from './p2rln_reader/web/p2rln-sw.js';
const data=fs.readFileSync(process.argv[1]);const ab=data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);const pkg=await openP2RLNPackageBytes(ab);
const rep=pkg.graph.entities.filter(e=>e.type==='resource').flatMap(e=>e.representations).find(r=>r.mediaType==='video/mp4');const p=pkg.payload(rep.location.path);const ri=await p.rangeIntegrity();
const route={version:'1',routeId:'b'.repeat(48),sourceUrl:'https://example.test/course.p2rln',contentRoot:pkg.manifest.integrity.contentRoot,resources:{asset:{embeddedPath:p.path,mediaType:p.mediaType,size:p.size,byteDigest:p.byteDigest,archiveEntry:p.archiveEntry,rangeIntegrity:ri}}};
const fake=async(_url,options={})=>{const m=/^bytes=(\d+)-(\d+)$/.exec(options.headers?.Range||'');const a=Number(m[1]),b=Number(m[2]);const body=Buffer.from(data.subarray(a,b+1));if(body.length>100000)body[Math.floor(body.length/2)]^=0xff;return new Response(body,{status:206,headers:{'Content-Range':`bytes ${a}-${b}/${data.length}`}});};
const response=await serveVirtualResource(route,'asset',new Request('https://example.test/x',{headers:{Range:'bytes=100000-120000'}}),{fetchImpl:fake});
let rejected=false;try{await response.arrayBuffer();}catch(error){rejected=/integrity mismatch/.test(String(error));}if(!rejected)process.exit(2);
'''
            result = subprocess.run(["node", "--input-type=module", "-e", script, str(package)], cwd=ROOT, text=True, capture_output=True, check=False)
            self.assertEqual(0, result.returncode, result.stderr)

    @unittest.skipUnless(shutil.which("node"), "Node.js required")
    def test_service_worker_serves_verified_deflated_web_asset_without_chunk_map(self):
        package = ROOT / "examples" / "web-bundle-course.p2rln"
        script = r'''
import fs from 'node:fs';
import {openP2RLNPackageBytes} from './p2rln_reader/web/p2rln-player.js';
import {serveVirtualResource} from './p2rln_reader/web/p2rln-sw.js';
import {webContentMapping} from './p2rln_reader/web/web-content-core.js';
const data=fs.readFileSync(process.argv[1]);const pkg=await openP2RLNPackageBytes(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength));
const rep=pkg.graph.entities.filter(e=>e.type==='resource').flatMap(e=>e.representations).find(r=>r.profile==='https://p2rln.org/profile/web-content');const mapping=webContentMapping(rep,new Set(pkg.manifest.files.map(f=>f.path)));const path=mapping.assets['styles/site.css'];const p=pkg.payload(path);const expected=await p.read();
const route={version:'1',routeId:'c'.repeat(48),sourceUrl:'https://example.test/course.p2rln',contentRoot:pkg.manifest.integrity.contentRoot,resources:{'styles/site.css':{embeddedPath:p.path,mediaType:p.mediaType,size:p.size,byteDigest:p.byteDigest,archiveEntry:p.archiveEntry,rangeIntegrity:null}}};
const fake=async(_url,options={})=>{const m=/^bytes=(\d+)-(\d+)$/.exec(options.headers?.Range||'');const a=Number(m[1]),b=Number(m[2]);return new Response(data.subarray(a,b+1),{status:206,headers:{'Content-Range':`bytes ${a}-${b}/${data.length}`}});};
const response=await serveVirtualResource(route,'styles/site.css',new Request('https://example.test/x'),{fetchImpl:fake});if(response.status!==200)process.exit(2);const actual=new Uint8Array(await response.arrayBuffer());if(actual.length!==expected.length||actual.some((v,i)=>v!==expected[i]))process.exit(3);
'''
        result = subprocess.run(["node", "--input-type=module", "-e", script, str(package)], cwd=ROOT, text=True, capture_output=True, check=False)
        self.assertEqual(0, result.returncode, result.stderr)


if __name__ == "__main__":
    unittest.main()
