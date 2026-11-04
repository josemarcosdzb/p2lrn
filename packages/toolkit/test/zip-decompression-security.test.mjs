import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_ZIP_LIMITS,ZipArchive,writeZip} from '../dist/core/zip.js';

function withCentralSize(original,size){
 const bytes=original.slice();
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let central=-1;
 for(let i=0;i+46<=bytes.length;i++){
  if(view.getUint32(i,true)===0x02014b50){central=i;break;}
 }
 assert(central>=0,'Expected a central directory record');
 view.setUint32(central+24,size,true);
 return bytes;
}

test('DEFLATE ZIP rejects deceptive uncompressed sizes without expanding past declared bytes',()=>{
 const contents=new TextEncoder().encode('A'.repeat(4096));
 const packageBytes=writeZip([{path:'lesson.txt',data:contents,method:8}]);
 const archive=ZipArchive.open(packageBytes);
 assert.deepEqual(archive.read('lesson.txt'),contents);
 const forged=withCentralSize(packageBytes,1);
 const untrusted=ZipArchive.open(forged);
 assert.throws(()=>untrusted.read('lesson.txt'),/ZIP decompression exceeded declared size/);
});

test('DEFLATE ZIP bounds in-memory expansion independently of caller-supplied archive metadata limits',()=>{
 const packageBytes=writeZip([{path:'lesson.txt',data:new Uint8Array(1024),method:8}]);
 const forged=withCentralSize(packageBytes,512*1024*1024+1);
 // Bypass the metadata ratio threshold deliberately to test the independent
 // hard in-memory extraction boundary, without allocating a large payload.
 const archive=ZipArchive.open(forged,{...DEFAULT_ZIP_LIMITS,compressionRatio:Infinity});
 assert.throws(()=>archive.read('lesson.txt'),/ZIP DEFLATE entry exceeds in-memory safety limit/);
});

test('Stored ZIP entries are unaffected by the DEFLATE expansion guard',()=>{
 const data=new Uint8Array([1,2,3,4,5,6]);
 const archive=ZipArchive.open(writeZip([{path:'video.bin',data,method:0}]));
 assert.deepEqual(archive.read('video.bin'),data);
});
