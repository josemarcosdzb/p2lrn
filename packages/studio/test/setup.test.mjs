import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const exec=promisify(execFile);
const cli=fileURLToPath(new URL('../bin/p2lrn-studio.mjs',import.meta.url));

test('setup auto detects Next.js, creates route and course directory',async()=>{
  const root=await mkdtemp(join(tmpdir(),'p2lrn-next-'));
  try{
    await writeFile(join(root,'package.json'),JSON.stringify({dependencies:{next:'16.0.0'}}));
    const {stdout}=await exec(process.execPath,[cli,'setup','--cwd',root]);
    const out=JSON.parse(stdout);
    assert.equal(out.target,'next');
    assert.equal((await stat(join(root,'course'))).isDirectory(),true);
    assert.match(await readFile(join(root,'app','api','p2lrn','studio','save','route.ts'),'utf8'),/handleP2LRNStudioSave/);
    assert.match(await readFile(join(root,'app','api','p2lrn','studio','read','route.ts'),'utf8'),/handleP2LRNStudioReader/);
    assert.match(await readFile(join(root,'app','api','p2lrn','studio','import','route.ts'),'utf8'),/handleP2LRNStudioExternalImport/);
    assert.equal(out.readerEndpoint,'/api/p2lrn/studio/read');
    assert.equal(out.importEndpoint,'/api/p2lrn/studio/import');
    assert.deepEqual(out.generatedEndpoints,{save:true,reader:true,import:true});
    const setupReadme=await readFile(join(root,'p2lrn-setup','README.md'),'utf8');
    assert.match(setupReadme,/reader-endpoint="\/api\/p2lrn\/studio\/read"/);
    assert.match(setupReadme,/import-endpoint="\/api\/p2lrn\/studio\/import"/);
  }finally{await rm(root,{recursive:true,force:true})}
});

test('setup discovers project root from a nested directory',async()=>{
  const root=await mkdtemp(join(tmpdir(),'p2lrn-root-'));
  try{
    await writeFile(join(root,'package.json'),JSON.stringify({dependencies:{next:'16.0.0'}}));
    const nested=join(root,'src','features','authoring');
    await import('node:fs/promises').then(({mkdir})=>mkdir(nested,{recursive:true}));
    const {stdout}=await exec(process.execPath,[cli,'setup'],{cwd:nested});
    const out=JSON.parse(stdout);
    assert.equal(resolve(out.projectRoot),resolve(root));
    assert.equal(out.target,'next');
    assert.equal((await stat(join(root,'course'))).isDirectory(),true);
    assert.equal(await stat(join(root,'app','api','p2lrn','studio','save','route.ts')).then(()=>true),true);
  }finally{await rm(root,{recursive:true,force:true})}
});

test('setup auto detects FastAPI from requirements',async()=>{
  const root=await mkdtemp(join(tmpdir(),'p2lrn-fastapi-'));
  try{
    await writeFile(join(root,'requirements.txt'),'fastapi==0.120.0\n');
    const {stdout}=await exec(process.execPath,[cli,'setup','--cwd',root]);
    const out=JSON.parse(stdout);
    assert.equal(out.target,'fastapi');
    assert.deepEqual(out.generatedEndpoints,{save:true,reader:true,import:true});
    const generated=await readFile(join(root,'p2lrn_studio.py'),'utf8');
    assert.match(generated,/APIRouter/);
    assert.match(generated,/api\/p2lrn\/studio\/read/);
    assert.match(generated,/api\/p2lrn\/studio\/import/);
    assert.equal((await stat(join(root,'p2lrn-setup','p2lrn-studio-bridge.mjs'))).isFile(),true);
    const setupReadme=await readFile(join(root,'p2lrn-setup','README.md'),'utf8');
    assert.match(setupReadme,/reader-endpoint="\/api\/p2lrn\/studio\/read"/);
    assert.match(setupReadme,/import-endpoint="\/api\/p2lrn\/studio\/import"/);
  }finally{await rm(root,{recursive:true,force:true})}
});

test('setup supports custom course path and substitutes it',async()=>{
  const root=await mkdtemp(join(tmpdir(),'p2lrn-custom-'));
  try{
    const {stdout}=await exec(process.execPath,[cli,'setup','next','--cwd',root,'--course-path','data/courses']);
    const out=JSON.parse(stdout);
    assert.equal(out.coursePath,'data/courses');
    assert.equal((await stat(join(root,'data','courses'))).isDirectory(),true);
    assert.match(await readFile(join(root,'app','api','p2lrn','studio','save','route.ts'),'utf8'),/data\/courses/);
  }finally{await rm(root,{recursive:true,force:true})}
});

test('setup refuses overwrite unless --force is used',async()=>{
  const root=await mkdtemp(join(tmpdir(),'p2lrn-safe-'));
  try{
    await exec(process.execPath,[cli,'setup','next','--cwd',root]);
    await assert.rejects(()=>exec(process.execPath,[cli,'setup','next','--cwd',root]),/File already exists/);
    const {stdout}=await exec(process.execPath,[cli,'setup','next','--cwd',root,'--force']);
    assert.equal(JSON.parse(stdout).ok,true);
  }finally{await rm(root,{recursive:true,force:true})}
});

