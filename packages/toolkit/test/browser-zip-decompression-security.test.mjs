import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {inflateRawBounded, BufferZipArchive} from '../web/zip-source.js';
import {writeZip} from '../dist/core/zip.js';

const payload=new TextEncoder().encode('a'.repeat(128*1024));
const limits=Object.freeze({
  entries:32,entryBytes:2*1024*1024,bufferedEntryBytes:256*1024,
  totalUncompressedBytes:4*1024*1024,centralDirectoryBytes:64*1024,
  compressionRatio:Infinity,
});
function forgeCentralSize(source,uncompressedSize){
  const bytes=source.slice(),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let found=false;
  for(let i=0;i+46<=bytes.length;i++){
    if(view.getUint32(i,true)!==0x02014b50)continue;
    view.setUint32(i+24,uncompressedSize,true);
    found=true;break;
  }
  assert.ok(found,'Expected a ZIP central directory header');
  return bytes;
}
test('browser deflate stops at the output byte limit instead of buffering a forged zip bomb',async()=>{
  const zip=writeZip([{path:'lesson.txt',data:payload,method:8}]);
  const forged=forgeCentralSize(zip,128);
  const archive=await BufferZipArchive.open(forged.buffer,limits);
  await assert.rejects(archive.read('lesson.txt'),/decompression exceeded declared size/);
});

test('browser deflate reader accepts content exactly at its declared bound',async()=>{
  const bytes=new Uint8Array(deflateRawSync(payload));
  const decoded=await inflateRawBounded(bytes,payload.byteLength);
  assert.deepEqual(decoded,payload);
  await assert.rejects(inflateRawBounded(bytes,payload.byteLength-1),/decompression exceeded declared size/);
});

test('buffered nested archives require streaming rather than allocating oversized assets',async()=>{
  const data=new TextEncoder().encode('one hundred and twenty eight bytes');
  const zip=writeZip([{path:'asset.bin',data,method:0}]);
  const archive=await BufferZipArchive.open(zip.buffer,{...limits,bufferedEntryBytes:8});
  await assert.rejects(archive.read('asset.bin'),error=>
    error?.code==='P2LRN_ENTRY_REQUIRES_STREAM');
});

test('virtual ZIP paths cannot escape root through ../, Windows drive or backslash',async()=>{
  const {safeZipPath}=await import('../web/zip-source.js');
  for(const path of ['../secret','assets/../../secret','/tmp/private','C:/Windows/win.ini','assets\\..\\secret']){
    assert.throws(()=>safeZipPath(path),/Unsafe ZIP path/);
  }
});
