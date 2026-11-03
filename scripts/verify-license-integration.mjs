import {readFile, stat} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
// Ensure the public ES/EN explanation tracks the binding Annex A grant.
import './verify-license-page.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

async function text(path) {
  return readFile(join(root,path),'utf8');
}
async function file(path) {
  const info = await stat(join(root,path));
  if (!info.isFile() || info.size < 1) throw new Error('Missing or empty file: ' + path);
}
function requireText(content, needle, label) {
  if (!content.includes(needle)) throw new Error(label + ' missing: ' + needle);
}
function forbidText(content, needle, label) {
  if (content.includes(needle)) throw new Error(label + ' contains stale text: ' + needle);
}

const [
  license,notice,playerLicense,toolkitLicense,playerNotice,toolkitNotice,
  playerThird,h5pThird,playerPackageText,toolkitPackageText,workflow,publishing,
  licensePage,buildDist,buildCdn,buildSite,refWebText,refPy,prTemplate
] = await Promise.all([
  text('LICENSE'),text('NOTICE.md'),text('packages/player/LICENSE'),text('packages/toolkit/LICENSE'),
  text('packages/player/NOTICE.md'),text('packages/toolkit/NOTICE.md'),
  text('packages/player/THIRD_PARTY_NOTICES.md'),text('packages/h5p-libraries/THIRD_PARTY_NOTICES.md'),
  text('packages/player/package.json'),text('packages/toolkit/package.json'),
  text('.github/workflows/p2lrn-ci.yml'),text('PUBLISHING.md'),
  text('deploy/netlify/site/licencia/index.html'),text('packages/player/scripts/build-dist.mjs'),
  text('deploy/netlify/build-cdn.mjs'),text('deploy/netlify/build-site.mjs'),
  text('reference-python-alpha15/web_sdk/package.json'),text('reference-python-alpha15/pyproject.toml'),
  text('.github/pull_request_template.md'),
]);

if (license !== playerLicense || license !== toolkitLicense) throw new Error('First-party LICENSE copies differ.');
const [studioLicense,analyticsLicense,studioNotice,analyticsNotice,analyticsPackageText]=await Promise.all([
  text('packages/studio/LICENSE'),text('packages/analytics/LICENSE'),text('packages/studio/NOTICE.md'),text('packages/analytics/NOTICE.md'),text('packages/analytics/package.json'),
]);
if(license!==studioLicense||license!==analyticsLicense)throw new Error('Studio/Analytics LICENSE copies differ from root authority.');
if(notice!==studioNotice||notice!==analyticsNotice)throw new Error('Studio/Analytics NOTICE copies differ from root authority.');
const analyticsPackage=JSON.parse(analyticsPackageText);
if(analyticsPackage.license!=='SEE LICENSE IN LICENSE')throw new Error('Analytics license metadata mismatch.');
for(const item of ['LICENSE','NOTICE.md','src/','types/'])if(!analyticsPackage.files?.includes(item))throw new Error('Analytics npm files missing '+item);
if (notice !== playerNotice || notice !== toolkitNotice) throw new Error('First-party NOTICE copies differ.');
requireText(license,'P2LRN-NCSL 1.0','root LICENSE');
requireText(notice,'P2LRN-NCSL 1.0','root NOTICE');

forbidText(playerThird,'A public first-party license has not yet been selected.','Player third-party notices');
forbidText(h5pThird,'must be selected separately before public publication','H5P third-party notices');
requireText(playerThird,'P2LRN-NCSL 1.0','Player third-party notices');
requireText(h5pThird,'P2LRN-NCSL 1.0','H5P third-party notices');

const playerPackage=JSON.parse(playerPackageText);
const toolkitPackage=JSON.parse(toolkitPackageText);
if (playerPackage.license !== 'SEE LICENSE IN LICENSE') throw new Error('Player license metadata mismatch.');
if (toolkitPackage.license !== 'SEE LICENSE IN LICENSE') throw new Error('Toolkit license metadata mismatch.');
for (const item of ['LICENSE','NOTICE.md','source/']) {
  if (!playerPackage.files?.includes(item)) throw new Error('Player npm files missing ' + item);
}
for (const item of ['LICENSE','NOTICE.md','src/','tsconfig.json']) {
  if (!toolkitPackage.files?.includes(item)) throw new Error('Toolkit npm files missing ' + item);
}
requireText(playerPackage.scripts?.prepack ?? '','prepare-source-snapshot.mjs','Player prepack');

for (const item of [
  "'LICENSE'","'NOTICE.md'","'CONTRIBUTING.md'","'scripts/**'",
  "node scripts/check-publish-ready.mjs","node scripts/verify-license-integration.mjs","p2lrn-windows"
]) requireText(workflow,item,'CI workflow');

requireText(publishing,'node scripts/check-publish-ready.mjs','PUBLISHING');
requireText(publishing,'/player/<version>/source/','PUBLISHING source docs');

requireText(licensePage,'href="/LICENSE"','license page');
requireText(licensePage,'/player/current/source/','license page source link');
if (/github\.com\/josemarcosfrodo\/p2lrn\/blob\/main\/LICENSE/i.test(licensePage)) {
  throw new Error('License page still depends on private GitHub LICENSE URL.');
}

for (const item of ["id:'P2LRN-NCSL-1.0'","correspondingSource:'../source/'","join(playerRoot,'LICENSE')"]) {
  requireText(buildDist,item,'build-dist license metadata');
}
for (const item of ["preparePlayerSourceSnapshot","versionedBasePath:\`/player/\${version}/source/\`","url:'/LICENSE'"]) {
  requireText(buildCdn,item,'build-cdn source metadata');
}
for (const item of ["Published /LICENSE is not byte-identical","P2LRN-NCSL 1.0","/player/current/source/"]) {
  requireText(buildSite,item,'build-site legal gate');
}

const refWeb=JSON.parse(refWebText);
if (refWeb.private !== true || refWeb.license !== 'UNLICENSED') {
  throw new Error('reference-python-alpha15 web SDK must stay private and UNLICENSED.');
}
requireText(refPy,'UNLICENSED - reference-only','reference Python pyproject');
requireText(prTemplate,'Contributor Grant','PR template');

for (const path of [
  'packages/player/scripts/prepare-source-snapshot.mjs',
  'packages/toolkit/src/index.ts',
  'packages/toolkit/tsconfig.json',
  'CONTRIBUTING.md',
]) await file(path);

console.log(JSON.stringify({
  ok:true,
  license:'P2LRN-NCSL-1.0',
  firstPartyCopiesIdentical:true,
  npmSourceDeclared:true,
  cdnSourceDeclared:true,
  privateRepositoryNotRequiredForPublicLicenseAccess:true,
  referencePythonProtectedFromAccidentalNpmPublish:true,
  contributorGrantTemplate:true,
},null,2));
