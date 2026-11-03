import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {promisify} from 'node:util';
import {publishNativeCorrespondingSource} from './native-corresponding-source.mjs';

const exec=promisify(execFile);
const root=resolve(process.cwd());
const source=join(root,'native','offline-launcher');
const output=join(root,'.netlify-cdn','downloads');
await mkdir(output,{recursive:true});
const filename='p2lrn-offline-launcher-windows-amd64.exe';
const file=join(output,filename);
const playerPackage=JSON.parse(await readFile(join(root,'packages','player','package.json'),'utf8'));
const sourceAudit=await publishNativeCorrespondingSource({root,outputRoot:join(root,'.netlify-cdn'),version:playerPackage.version,
  sourceRef:process.env.P2LRN_SOURCE_REF??process.env.GITHUB_SHA??process.env.COMMIT_REF??null});

async function go(args,env={}){
  try{
    return await exec('go',args,{cwd:source,env:{...process.env,...env},timeout:180000,maxBuffer:4*1024*1024});
  }catch(error){throw new Error('Compilación nativa P2LRN: '+error.message+'. El despliegue requiere Go instalado (GO_VERSION).');}
}
await go(['test','./...']);
await go(['build','-trimpath','-ldflags=-s -w -H windowsgui','-o',file,'.'],{
  GOOS:'windows',GOARCH:'amd64',CGO_ENABLED:'0',GOWORK:'off',
});
const bytes=await readFile(file);
if(bytes.length<1024*1024||bytes.length>64*1024*1024||bytes.toString('ascii',0,2)!=='MZ')
  throw new Error('El ejecutable Windows nativo es inválido.');
const peOffset=bytes.readUInt32LE(60);
if(peOffset+24>bytes.length||bytes.toString('ascii',peOffset,peOffset+4)!=='PE\u0000\u0000'
  ||bytes.readUInt16LE(peOffset+4)!==0x8664)
  throw new Error('Se esperaba un ejecutable Windows x64 válido.');
const sha256='sha256:'+createHash('sha256').update(bytes).digest('hex');
const manifest={
  schema:'https://p2lrn.org/schema/native-offline-launcher/1',
  version:'1',filename,platform:'windows',architecture:'amd64',
  envelope:'P2LRN-EXE-V1',bytes:bytes.length,sha256,
  license:{id:'P2LRN-NCSL-1.0',url:'/LICENSE',notice:'/NOTICE.md'},
  correspondingSource:{manifest:sourceAudit.manifestUrl,archive:sourceAudit.archive.url,archiveBytes:sourceAudit.archive.bytes,archiveSha256:sourceAudit.archive.sha256},
  signedByPublisher:false,
  note:'El EXE generado en el navegador no posee firma Authenticode. La firma Ed25519 autentica solo el encargo del profesor.',
};
await writeFile(join(output,'p2lrn-offline-launcher.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('P2LRN_NATIVE_OFFLINE_EXE='+JSON.stringify(manifest));
