// Build a scoped, reproducible Player fixture for Quest 3D QA.
// No deployment, npm publication or edits to another Git branch.
import {cp,mkdir,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {buildPlayerDistribution} from '../packages/player/scripts/build-dist.mjs';

const root=resolve(process.cwd());
const site=join(root,'.netlify-cdn');
const playerDist=join(root,'packages','player','dist');
await rm(site,{recursive:true,force:true});
await cp(join(root,'deploy','netlify','site'),site,{recursive:true,force:true});

const player=await buildPlayerDistribution({output:playerDist});
const published=join(site,'player','current','dist');
await mkdir(join(site,'player','current'),{recursive:true});
await cp(playerDist,published,{recursive:true,force:true});

for(const relative of [
  'p2lrn.js','renderers/questionnaire-3d.js',
  'game-3d/three-runtime.js','vendor/three.module.js',
  'vendor/rapier3d.mjs','questionnaire-games.css',
]){
  const file=join(published,...relative.split('/'));
  const metadata=await stat(file);
  if(!metadata.isFile()||metadata.size<100)
    throw new Error('Missing compiled Quest 3D runtime: '+relative);
}
const manifest={
  branch:'mejorastudio',
  commit:process.env.GITHUB_SHA??null,
  playerVersion:player.release.webSdkVersion,
  testedPaths:['/demo/','/player/current/dist/renderers/questionnaire-3d.js'],
  output:'temporary local-only .netlify-cdn',
};
await writeFile(join(site,'quest3d-qa-build.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('P2LRN_QUEST3D_QA_BUILD='+JSON.stringify(manifest));
