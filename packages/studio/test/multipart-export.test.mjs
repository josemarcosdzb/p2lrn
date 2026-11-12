import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {createP2LRNStudioDocument} from '../../toolkit/web/studio/new-document.js';
import {exportMultipartP2LRNBundle} from '../../toolkit/web/studio/package-export.js';
import {BufferZipArchive} from '../../toolkit/web/zip-source.js';
import {openP2LRNPackageBytes,openP2LRNPackageURL} from '../../toolkit/web/p2lrn-player.js';
import {createMultipartPayload} from '../../toolkit/web/multipart.js';

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

test('Player reconstructs the real multipart representation over HTTP and rejects modified/missing parts',async()=>{
  const {document,payload}=course();
  const output=await exportMultipartP2LRNBundle(document,{partSizeMiB:1});
  const files=new Map([[output.outerName,output.outerBytes]]);
  const transport=await BufferZipArchive.open(buffer(output.bytes),limits);
  for(const part of output.parts)files.set(part.href,await transport.read(part.href));
  const modified=new Set();
  const missing=new Set();
  const requests=[];
  const server=createServer((request,response)=>{
    const file=decodeURIComponent(new URL(request.url,'http://localhost').pathname.slice(1));
    requests.push(file);
    if(missing.has(file)||!files.has(file)){response.writeHead(404);response.end('Not found');return;}
    const original=files.get(file);
    const bytes=modified.has(file)?original.slice():original;
    if(modified.has(file))bytes[0]^=255;
    response.writeHead(200,{
      'Content-Type':'application/octet-stream',
      'Content-Length':String(bytes.byteLength),
      'Cache-Control':'no-store',
    });
    response.end(Buffer.from(bytes));
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  try{
    const url='http://127.0.0.1:'+server.address().port+'/'+output.outerName;
    const opened=await openP2LRNPackageURL(url);
    const representation=opened.graph.entities
      .filter(entity=>entity.type==='resource')
      .flatMap(entity=>entity.representations??[])
      .find(item=>item.extensions?.['https://p2lrn.org/profile/multipart']);
    assert.ok(representation,'Reader did not retain the multipart representation');
    const actual=await (await createMultipartPayload(opened,representation)).read();
    assert.deepEqual(actual,payload,'Player did not reconstruct the exact original resource bytes');
    assert.ok(requests.includes(output.parts[0].href),'Player never requested the first real part');
    assert.ok(requests.includes(output.parts.at(-1).href),'Player never requested the final real part');
    modified.add(output.parts[1].href);
    await assert.rejects(
      () => createMultipartPayload(opened,representation).then(item=>item.read()),
      error=>error.code==='P2LRN_MULTIPART_INTEGRITY_FAILED',
      'A corrupted part was not rejected',
    );
    modified.clear();
    missing.add(output.parts[1].href);
    await assert.rejects(
      () => createMultipartPayload(opened,representation).then(item=>item.read()),
      error=>error.code==='P2LRN_MULTIPART_FETCH_FAILED',
      'A missing part was not rejected',
    );
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});
