// Read-only media licensing/integrity preflight for a curated H5P sample.
// The Player is never granted network access. Nothing is persisted by this audit.
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {openP2LRNPackageBytes} from '../packages/toolkit/web/p2lrn-player.js';
import {ZipArchive} from '../packages/toolkit/dist/core/zip.js';
const root=resolve(import.meta.dirname,'..');
const bytes=await readFile(join(root,'examples/canonical/external/free/h5p-interactive-video.p2lrn'));
const pkg=await openP2LRNPackageBytes(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const source=pkg.manifest.files.find(x=>x.mediaType==='application/zip');
const archive=ZipArchive.open(await pkg.payload(source.path).read());
const content=JSON.parse(new TextDecoder().decode(archive.read('content/content.json')));
const files=content?.interactiveVideo?.video?.files??[];
for(const item of files){
  const metadata={path:item?.path, mime:item?.mime??item?.type??null, copyright:item?.copyright??null};
  if(!/^https:\/\/h5p\.org\/sites\/default\/files\/h5p\/iv\.(?:mp4|webm)$/u.test(metadata.path??'')){
    console.log('H5P_VIDEO_ORIGIN='+JSON.stringify({...metadata,allowed:false}));
    continue;
  }
  const url=new URL(metadata.path);
  const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(25000),headers:{'User-Agent':'P2LRN-fixture-license-audit/1.0'}});
  const type=response.headers.get('content-type')??null;
  const length=Number(response.headers.get('content-length')??0);
  if(response.status!==200){
    console.log('H5P_VIDEO_ORIGIN='+JSON.stringify({...metadata,status:response.status,type,length,allowed:false,reason:'remote-not-200'}));
    continue;
  }
  if(length>25*1024*1024)throw Error('Media too large; fetch refused');
  const hash=createHash('sha256'),chunks=[];let bytesRead=0;
  for await(const chunk of response.body){
    bytesRead+=chunk.byteLength;
    if(bytesRead>25*1024*1024)throw Error('Media too large while streaming');
    hash.update(chunk);
  }
  console.log('H5P_VIDEO_ORIGIN='+JSON.stringify({...metadata,status:response.status,type,bytes:bytesRead,
    sha256:'sha256:'+hash.digest('hex'),allowed:type?.startsWith('video/')&&bytesRead>4096}));
}
