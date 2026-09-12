from __future__ import annotations

import shutil
import struct
import subprocess
import tempfile
import unittest
import urllib.error
import urllib.request
from pathlib import Path

from p2rln_creator.builder import build_project
from p2rln_creator.project import PROJECT_FILE, add_file, new_project, save_project
from p2rln_reader.app import P2RLNReadingSystem, ReaderServer

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "examples" / "native-questionnaire-course.p2rln"


def make_zip64(source: Path, target: Path) -> None:
    data = source.read_bytes()
    eocd = data.rfind(b"PK\x05\x06")
    if eocd < 0:
        raise ValueError("EOCD missing")
    disk, cd_disk, entries_disk, entries_total, cd_size, cd_offset, comment_len = struct.unpack_from(
        "<HHHHIIH", data, eocd + 4
    )
    if disk or cd_disk or entries_disk != entries_total:
        raise ValueError("test source must be single-disk")
    prefix = data[:cd_offset]
    central = data[cd_offset : cd_offset + cd_size]
    rebuilt = bytearray()
    offset = 0
    count = 0
    while offset < len(central):
        if central[offset : offset + 4] != b"PK\x01\x02":
            raise ValueError("bad central directory")
        header = bytearray(central[offset : offset + 46])
        comp = struct.unpack_from("<I", header, 20)[0]
        uncomp = struct.unpack_from("<I", header, 24)[0]
        name_len = struct.unpack_from("<H", header, 28)[0]
        extra_len = struct.unpack_from("<H", header, 30)[0]
        comment_len_entry = struct.unpack_from("<H", header, 32)[0]
        local_offset = struct.unpack_from("<I", header, 42)[0]
        end = offset + 46 + name_len + extra_len + comment_len_entry
        name = central[offset + 46 : offset + 46 + name_len]
        extra = central[offset + 46 + name_len : offset + 46 + name_len + extra_len]
        comment = central[offset + 46 + name_len + extra_len : end]
        zip64_extra = struct.pack("<HHQQQ", 0x0001, 24, uncomp, comp, local_offset)
        struct.pack_into("<H", header, 6, max(45, struct.unpack_from("<H", header, 6)[0]))
        struct.pack_into("<I", header, 20, 0xFFFFFFFF)
        struct.pack_into("<I", header, 24, 0xFFFFFFFF)
        struct.pack_into("<H", header, 30, len(extra) + len(zip64_extra))
        struct.pack_into("<I", header, 42, 0xFFFFFFFF)
        rebuilt.extend(header)
        rebuilt.extend(name)
        rebuilt.extend(extra)
        rebuilt.extend(zip64_extra)
        rebuilt.extend(comment)
        offset = end
        count += 1
    if count != entries_total:
        raise ValueError("entry count mismatch")

    cd_offset64 = len(prefix)
    cd_size64 = len(rebuilt)
    zip64_eocd_offset = cd_offset64 + cd_size64
    zip64_eocd = struct.pack(
        "<IQHHIIQQQQ",
        0x06064B50,
        44,
        45,
        45,
        0,
        0,
        entries_total,
        entries_total,
        cd_size64,
        cd_offset64,
    )
    locator = struct.pack("<IIQI", 0x07064B50, 0, zip64_eocd_offset, 1)
    classic = struct.pack(
        "<IHHHHIIH",
        0x06054B50,
        0,
        0,
        0xFFFF,
        0xFFFF,
        0xFFFFFFFF,
        0xFFFFFFFF,
        0,
    )
    target.write_bytes(prefix + rebuilt + zip64_eocd + locator + classic)


