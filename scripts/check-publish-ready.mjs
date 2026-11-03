import {access, readFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const packages = [
  {name:'@p2lrn/player', path:'packages/player/package.json', firstParty:true},
  {name:'@p2lrn/toolkit', path:'packages/toolkit/package.json', firstParty:true},
  {name:'@p2lrn/studio', path:'packages/studio/package.json', firstParty:true},
  {name:'@p2lrn/analytics', path:'packages/analytics/package.json', firstParty:true},
  {name:'@p2lrn/h5p-libraries', path:'packages/h5p-libraries/package.json', firstParty:false},
];

const loaded = [];
for (const item of packages) {
  const pkg = JSON.parse(await readFile(resolve(root,item.path),'utf8'));
  loaded.push({...item,pkg});
}

const canonicalRepository='git+https://github.com/josemarcosdzb/p2lrn.git';
for(const item of loaded){
  if(item.pkg.repository?.url!==canonicalRepository)throw new Error(`${item.name} contains stale GitHub repository metadata`);
}

const versions = new Set(loaded.map((item)=>item.pkg.version));
if (versions.size !== 1) {
  throw new Error('P2LRN packages must publish with one aligned version: ' + loaded.map((x)=>`${x.name}=${x.pkg.version}`).join(', '));
}

const rootLicense = await readFile(resolve(root,'LICENSE'),'utf8');
const rootNotice = await readFile(resolve(root,'NOTICE.md'),'utf8');

for (const item of loaded.filter((x)=>x.firstParty)) {
  const license = String(item.pkg.license ?? '').trim();
  if (license !== 'SEE LICENSE IN LICENSE') {
    throw new Error(`${item.name} must declare "SEE LICENSE IN LICENSE"; found: ${license || '<empty>'}`);
  }

  const packageDir = resolve(root, dirname(item.path));
  const localLicensePath = resolve(packageDir,'LICENSE');
  const localNoticePath = resolve(packageDir,'NOTICE.md');

  await access(localLicensePath);
  await access(localNoticePath);

  const localLicense = await readFile(localLicensePath,'utf8');
  const localNotice = await readFile(localNoticePath,'utf8');

  if (localLicense !== rootLicense) {
    throw new Error(`${item.name} LICENSE must be byte-identical to the root LICENSE authority.`);
  }
  if (localNotice !== rootNotice) {
    throw new Error(`${item.name} NOTICE.md must be byte-identical to the root NOTICE.md authority.`);
  }

  const files = Array.isArray(item.pkg.files) ? item.pkg.files : [];
  if (!files.includes('LICENSE') || !files.includes('NOTICE.md')) {
    throw new Error(`${item.name} must include LICENSE and NOTICE.md in its npm files list.`);
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
  firstPartyLicense:'P2LRN-NCSL-1.0',
  packages:loaded.map((x)=>({name:x.name,license:x.pkg.license})),
},null,2));
