import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {cp,mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {join,relative,resolve} from 'node:path';
import {promisify} from 'node:util';

const execFileAsync=promisify(execFile);
const hash=data=>'sha256:'+createHash('sha256').update(data).digest('hex');
const INPUTS=['main.go','main_test.go','dialog_windows.go','dialog_other.go','go.mod','smoke.py'];

export async function publishNativeCorrespondingSource({root,outputRoot,version,sourceRef=null}){
  const folder=join(root,'native','offline-launcher');
  const destination=join(outputRoot,'downloads','source');
  const sourceRoot=join(destination,'native','offline-launcher');
  await mkdir(sourceRoot,{recursive:true});
  const files=[];
  for(const name of INPUTS){
    const bytes=await readFile(join(folder,name));
    await writeFile(join(sourceRoot,name),bytes);
    files.push({path:'native/offline-launcher/'+name,bytes:bytes.length,sha256:hash(bytes)});
  }
  for(const file of ['LICENSE','NOTICE.md']){
    const bytes=await readFile(join(root,file));
    await writeFile(join(destination,file),bytes);
    files.push({path:file,bytes:bytes.length,sha256:hash(bytes)});
  }
  const manifest={
    schema:'https://p2lrn.org/schema/native-corresponding-source/1',
    component:'p2lrn-offline-launcher',version,sourceRef,
    license:{id:'P2LRN-NCSL-1.0',file:'LICENSE',notice:'NOTICE.md'},
    build:{command:'go build -trimpath -ldflags=-s -w -H windowsgui -o p2lrn-offline-launcher-windows-amd64.exe .',
      directory:'native/offline-launcher',goVersion:process.env.GO_VERSION??null},
    files:files.sort((a,b)=>a.path.localeCompare(b.path,'en')),
  };
  await writeFile(join(destination,'SOURCE-MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n');
  const archive=join(outputRoot,'downloads','p2lrn-offline-launcher-source.tar.gz');
  await execFileAsync('tar',['-czf',archive,'-C',destination,'.'],{maxBuffer:4*1024*1024});
  const archiveBytes=await readFile(archive);
  return {manifest,archive:{url:'/downloads/p2lrn-offline-launcher-source.tar.gz',bytes:archiveBytes.length,sha256:hash(archiveBytes)},
    manifestUrl:'/downloads/source/SOURCE-MANIFEST.json'};
}
