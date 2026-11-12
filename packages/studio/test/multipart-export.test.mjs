import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createP2LRNStudioDocument} from '../../toolkit/web/studio/new-document.js';
import {exportMultipartP2LRNBundle} from '../../toolkit/web/studio/package-export.js';
import {BufferZipArchive} from '../../toolkit/web/zip-source.js';
import {openP2LRNPackageBytes} from '../../toolkit/web/p2lrn-player.js';

const limits={
  entries:5000,entryBytes:512*1048576,bufferedEntryBytes:512*1048576,
  totalUncompressedBytes:1024*1048576,centralDirectoryBytes:64*1048576,compressionRatio:250
};
const hash=data=>'sha256:'+createHash('sha256').update(data).digest('hex');
const buffer=bytes=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
function course(){
  const document=createP2LRNStudioDocument({
    title:'Prueba multipart',language:'es',author:'P2LRN QA',
    copyrightHolder:'P2LRN QA',license:'CC0-1.0'
  });
  const payload=new Uint8Array(2*1048576+381);
  for(let i=0;i<payload.length;i++)payload[i]=i%251;
  document.addEmbeddedResource(document.rootId,{
    title:'Binario de ensayo',filename:'ensayo.bin',
    mediaType:'application/octet-stream',bytes:payload
  });
  return {document,payload};
}

test('Studio creates real verified outer package and adjacent files',async()=>{
  const {document,payload}=course();
  const result=await exportMultipartP2LRNBundle(document,{partSizeMiB:1});
  assert.equal(result.partCount,3);
  assert.ok(result.filename.endsWith('-multipart.zip'));
  const transport=await BufferZipArchive.open(buffer(result.bytes),limits);
  assert.deepEqual(new Set(transport.names()),
    new Set([result.outerName,...result.parts.map(p=>p.href)]));
  const outer=await transport.read(result.outerName);
  assert.deepEqual(outer,result.outerBytes);
  const pkg=await openP2LRNPackageBytes(buffer(outer));
  assert.ok(pkg.manifest.profiles.some(p=>p.id==='https://p2lrn.org/profile/multipart'));
  const resource=pkg.graph.entities.find(e=>e.type==='resource'&&e.representations?.some(
    rep=>rep.extensions?.['https://p2lrn.org/profile/multipart']));
  assert.ok(resource);
  const descPath=resource.representations.find(
    rep=>rep.extensions?.['https://p2lrn.org/profile/multipart']).location.path;
  const desc=JSON.parse(new TextDecoder().decode(await pkg.zip.read(descPath)));
  assert.equal(desc.byteDigest,hash(payload));
  const chunks=[];
  for(const part of desc.parts){
    const bytes=await transport.read(part.href);
    assert.equal(bytes.byteLength,part.size);
    assert.equal(hash(bytes),part.byteDigest);
    chunks.push(bytes);
  }
  assert.equal(hash(Buffer.concat(chunks.map(x=>Buffer.from(x)))),desc.byteDigest);
  assert.equal(document.manifest.profiles.some(p=>p.id==='https://p2lrn.org/profile/multipart'),false);
});

test('Studio rejects unsafe or misleading multipart exports',async()=>{
  const {document}=course();
  for(const partSizeMiB of [0,-1,0.5,65,Infinity,NaN])
    await assert.rejects(()=>exportMultipartP2LRNBundle(document,{partSizeMiB}));
  await assert.rejects(()=>exportMultipartP2LRNBundle(document,{partSizeMiB:25}),
    /No existe un recurso embebido/);
});
