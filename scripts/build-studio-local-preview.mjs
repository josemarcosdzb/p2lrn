// Build BOTH previews from the same checkout of mejorastudio.
// No release, merge, npm publish or modification of the existing working copy.
import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {buildPlayerDistribution} from '../packages/player/scripts/build-dist.mjs';
import {STUDIO_RUNTIME_SHARED_FILES} from '../deploy/netlify/studio-runtime-assets.mjs';

const exec=promisify(execFile);
const repository=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const outputFlag=args.indexOf('--output');
if(outputFlag<0||!args[outputFlag+1])throw Error('Usage: node scripts/build-studio-local-preview.mjs --output <absolute-folder>');
const output=resolve(args[outputFlag+1]);
const home=resolve(process.env.USERPROFILE||process.env.HOME||repository);
const downloads=resolve(home,'Downloads');
if(!output.toLowerCase().startsWith((downloads+'\\').toLowerCase())||
   !/^p2lrn-mejorastudio-preview-[a-f0-9]{7,16}$/i.test(output.split(/[\\/]/).at(-1)))
  throw Error('Output must be a dedicated versioned p2lrn-mejorastudio-preview-<sha> directory under Downloads');
await mkdir(output,{recursive:true});

console.log('1/5 Build canonical Player locally');
const playerOut=join(repository,'packages','player','dist');
const player=await buildPlayerDistribution({output:playerOut});
if(!player.release.files?.length)throw Error('Player has no output files');
console.log('2/5 Build the npm Studio distribution');
await exec(process.execPath,[join(repository,'packages','studio','scripts','build-dist.mjs')],{
  cwd:repository,maxBuffer:8*1024*1024,timeout:180000
});
console.log('3/5 Copy hosted Studio web and the canonical Toolkit Studio runtime');
await cp(join(repository,'deploy','netlify','site'),output,{recursive:true,force:true});
await cp(join(repository,'packages','toolkit','web','studio'),join(output,'studio','runtime'),{recursive:true,force:true});
for(const file of STUDIO_RUNTIME_SHARED_FILES){
  const target=join(output,'studio',...file.split('/'));
  await mkdir(dirname(target),{recursive:true});
  await cp(join(repository,'packages','toolkit','web',...file.split('/')),target,{force:true});
}
console.log('4/5 Install the exact NPM-build assets and Player under local routes');
await cp(playerOut,join(output,'player','current','dist'),{recursive:true,force:true});
await cp(join(repository,'packages','studio','dist'),join(output,'studio','current','dist'),{recursive:true,force:true});
await mkdir(join(output,'npm-studio'),{recursive:true});
await cp(join(repository,'dev','studio-preview','index.html'),join(output,'npm-studio','index.html'),{force:true});
await cp(join(repository,'scripts','serve-studio-local-preview.mjs'),join(output,'preview-server.mjs'),{force:true});
console.log('5/5 Save reproducible preview metadata');
const pkg=JSON.parse(await readFile(join(repository,'packages','studio','package.json'),'utf8'));
const manifest={branch:'mejorastudio',commit:process.env.GITHUB_SHA||null,studioPackage:'@p2lrn/studio',
 studioVersion:pkg.version,playerVersion:player.release.webSdkVersion,mode:'compiled-from-repository',
 paths:['/studio/','/npm-studio/'],publicDeployment:false,mainModified:false};
await writeFile(join(output,'preview-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({ok:true,output,...manifest},null,2));
