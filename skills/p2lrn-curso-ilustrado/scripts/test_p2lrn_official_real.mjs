// End-to-end verification against the actual compiled official Toolkit, not a mock.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {run,capabilities} from './p2lrn_official.mjs';
const rootIndex=process.argv.indexOf('--root');
const root=rootIndex>=0?resolve(process.argv[rootIndex+1]):process.cwd();
const env=await capabilities(root);
assert.ok(env.compatibleNode&&env.packages.toolkit.installed&&env.packages.toolkit.exact,
 'Toolkit must be compiled and match the exact tested release');
const dir=await mkdtemp(join(tmpdir(),'p2lrn-skill-official-'));
try{
 const plan=join(dir,'plan.json'),original=join(dir,'original.p2lrn');
 await writeFile(plan,JSON.stringify({title:'P2LRN official Skill E2E',language:'es',
  rights:{author:'P2LRN QA'},units:[{key:'unidad1',title:'Unidad 1',parent:'course'}],
  operations:[{method:'addUrl',options:{key:'fuente1',title:'Fuente docente',url:'https://example.org/curso',parent:'unidad1'}}]}));
 const result=await run(['create',plan,original,'--root',root]);
 assert.ok(result.created&&result.contentRoot);
 assert.equal((await run(['verify',original,'--root',root])).valid,true);
 assert.ok((await run(['inspect',original,'--root',root])).summary);
 const before=createHash('sha256').update(await readFile(original)).digest('hex');
 await run(['open',original,join(dir,'editado'),'--root',root]);
 const changes=join(dir,'changes.json');await writeFile(changes,JSON.stringify({operations:[{method:'setCourseMetadata',options:{title:'Curso editado',incrementRevision:true}}]}));
 await run(['edit',join(dir,'editado'),changes,'--root',root]);
 const newer=join(dir,'edited.p2lrn');
 await run(['build',join(dir,'editado'),newer,'--root',root]);
 assert.equal((await run(['verify',newer,'--root',root])).valid,true);
 assert.equal(createHash('sha256').update(await readFile(original)).digest('hex'),before,'Do not overwrite the original');
 const doc=join(dir,'apuntes.txt');await writeFile(doc,'Lección de demostración');
 assert.ok((await run(['read-document',doc,'--root',root])).document);
 await assert.rejects(()=>run(['build',join(dir,'editado'),original,'--root',root]),/sobrescribir/);
 console.log('OFFICIAL_SKILL_TOOLKIT_E2E_OK '+JSON.stringify({version:env.expected.toolkit,contentRoot:result.contentRoot}));
}finally{await rm(dir,{recursive:true,force:true})}
