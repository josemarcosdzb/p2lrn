import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const base=new URL('../',import.meta.url);
const file=async p=>readFile(new URL(p,base),'utf8');
test('Course-content licensing remains distinct from redistributed H5P library licensing',async()=>{
 const [policy,studio,h5p]=await Promise.all([file('docs/DERECHOS-CONTENIDOS-CURSOS.md'),file('packages/studio/README.md'),file('packages/h5p-libraries/README.md')]);
 for(const source of [policy,studio,h5p])assert.match(source,/curso|course/i);
 assert.match(policy,/quien empaqueta o redistribuye bibliotecas/);
 assert.match(policy,/P2LRN no concede permisos/);
});
test('NPM technical QA does not confuse course rights with strict library redistribution gate',async()=>{
 const [check,pkg,inventory]=await Promise.all([file('scripts/verify-npm-pack.mjs'),file('packages/h5p-libraries/package.json'),file('scripts/audit-third-party-licenses.mjs')]);
 assert.doesNotMatch(check,/audit-third-party-licenses\.mjs'\),'--strict'/);
 assert.match(check,/thirdPartyReport\.ok/);
 assert.match(JSON.parse(pkg).scripts.prepublishOnly,/audit-third-party-licenses\.mjs --strict/);
 assert.match(inventory,/manualReviewRequired/);
});
