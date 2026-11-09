import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {tmpdir} from 'node:os';
import {promisify} from 'node:util';

const execFileAsync=promisify(execFile);

export const H5P_STANDALONE_VERSION='3.8.2';
export const H5P_STANDALONE_INTEGRITY='sha512-r7eQtTzBk/dbaQZ+tA9XD5FeSmyMxlypRZXudiheCnC8zAT0/zNgUvO4MZtZaznwfYVo98o7do5uxLTUQrxxwg==';
export const THREE_VERSION='0.186.1';
export const THREE_INTEGRITY='sha512-blFeqb49wRCSGUGj7gtpfnSGHy2lwDk94RhUmS1c/hTby70kvChbWpkJ4Pm1390LqzzvTmzgXKHPEafJwCb8jA==';
export const RAPIER3D_VERSION='0.21.0';
export const RAPIER3D_INTEGRITY='sha512-tCl1HPGwOhn5aCQbgqWbOH+Nx/5fnr3IPAnzQuR7zIhC/raqi2yxC6LhvZqjdI2El5hQgY5RDAwDrAjAi2FdPA==';

async function npmCommand(args,{cwd}={}){
  let command='npm', finalArgs=args;
  if(process.platform==='win32'){
    const candidates=[process.env.npm_execpath,join(dirname(process.execPath),'node_modules','npm','bin','npm-cli.js')].filter(Boolean);
    let cli=null;
    for(const candidate of candidates){try{if((await stat(candidate)).isFile()){cli=candidate;break;}}catch{}}
    if(!cli)throw new Error('Unable to locate npm-cli.js for safe Windows execution.');
    command=process.execPath;finalArgs=[cli,...args];
  }
  const env={...process.env,npm_config_dry_run:'false',npm_config_json:'false'};
  delete env.npm_config_pack_destination;
  return execFileAsync(command,finalArgs,{cwd,env,maxBuffer:4*1024*1024});
}

async function npmPackExact(spec,work,expectedIntegrity){
  await mkdir(work,{recursive:true});
  await npmCommand(['pack',spec,'--ignore-scripts','--silent','--pack-destination',work],{cwd:work});
  const archives=(await readdir(work)).filter((name)=>name.endsWith('.tgz'));
  if(archives.length!==1)throw new Error(`npm pack produced ${archives.length} archives for ${spec}; expected exactly one.`);
  const archivePath=join(work,archives[0]);
  const bytes=await readFile(archivePath);
  const actual='sha512-'+createHash('sha512').update(bytes).digest('base64');
  if(actual!==expectedIntegrity)throw new Error(`${spec} tarball integrity mismatch: expected ${expectedIntegrity}, got ${actual}`);
  await execFileAsync('tar',['-xzf',archivePath,'-C',work],{maxBuffer:4*1024*1024});
  return join(work,'package');
}

async function installH5pStandalone(dist,work){
  const root=await npmPackExact(`h5p-standalone@${H5P_STANDALONE_VERSION}`,work,H5P_STANDALONE_INTEGRITY);
  const metadata=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
  if(metadata.version!==H5P_STANDALONE_VERSION)throw new Error(`Unexpected h5p-standalone version: ${metadata.version}`);
  const assetsRoot=join(dist,'runtime-host','assets');
  await mkdir(join(assetsRoot,'styles'),{recursive:true});
  for(const [from,to] of [['dist/main.bundle.js','main.bundle.js'],['dist/frame.bundle.js','frame.bundle.js'],['dist/styles/h5p.css','styles/h5p.css']]){
    const source=join(root,...from.split('/'));
    if(!(await stat(source)).isFile())throw new Error(`Missing h5p-standalone asset: ${from}`);
    const target=join(assetsRoot,...to.split('/'));await mkdir(dirname(target),{recursive:true});await cp(source,target);
  }
  await cp(join(root,'dist','fonts'),join(assetsRoot,'fonts'),{recursive:true,force:true});
  await cp(join(root,'LICENSE'),join(assetsRoot,'LICENSE.h5p-standalone.txt'));
  await writeFile(join(assetsRoot,'h5p-standalone.json'),JSON.stringify({name:'h5p-standalone',version:H5P_STANDALONE_VERSION,license:'MIT'},null,2)+'\n');
}

async function installGame3dRuntime(dist,work){
  const threeRoot=await npmPackExact(`three@${THREE_VERSION}`,join(work,'three'),THREE_INTEGRITY);
  const rapierRoot=await npmPackExact(`@dimforge/rapier3d-compat@${RAPIER3D_VERSION}`,join(work,'rapier'),RAPIER3D_INTEGRITY);
  const vendor=join(dist,'vendor');await mkdir(vendor,{recursive:true});
  await cp(join(threeRoot,'build','three.module.js'),join(vendor,'three.module.js'));
  await cp(join(threeRoot,'build','three.core.js'),join(vendor,'three.core.js'));
  await cp(join(threeRoot,'LICENSE'),join(vendor,'LICENSE.three.txt'));
  // Use the exact same pinned Three.js runtime and GLTFLoader in Player.
  // Addons are localized to the packaged Three module, never a CDN import.
  await mkdir(join(vendor,'loaders'),{recursive:true});
  await mkdir(join(vendor,'utils'),{recursive:true});
  for(const [source,target] of [
    ['examples/jsm/loaders/GLTFLoader.js','loaders/GLTFLoader.js'],
    ['examples/jsm/utils/BufferGeometryUtils.js','utils/BufferGeometryUtils.js'],
    ['examples/jsm/utils/SkeletonUtils.js','utils/SkeletonUtils.js'],
  ]){
    const file=await readFile(join(threeRoot,...source.split('/')),'utf8');
    if(!file.includes("from 'three'"))throw new Error('Pinned Three addon imports changed: '+source);
    const compatible=file.replaceAll("from 'three'","from '../three.module.js'");
    await writeFile(join(vendor,...target.split('/')),compatible);
  }

  await cp(join(rapierRoot,'dist','rapier.mjs'),join(vendor,'rapier3d.mjs'));
  await cp(join(rapierRoot,'LICENSE'),join(vendor,'LICENSE.rapier3d.txt'));
  await writeFile(join(vendor,'game-3d-runtime.json'),JSON.stringify({three:{name:'three',version:THREE_VERSION,license:'MIT'},physics:{name:'@dimforge/rapier3d-compat',version:RAPIER3D_VERSION,license:'Apache-2.0'}},null,2)+'\n');
}

export async function installWebRuntimeAssets(dist){
  const work=await mkdtemp(join(tmpdir(),'p2lrn-web-runtime-'));
  try{
    await installH5pStandalone(dist,join(work,'h5p'));
    await installGame3dRuntime(dist,join(work,'game3d'));
  }finally{
    await rm(work,{recursive:true,force:true});
  }
  return Object.freeze({h5pStandaloneVersion:H5P_STANDALONE_VERSION,threeVersion:THREE_VERSION,rapier3dVersion:RAPIER3D_VERSION});
}