test('generic target provides a backend-neutral contract',async()=>{
  const root=await mkdtemp(join(tmpdir(),'p2lrn-generic-'));
  try{
    await exec(process.execPath,[cli,'setup','generic','--cwd',root]);
    const text=await readFile(join(root,'p2lrn-setup','GENERIC.md'),'utf8');
    assert.match(text,/POST \/api\/p2lrn\/studio\/save/);
    assert.match(text,/POST \/api\/p2lrn\/studio\/read/);
    assert.match(text,/POST \/api\/p2lrn\/studio\/import/);
    assert.match(text,/authentication and authorization/i);
  }finally{await rm(root,{recursive:true,force:true})}
});


test('every supported setup target materializes safely with no unresolved placeholders',async()=>{
  const targets=[
    'next','sveltekit','nuxt','astro','remix','react-router',
    'express','fastify','hono','nest','node',
    'php','laravel','symfony','django','fastapi','flask','rails',
    'aspnet','spring','go','rust','generic',
  ];
  for(const target of targets){
    const root=await mkdtemp(join(tmpdir(),'p2lrn-all-'+target.replace(/[^a-z0-9]+/gi,'-')+'-'));
    try{
      const {stdout}=await exec(process.execPath,[cli,'setup',target,'--cwd',root,'--course-path','courses/custom']);
      const out=JSON.parse(stdout);
      assert.equal(out.ok,true,target);
      assert.equal(out.target,target);
      assert.deepEqual(out.generatedEndpoints,{save:true,reader:true,import:true},target);
      assert.equal((await stat(join(root,'courses','custom'))).isDirectory(),true);
      const bodies=[];
      for(const rel of out.files){
        const full=resolve(root,rel);
        assert.equal(relative(root,full).startsWith('..'),false,target+' wrote outside project: '+rel);
        const body=await readFile(full,'utf8');
        bodies.push(rel+'\n'+body);
        assert.doesNotMatch(body,/__(?:COURSE_PATH|ENDPOINT|READER_ENDPOINT|IMPORT_ENDPOINT)__/u,target+' left unresolved placeholder in '+rel);
      }
      const joined=bodies.join('\n');
      assert.match(joined,/\/api\/p2lrn\/studio\/save/u,target+' missing save route');
      assert.match(joined,/\/api\/p2lrn\/studio\/read/u,target+' missing Reader route');
      assert.match(joined,/\/api\/p2lrn\/studio\/import/u,target+' missing import route');
      const setupReadme=await readFile(join(root,'p2lrn-setup','README.md'),'utf8');
      assert.match(setupReadme,/Reader endpoint: \/api\/p2lrn\/studio\/read \(generated\)/u,target);
      assert.match(setupReadme,/Import endpoint: \/api\/p2lrn\/studio\/import \(generated\)/u,target);
    }finally{
      await rm(root,{recursive:true,force:true});
    }
  }
});


test('generated Express routes preserve shared 422 errors and do not expose absolute save paths',async()=>{
  const root=await mkdtemp(join(tmpdir(),'p2lrn-express-shared-'));
  try{
    await exec(process.execPath,[cli,'setup','express','--cwd',root,'--course-path','courses/custom']);
    const body=await readFile(join(root,'p2lrn-setup','express-route.mjs'),'utf8');
    for(const handler of ['handleP2LRNStudioSave','handleP2LRNStudioReader','handleP2LRNStudioExternalImport'])
      assert.match(body,new RegExp(handler));
    assert.match(body,/allowClientPath:false/);
    assert.doesNotMatch(body,/res\.json\(await saveP2LRNStudioPackage/);
    assert.doesNotMatch(body,/convertP2LRNStudioExternalPackage/);
    assert.match(body,/response\.status/);
    assert.match(body,/response\.arrayBuffer\(\)/);
  }finally{await rm(root,{recursive:true,force:true})}
});


test('setup rejects injected, control-character, reserved Windows and traversal course paths',async()=>{
  const root=await mkdtemp(join(tmpdir(),'p2lrn-unsafe-paths-'));
  try{
    const invalid=[
      "course');process.exit(1);//", 'courses/" onerror="alert(1)',
      'courses/../other','courses/CON','courses/NUL.txt','courses/..',
      'courses/with space','courses/%2e%2e', 'courses/#fragment',
      'courses/evil\nline','courses/<script>', 'courses/a;b',
    ];
    for(const coursePath of invalid){
      await assert.rejects(()=>exec(process.execPath,
        [cli,'setup','next','--cwd',root,'--course-path',coursePath]),
        /Unsafe course path/,coursePath);
    }
    await assert.rejects(stat(join(root,'app')), {code:'ENOENT'},
      'Invalid input must fail before writing generated routes');
    const accepted=await exec(process.execPath,
      [cli,'setup','next','--cwd',root,'--course-path','academy/courses-2026.1']);
    assert.equal(JSON.parse(accepted.stdout).coursePath,'academy/courses-2026.1');
  }finally{await rm(root,{recursive:true,force:true})}
});
