import {access, readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const packages = [
  {name:'@p2lrn/player', path:'packages/player/package.json', firstParty:true},
  {name:'@p2lrn/toolkit', path:'packages/toolkit/package.json', firstParty:true},
  {name:'@p2lrn/document-reader', path:'packages/document-reader/package.json', firstParty:true},
  {name:'@p2lrn/h5p-libraries', path:'packages/h5p-libraries/package.json', firstParty:false},
];

const loaded = [];
for (const item of packages) {
  const pkg = JSON.parse(await readFile(resolve(root,item.path),'utf8'));
  loaded.push({...item,pkg});
}
const versions = new Set(loaded.map((item)=>item.pkg.version));
if (versions.size !== 1) {
  throw new Error('P2LRN packages must publish with one aligned version: ' + loaded.map((x)=>`${x.name}=${x.pkg.version}`).join(', '));
}

for (const item of loaded.filter((x)=>x.firstParty)) {
  const license = String(item.pkg.license ?? '').trim();
  if (!license || license === 'UNLICENSED') {
    throw new Error(
      `${item.name} is still UNLICENSED. Choose the P2LRN first-party license before npm publish. ` +
      'Update packages/player/package.json and packages/toolkit/package.json consistently and add the corresponding root LICENSE file. ' +
      'Do not copy the Lumi/third-party license onto P2LRN source code.'
    );
  }
  if (license.startsWith('SEE LICENSE IN ')) {
    const relative = license.slice('SEE LICENSE IN '.length).trim();
    await access(resolve(root, relative));
  } else {
    // For SPDX identifiers we still require a root LICENSE file so the tarballs
    // have a human-readable license authority in the repository.
    await access(resolve(root,'LICENSE'));
  }
}

const h5p = loaded.find((x)=>x.name==='@p2lrn/h5p-libraries');
if (!String(h5p.pkg.license ?? '').startsWith('SEE LICENSE IN ')) {
  throw new Error('@p2lrn/h5p-libraries must keep its third-party notice license declaration.');
}
await access(resolve(root,'packages/h5p-libraries/THIRD_PARTY_NOTICES.md'));

console.log(JSON.stringify({
  ok:true,
  version:[...versions][0],
  packages:loaded.map((x)=>({name:x.name,license:x.pkg.license})),
},null,2));
