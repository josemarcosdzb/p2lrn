// Derive a fully offline H5P sample from the existing licensed fixture.
// The upstream .h5p is embedded byte-for-byte inside the derivative for audit.
// Fetch exactly one pre-reviewed CC BY 4.0 media file and pin its SHA-256.
// No runtime network permission is introduced; the Player serves local Blob data.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {ZipArchive,writeZip} from '../packages/toolkit/dist/core/zip.js';
import {convertExternalPackage} from '../packages/toolkit/dist/creator/external.js';
import {openP2LRNPackageBytes} from '../packages/toolkit/web/p2lrn-player.js';
const root=resolve(import.meta.dirname,'..');
const dir=join(root,'examples/canonical/external/free');
const provenancePath=join(dir,'provenance.json');
const slug='h5p-interactive-video';
const videoUrl='https://h5p.org/sites/default/files/h5p/iv.mp4';
const videoHash='sha256:007d8a7fb68c902ef196f61a938f071e83ff9cdd9f3e0ed08ebfd57cdbac58ea';
const videoBytes=13255441;
const digest=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const files=JSON.parse(await readFile(provenancePath,'utf8'));
const sample=files.samples.find(x=>x.slug===slug);
assert(sample&&sample.kind==='h5p'&&sample.browserVerified===false);
if(sample.enrichment?.schema==='https://p2lrn.org/schema/offline-h5p-media/1'){
  console.log('H5P_VIDEO_EMBED_ALREADY_PRESENT='+JSON.stringify(sample.enrichment));
  process.exit(0);
}
const originalPackage=new Uint8Array(await readFile(join(dir,slug+'.p2lrn')));
assert.equal(digest(originalPackage),sample.packageSha256);
const pkg=await openP2LRNPackageBytes(originalPackage.buffer.slice(originalPackage.byteOffset,originalPackage.byteOffset+originalPackage.length));
const sources=pkg.manifest.files.filter(f=>f.mediaType==='application/zip');
assert.equal(sources.length,1);
const originalSource=await pkg.payload(sources[0].path).read();
assert.equal(digest(originalSource),sample.sourceSha256,'Original package provenance changed');
const archive=ZipArchive.open(originalSource);
const names=archive.names();
const content=JSON.parse(new TextDecoder().decode(archive.read('content/content.json')));
assert(Array.isArray(content?.interactiveVideo?.video?.files));
const candidates=content.interactiveVideo.video.files;
assert(candidates.length>=2,'Expected original H5P media metadata');
const mp4=candidates.find(x=>x.path===videoUrl);
assert(mp4,'Original package must contain the exact pinned URL');
const cc=mp4.copyright;
assert(cc&&cc.license==='CC BY'&&String(cc.version)==='4.0'&&cc.author==='Joanna Siemek');
assert(candidates.every(x=>/^https:\/\/h5p\.org\/sites\/default\/files\/h5p\/iv\.(mp4|webm)$/.test(x.path)));
const reply=await fetch(videoUrl,{redirect:'manual',signal:AbortSignal.timeout(40000),headers:{'User-Agent':'P2LRN-licensed-sample-import/1.0'}});
assert.equal(reply.status,200,'Pinned video not available');
assert.equal(new URL(reply.url).origin,'https://h5p.org','Video must remain on the licensed source host');
assert(reply.headers.get('content-type')?.startsWith('video/mp4'),'Unexpected video MIME');
assert(Number(reply.headers.get('content-length')??0)<=20*1024*1024,'Unexpected media size');
const video=new Uint8Array(await reply.arrayBuffer());
assert.equal(video.length,videoBytes,'Pinned media length changed');
assert.equal(digest(video),videoHash,'Pinned media integrity mismatch');
// This H5P copy is explicitly a derivative: it preserves the upstream H5P
// archive as an audit record, embeds the correct video and points at the
// local content path. It NEVER rewrites the upstream stored record.
content.interactiveVideo.video.files=[{...mp4,path:'videos/iv.mp4',mime:'video/mp4'}];
const entries=names.map(path=>({
  path,
  data:path==='content/content.json'
    ?new TextEncoder().encode(JSON.stringify(content))
    :archive.read(path),
  method:8
}));
assert(!names.includes('content/videos/iv.mp4'));
assert(!names.includes('p2lrn-provenance/upstream-original.h5p'));
entries.push({path:'content/videos/iv.mp4',data:video,method:8});
entries.push({path:'p2lrn-provenance/upstream-original.h5p',data:originalSource,method:8});
const derivedH5p=writeZip(entries);
const verifyZip=ZipArchive.open(derivedH5p);
assert.equal(digest(verifyZip.read('p2lrn-provenance/upstream-original.h5p')),digest(originalSource));
assert.equal(digest(verifyZip.read('content/videos/iv.mp4')),videoHash);
const temp=await mkdtemp(join(tmpdir(),'p2lrn-curated-video-'));
try{
  const input=join(temp,slug+'.h5p'),output=join(temp,slug+'.p2lrn');
  await writeFile(input,derivedH5p);
  const report=convertExternalPackage(input,output);
  assert.equal(report.detectedFormat,'h5p');
  assert(report.preservedBitForBit,'Derived .h5p source must be preserved by Toolkit');
  assert.equal(report.sourceSha256,digest(derivedH5p));
  const derivedP2lrn=new Uint8Array(await readFile(output));
  assert(derivedP2lrn.length<64*1024*1024,'New sample too large for gallery');
  const previous={sourceSha256:sample.sourceSha256,packageSha256:sample.packageSha256,sourceUrl:sample.sourceUrl};
  sample.sourceSha256=digest(derivedH5p);
  sample.packageSha256=digest(derivedP2lrn);
  sample.sourceUrl='https://github.com/josemarcosdzb/p2lrn/blob/mejorastudio/scripts/embed-community-h5p-video.mjs';
  sample.enrichment={
    schema:'https://p2lrn.org/schema/offline-h5p-media/1',
    upstreamSourceSha256:previous.sourceSha256,
    upstreamPackageSha256:previous.packageSha256,
    upstreamSourceUrl:previous.sourceUrl,
    upstreamEmbeddedAs:'p2lrn-provenance/upstream-original.h5p',
    mediaSourceUrl:videoUrl,mediaSha256:videoHash,mediaBytes:videoBytes,
    mediaMember:'content/videos/iv.mp4',
    mediaCopyright:{title:'Berry Smoothie',author:'Joanna Siemek',source:'http://vimeo.com/68264542',license:'CC BY 4.0'},
    externalNetworkEnabled:false,
  };
  sample.browserVerified=false;
  // Write once both files and provenance have been validated. An interrupted CI
  // run will fail the verifier on the next attempt, never silently pass.
  await writeFile(join(dir,slug+'.p2lrn'),derivedP2lrn);
  await writeFile(provenancePath,JSON.stringify(files,null,2)+'\n');
  console.log('H5P_VIDEO_EMBED_OK='+JSON.stringify({
    slug,previous,derivedSourceSha256:sample.sourceSha256,
    packageSha256:sample.packageSha256,p2lrnBytes:derivedP2lrn.length,
    media:{sha256:videoHash,bytes:videoBytes,license:'CC BY 4.0'},
    originalPreservedInsideDerived:true
  }));
}finally{await rm(temp,{recursive:true,force:true})}