@unittest.skipUnless(shutil.which("node"), "Node.js required for browser transport verification")
class HttpRangeZip64Tests(unittest.TestCase):
    def run_node(self, script: str, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["node", "--input-type=module", "-e", script, *args],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )

    def test_reader_server_supports_single_byte_ranges(self):
        system = P2RLNReadingSystem(PACKAGE)
        server = ReaderServer(system)
        server.start()
        try:
            url = f"http://127.0.0.1:{server.port}/package.p2rln?t={server.token}"
            request = urllib.request.Request(url, headers={"Range": "bytes=0-0"})
            with urllib.request.urlopen(request, timeout=5) as response:
                self.assertEqual(206, response.status)
                self.assertEqual("bytes", response.headers.get("Accept-Ranges"))
                self.assertEqual(1, len(response.read()))
                self.assertRegex(response.headers.get("Content-Range", ""), r"^bytes 0-0/\d+$")
                etag = response.headers.get("ETag")
            request = urllib.request.Request(url, headers={"Range": "bytes=0-9", "If-Range": etag})
            with urllib.request.urlopen(request, timeout=5) as response:
                self.assertEqual(206, response.status)
                self.assertEqual(10, len(response.read()))
            bad = urllib.request.Request(url, headers={"Range": "bytes=999999999-1000000000"})
            with self.assertRaises(urllib.error.HTTPError) as caught:
                urllib.request.urlopen(bad, timeout=5)
            self.assertEqual(416, caught.exception.code)
        finally:
            server.stop()

    def test_player_opens_reader_url_lazily_and_reads_payload_on_demand(self):
        system = P2RLNReadingSystem(PACKAGE)
        server = ReaderServer(system)
        server.start()
        try:
            url = f"http://127.0.0.1:{server.port}/package.p2rln?t={server.token}"
            script = r'''
import {openP2RLNPackageURL} from './p2rln_reader/web/p2rln-player.js';
const seen=[];
const wrapped=async (url,options={})=>{seen.push(options?.headers?.Range ?? null);return fetch(url,options);};
const pkg=await openP2RLNPackageURL(process.argv[1],{fetchImpl:wrapped});
if(pkg.verification.transport!=='range'||pkg.verification.mode!=='lazy')process.exit(2);
if(!pkg.verification.verifiedPaths.has('content/graph.json'))process.exit(3);
const rep=pkg.graph.entities.find((e)=>e.type==='resource').representations.find((r)=>r.location?.type==='embedded');
if(pkg.verification.verifiedPaths.has(rep.location.path))process.exit(4);
const before=seen.length;
const bytes=await pkg.payload(rep.location.path).read();
if(!bytes.byteLength||seen.length<=before)process.exit(5);
if(!pkg.verification.verifiedPaths.has(rep.location.path))process.exit(6);
if(seen.some((range)=>range===null))process.exit(7);
'''
            result = self.run_node(script, url)
            self.assertEqual(0, result.returncode, result.stderr)
        finally:
            server.stop()

    def test_virtual_three_gigabyte_archive_opens_without_full_download(self):
        script = r'''
import fs from 'node:fs';
import {openP2RLNPackageURL} from './p2rln_reader/web/p2rln-player.js';
const source=fs.readFileSync(process.argv[1]);
const view=new DataView(source.buffer,source.byteOffset,source.byteLength);
let eocd=-1;for(let i=source.length-22;i>=0;i--){if(view.getUint32(i,true)===0x06054b50){eocd=i;break;}}
if(eocd<0)process.exit(2);
const cdSize=view.getUint32(eocd+12,true);const cdOffset=view.getUint32(eocd+16,true);
const prefix=source.subarray(0,cdOffset);const central=source.subarray(cdOffset,cdOffset+cdSize);const oldEocd=source.subarray(eocd);
const total=3*1024*1024*1024;const virtualCdOffset=total-oldEocd.length-cdSize;
const patched=new Uint8Array(oldEocd);new DataView(patched.buffer).setUint32(16,virtualCdOffset,true);
const segments=[{start:0,data:prefix},{start:virtualCdOffset,data:central},{start:virtualCdOffset+cdSize,data:patched}];
let served=0;let maxRequest=0;let requests=0;
function materialize(start,end){const out=new Uint8Array(end-start+1);for(const seg of segments){const a=Math.max(start,seg.start),b=Math.min(end,seg.start+seg.data.length-1);if(a<=b)out.set(seg.data.subarray(a-seg.start,b-seg.start+1),a-start);}return out;}
const virtualFetch=async (_url,options={})=>{requests++;const header=options.headers?.Range ?? options.headers?.range;if(!header)throw new Error('full fetch forbidden');const m=/^bytes=(\d+)-(\d+)$/.exec(header);if(!m)throw new Error('bad range '+header);const start=Number(m[1]),end=Number(m[2]);const body=materialize(start,end);served+=body.length;maxRequest=Math.max(maxRequest,body.length);return new Response(body,{status:206,headers:{'Content-Range':`bytes ${start}-${end}/${total}`,'Content-Length':String(body.length),'ETag':'"virtual-v1"','Accept-Ranges':'bytes'}});};
const pkg=await openP2RLNPackageURL('https://example.invalid/huge.p2rln',{fetchImpl:virtualFetch});
if(pkg.verification.archiveBytes!==total||pkg.verification.transport!=='range')process.exit(3);
if(served>300000||maxRequest>70000||requests<5)process.exit(4);
const rep=pkg.graph.entities.find((e)=>e.type==='resource').representations.find((r)=>r.location?.type==='embedded');
await pkg.payload(rep.location.path).read();
if(served>400000)process.exit(5);
'''
        result = self.run_node(script, str(PACKAGE))
        self.assertEqual(0, result.returncode, result.stderr)

    def test_zip64_extended_entries_open_from_buffer_and_range(self):
        with tempfile.TemporaryDirectory() as td:
            zip64 = Path(td) / "zip64.p2rln"
            make_zip64(PACKAGE, zip64)
            script = r'''
import fs from 'node:fs';
import {openP2RLNPackageBytes,openP2RLNPackageURL} from './p2rln_reader/web/p2rln-player.js';
const data=fs.readFileSync(process.argv[1]);const ab=data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);
const local=await openP2RLNPackageBytes(ab);if(!local.verification.zip64)process.exit(2);
let served=0;
const f=async(_url,options={})=>{const h=options.headers?.Range;if(!h)throw new Error('full fetch forbidden');const m=/^bytes=(\d+)-(\d+)$/.exec(h);const start=Number(m[1]),end=Number(m[2]);const body=data.subarray(start,end+1);served+=body.length;return new Response(body,{status:206,headers:{'Content-Range':`bytes ${start}-${end}/${data.length}`,'Content-Length':String(body.length),'ETag':'"z64"'}});};
const remote=await openP2RLNPackageURL('https://example.invalid/z64.p2rln',{fetchImpl:f});if(!remote.verification.zip64||remote.verification.transport!=='range')process.exit(3);if(served>=data.length*3)process.exit(4);
'''
            result = self.run_node(script, str(zip64))
            self.assertEqual(0, result.returncode, result.stderr)

    def test_small_server_without_range_support_falls_back_to_full_buffer(self):
        script = r'''
import fs from 'node:fs';import {openP2RLNPackageURL} from './p2rln_reader/web/p2rln-player.js';
const data=fs.readFileSync(process.argv[1]);let calls=0;
const f=async()=>{calls++;return new Response(data,{status:200,headers:{'Content-Length':String(data.length),'ETag':'"full"'}});};
const pkg=await openP2RLNPackageURL('https://example.invalid/full.p2rln',{fetchImpl:f});
if(pkg.verification.transport!=='buffer-fallback'||pkg.verification.mode!=='eager'||calls!==1)process.exit(2);
'''
        result = self.run_node(script, str(PACKAGE))
        self.assertEqual(0, result.returncode, result.stderr)


    def test_large_binary_payload_uses_streaming_blob_path(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            asset = root / "large.bin"
            payload_bytes = bytes((index * 37) % 256 for index in range(128 * 1024))
            asset.write_bytes(payload_bytes)
            project = new_project("Streaming media")
            save_project(root / PROJECT_FILE, project)
            add_file(
                root,
                project,
                asset,
                "large-media",
                "Large media",
                media_type="video/mp4",
            )
            save_project(root / PROJECT_FILE, project)
            package = root / "large-media.p2rln"
            build_project(root, package, strict_profiles=True)
            system = P2RLNReadingSystem(package)
            server = ReaderServer(system)
            server.start()
            try:
                url = f"http://127.0.0.1:{server.port}/package.p2rln?t={server.token}"
                script = r'''
import {openP2RLNPackageURL} from './p2rln_reader/web/p2rln-player.js';
const pkg=await openP2RLNPackageURL(process.argv[1],{limits:{bufferedEntryBytes:4096}});
const resource=pkg.graph.entities.find((e)=>e.type==='resource');const rep=resource.representations.find((r)=>r.mediaType==='video/mp4');const payload=pkg.payload(rep.location.path);
try{await payload.read();process.exit(2);}catch(error){if(error.code!=='P2RLN_ENTRY_REQUIRES_STREAM'){console.error(error);process.exit(3);}}
const blob=await payload.blob('video/mp4');if(blob.size!==131072||blob.type!=='video/mp4')process.exit(4);
const bytes=new Uint8Array(await blob.arrayBuffer());if(bytes[0]!==0||bytes[1]!==37||bytes[bytes.length-1]!==219)process.exit(5);
'''
                result = self.run_node(script, url)
                self.assertEqual(0, result.returncode, result.stderr)
            finally:
                server.stop()

    def test_range_reader_rejects_resource_change_between_requests(self):
        script = r'''
import fs from 'node:fs';import {openP2RLNPackageURL} from './p2rln_reader/web/p2rln-player.js';
const data=fs.readFileSync(process.argv[1]);let calls=0;
const f=async(_url,options={})=>{calls++;const h=options.headers?.Range;if(calls===1){return new Response(data.subarray(0,1),{status:206,headers:{'Content-Range':`bytes 0-0/${data.length}`,'ETag':'"v1"'}});}return new Response(data,{status:200,headers:{'Content-Length':String(data.length),'ETag':'"v2"'}});};
try{await openP2RLNPackageURL('https://example.invalid/change.p2rln',{fetchImpl:f});process.exit(2);}catch(error){if(!String(error.message).match(/changed|stopped honoring/)) {console.error(error);process.exit(3);}}
'''
        result = self.run_node(script, str(PACKAGE))
        self.assertEqual(0, result.returncode, result.stderr)

    def test_incremental_sha256_matches_webcrypto(self):
        script = r'''
import {Sha256State} from './p2rln_reader/web/stream-integrity.js';
const bytes=new TextEncoder().encode('P2RLN streaming integrity '.repeat(10000));const state=new Sha256State();
for(let i=0;i<bytes.length;i+=997)state.update(bytes.subarray(i,i+997));
const expected=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));const text='sha256:'+Array.from(expected,b=>b.toString(16).padStart(2,'0')).join('');if(state.digestString()!==text)process.exit(2);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)


if __name__ == "__main__":
    unittest.main()
