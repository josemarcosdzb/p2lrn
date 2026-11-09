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
const previewName=output.split(/[\\/]/).at(-1);
if(!output.toLowerCase().startsWith((downloads+'\\').toLowerCase())||
   !/^p2lrn-mejorastudio-preview(?:-[a-f0-9]{7,16})?$/i.test(previewName))
  throw Error('Output must be the canonical p2lrn-mejorastudio-preview directory under Downloads (legacy versioned QA directories remain readable).');
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
// Player's demo requires this root-scoped service worker before course launch.
await cp(join(playerOut,'p2lrn-sw.js'),join(output,'p2lrn-sw.js'),{force:true});
// Reject stale Player builds that still carry the removed arrow pad or floating labels.
const compiled3d=await readFile(join(playerOut,'renderers','questionnaire-3d.js'),'utf8');
const compiledScene=await readFile(join(playerOut,'game-3d','three-runtime.js'),'utf8');
if(compiled3d.includes('p2lrn-3d-move-pad')||compiled3d.includes('Recentrar jugador')
  ||!compiled3d.includes('matchingLocked')||!compiled3d.includes('createVirtualJoystick'))
  throw new Error('Preview Player still contains legacy 3D controls or missing matching finalization');
if(!compiledScene.includes('p2lrn-box-face-label')||compiledScene.includes('new THREE.Sprite('))
  throw new Error('Preview Player did not include text fixed to the front of boxes');

await cp(join(repository,'packages','studio','dist'),join(output,'studio','current','dist'),{recursive:true,force:true});
// Verify that both editor hosts and the Player ship the new Studio features.
// Fail before advertising a local URL if the compiler omitted any dependency.
for(const rel of [
  'studio/runtime/studio-shapes.js',
  'studio/runtime/studio-drop-activity.js',
  'studio/current/dist/runtime/studio-shapes.js',
  'studio/current/dist/runtime/studio-drop-activity.js',
  'player/current/dist/renderers/lesson-drop-runtime.js',
  'player/current/dist/renderers/lesson-drop-sandbox.js',
]){
  const bytes=await readFile(join(output,...rel.split('/')));
  if(bytes.byteLength<250)throw new Error('Incomplete Studio feature asset: '+rel);
}
const shapesCode=await readFile(join(output,'studio','runtime','studio-shapes.js'),'utf8');
if(!shapesCode.includes("id:'triangle'")||!shapesCode.includes("id:'speech-oval'"))
  throw new Error('Local Studio does not contain the complete shape palette');
const dragCode=await readFile(join(output,'studio','runtime','studio-drop-activity.js'),'utf8');
if(!dragCode.includes('setStudioDropBackground')||!dragCode.includes('mountStudioDropAuthoring')||
   !dragCode.includes('setStudioDropItemImage')||!dragCode.includes('setStudioDropItemText')||
   !dragCode.includes('setStudioDropItemImageAlt'))
  throw new Error('Local Studio is missing text/image draggable tile authoring');
const commandCode=await readFile(join(output,'studio','runtime','command-bar.js'),'utf8');
if(!commandCode.includes('Poner imagen en la ficha')||!commandCode.includes('Descripción de imagen de la ficha'))
  throw new Error('Local Studio has not exposed the card image controls');
const runtimeCode=await readFile(join(output,'player','current','dist','renderers','lesson-drop-runtime.js'),'utf8');
if(!runtimeCode.includes('tileName')||!runtimeCode.includes('data-p2lrn-dnd-item-image'))
  throw new Error('Local Player is missing accessible image-only card support');
await mkdir(join(output,'npm-studio'),{recursive:true});
await cp(join(repository,'dev','studio-preview','index.html'),join(output,'npm-studio','index.html'),{force:true});
await cp(join(repository,'scripts','serve-studio-local-preview.mjs'),join(output,'preview-server.mjs'),{force:true});
console.log('5/5 Save reproducible preview metadata');
const pkg=JSON.parse(await readFile(join(repository,'packages','studio','package.json'),'utf8'));
const manifest={branch:'mejorastudio',commit:process.env.GITHUB_SHA||null,studioPackage:'@p2lrn/studio',
 studioVersion:pkg.version,playerVersion:player.release.webSdkVersion,mode:'compiled-from-repository',
 paths:['/studio/','/npm-studio/','/demo/'],visualAuthoring:'23-shapes+dropdown+image-hotspots',quest3dUx:'touch-joystick+face-labels+locked-matching',publicDeployment:false,mainModified:false};
await writeFile(join(output,'preview-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({ok:true,output,...manifest},null,2));
