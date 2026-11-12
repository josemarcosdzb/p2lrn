import {createHash} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {LUMI_H5P_LIBRARY_COMMIT,EXPECTED_LIBRARY_COUNT} from '../packages/h5p-libraries/scripts/build.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const strict=process.argv.includes('--strict');
const read=async path=>readFile(join(root,path),'utf8');
const errors=[],warnings=[],licenseSummary={};
const packageNames=['player','toolkit','studio','analytics','h5p-libraries'];
const packages=await Promise.all(packageNames.map(async name=>{
  const value=JSON.parse(await read('packages/'+name+'/package.json'));
  return {name,value};
}));
const versions=new Set(packages.map(p=>p.value.version));
if(versions.size!==1)errors.push('Five package versions are not aligned');
const version=packages[0].value.version;
const playerNotice=await read('packages/player/THIRD_PARTY_NOTICES.md');
const h5pNotice=await read('packages/h5p-libraries/THIRD_PARTY_NOTICES.md');
for(const [name,notice,needles] of [
  ['player',playerNotice,['Three.js','0.186.1','MIT','Rapier 3D','0.21.0','Apache-2.0','h5p-standalone','3.8.2']],
  ['h5p-libraries',h5pNotice,[LUMI_H5P_LIBRARY_COMMIT,'AGPL-3.0','libraries']],
]){
  for(const text of needles)if(!notice.includes(text))errors.push(name+' notice missing '+text);
}
const safePath=s=>typeof s==='string'&&s.length>0&&!s.startsWith('/')&&!s.includes('\\')&&!s.split('/').includes('..');

const status=async path=>{
  try{const s=await stat(join(root,path));return s.isFile();}
  catch(error){if(error?.code==='ENOENT')return false;throw error;}
};
const playerDist='packages/player/dist';
let playerAssets=0;
for(const [path,signature] of [
  ['vendor/LICENSE.three.txt',/MIT License/i],
  ['vendor/LICENSE.rapier3d.txt',/Apache License|Apache-2\.0/i],
  ['runtime-host/assets/LICENSE.h5p-standalone.txt',/MIT License/i],
]){
  const full=playerDist+'/'+path;
  if(await status(full)){
    playerAssets++;
    const text=await read(full);
    if(!signature.test(text))errors.push('Unexpected license text in '+full);
  }else (strict?errors:warnings).push('Missing built Player third-party license text: '+full);
}
const manifestPath='packages/h5p-libraries/dist/index.json';
let libraryCount=0,metadataMissing=[],metadataMismatches=[],catalogVerified=false,missingFromMetadata=0,readmeLicenseEvidence=[];
if(await status(manifestPath)){
  const manifest=JSON.parse(await read(manifestPath));
  if(manifest.source?.commit!==LUMI_H5P_LIBRARY_COMMIT)errors.push('H5P archive does not match pinned Lumi source commit');
  if(manifest.libraryCount!==EXPECTED_LIBRARY_COUNT||!Array.isArray(manifest.libraries)||manifest.libraries.length!==EXPECTED_LIBRARY_COUNT)
    errors.push('H5P manifest does not contain the expected '+EXPECTED_LIBRARY_COUNT+' libraries');
  const digest='sha256:'+createHash('sha256').update(JSON.stringify(manifest.libraries)).digest('hex');
  if(digest!==manifest.catalogSha256)errors.push('H5P catalog metadata hash mismatch');
  const seen=new Set();
  for(const lib of manifest.libraries??[]){
    libraryCount++;
    if(!lib||!safePath(lib.folder)||!/^[-\w.]+$/.test(lib.folder)||seen.has(lib.folder)){errors.push('Invalid/duplicate H5P folder');continue}
    seen.add(lib.folder);
    const path='packages/h5p-libraries/dist/'+lib.folder+'/library.json';
    if(!await status(path)){errors.push('Missing H5P library.json: '+lib.folder);continue}
    const json=JSON.parse(await read(path));
    if(json.machineName!==lib.machineName||Number(json.majorVersion)!==lib.majorVersion||Number(json.minorVersion)!==lib.minorVersion)
      metadataMismatches.push(lib.folder+': id/version');
    if((json.license??null)!==(lib.license??null))metadataMismatches.push(lib.folder+': license');
    const declared=String(lib.license??'').trim();
    if(!declared||/^(?:unknown|none|unspecified|n\/a)$/i.test(declared)){
      missingFromMetadata++;
      let resolvedByFullReadme=false;
      if(lib.files.includes('README.md')){
        const readme=await read('packages/h5p-libraries/dist/'+lib.folder+'/README.md');
        if(/## License[\s\S]{0,80}\(The MIT License\)/i.test(readme)
           && /Copyright \(c\)/i.test(readme)
           && /Permission is hereby granted/i.test(readme)
           && /THE SOFTWARE IS PROVIDED/i.test(readme)){
          resolvedByFullReadme=true;
          readmeLicenseEvidence.push({folder:lib.folder,license:'MIT',evidence:lib.folder+'/README.md'});
          licenseSummary['MIT (original README)']=(licenseSummary['MIT (original README)']??0)+1;
        }
      }
      if(!resolvedByFullReadme)metadataMissing.push(lib.folder);
    }else licenseSummary[declared]=(licenseSummary[declared]??0)+1;
    if(!Array.isArray(lib.files)||!lib.files.includes('library.json'))errors.push(lib.folder+': missing original file list');
  }
  if(metadataMismatches.length)errors.push('H5P license metadata differs from upstream library.json for '+metadataMismatches.length+' entries');
  // Missing individual metadata does not erase upstream copyright or grant
  // new rights. The established distribution policy for this separate H5P
  // package retains the original Lumi source snapshot, third-party files
  // and THIRD_PARTY_NOTICES.md without assigning a guessed license.
  // Preserve the full manual-review inventory as an explicit warning. Strict
  // release errors remain for corrupted/mismatched source, missing notices,
  // missing bundled license files and inconsistent catalog metadata.
  if(metadataMissing.length)warnings.push('H5P upstream libraries with no explicit license in library.json or complete README: '+metadataMissing.length+'; original notices preserved, no license inferred');
  catalogVerified=errors.length===0;
}else (strict?errors:warnings).push('Built H5P catalog is unavailable; cannot audit the '+EXPECTED_LIBRARY_COUNT+' actual libraries');

const report={
  schema:'https://p2lrn.org/schema/third-party-audit/1',releaseVersion:version,
  source:{name:'Lumieducation/Lumi',commit:LUMI_H5P_LIBRARY_COMMIT},
  auditMode:strict?'release-strict':'local-inventory',
  evidence:{playerLicenseFiles:playerAssets,h5pLibraries:libraryCount,expectedH5pLibraries:EXPECTED_LIBRARY_COUNT,catalogVerified},
  licenseSummary,missingLicenseField:missingFromMetadata,readmeLicenseEvidence,manualReviewRequired:metadataMissing,
  errors,warnings,
  ok:errors.length===0,
  note:'Unspecified individual H5P license metadata remains unresolved and is not re-licensed. Distribute unmodified upstream code with original notices; this mechanical inventory is not a legal opinion on AGPL, GPL, CC or mixed-license dependencies.'
};
console.log(JSON.stringify(report,null,2));
if(errors.length)process.exitCode=1;
