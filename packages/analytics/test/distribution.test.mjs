import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const CURRENT=JSON.parse(readFileSync(join(ROOT,'package.json'),'utf8')).version;
const DIST=join(ROOT,'dist');
function run(command,args,{cwd=ROOT}={}){
  if(process.platform==='win32'&&command==='npm'){
    const cli=join(dirname(process.execPath),'node_modules','npm','bin','npm-cli.js');
    if(existsSync(cli))return spawnSync(process.execPath,[cli,...args],{cwd,encoding:'utf8'});
  }
  return spawnSync(command,args,{cwd,encoding:'utf8'});
}

test('Analytics builds every imported module and includes it in the npm tarball',()=>{
  const built=run(process.execPath,[join(ROOT,'scripts','build-dist.mjs')]);
  assert.equal(built.status,0,built.stderr||built.stdout);
  for(const name of ['p2lrn-analytics.esm.js','p2lrn-analytics.js','model.js','course-data-source.js','locale.js','release.json']){
    assert.equal(existsSync(join(DIST,name)),true,'Missing Analytics dist/'+name);
  }
  const release=JSON.parse(readFileSync(join(DIST,'release.json'),'utf8'));
  assert.equal(release.version,CURRENT);
  const dry=run('npm',['pack','--ignore-scripts','--json','--dry-run','.']);
  assert.equal(dry.status,0,dry.stderr||dry.stdout);
  const paths=new Set(JSON.parse(dry.stdout)[0].files.map(file=>file.path));
  for(const item of ['dist/model.js','dist/locale.js','dist/p2lrn-analytics.esm.js','dist/course-data-source.js','types/index.d.ts']){
    assert(paths.has(item),'NPM package is missing '+item);
  }
  assert.equal([...paths].some(p=>p.startsWith('test/')),false);
});

test('Analytics tgz installs offline and imports panel/results/course by package name',()=>{
  const temp=mkdtempSync(join(tmpdir(),'p2lrn-analytics-npm-'));
  try{
    const packed=run('npm',['pack','--ignore-scripts','--json','--pack-destination',temp,'.']);
    assert.equal(packed.status,0,packed.stderr||packed.stdout);
    const name=JSON.parse(packed.stdout)[0].filename;
    const project=join(temp,'app');
    mkdirSync(project);
    writeFileSync(join(project,'package.json'),'{"type":"module","private":true}\n');
    const installed=run('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund','--no-save',join(temp,name)],{cwd:project});
    assert.equal(installed.status,0,installed.stderr||installed.stdout);
    const probe=[
      'globalThis.HTMLElement=class extends EventTarget { attachShadow(){ return {replaceChildren(){}}; } };',
      'const elements=new Map();',
      'globalThis.customElements={get:n=>elements.get(n),define:(n,v)=>elements.set(n,v)};',
      "const analytics=await import('@p2lrn/analytics');",
      "const results=await import('@p2lrn/analytics/results');",
      "const course=await import('@p2lrn/analytics/course');",
      "if(analytics.P2LRN_ANALYTICS_VERSION!==EXPECTED_VERSION||",
      "   typeof analytics.loadAnalyticsResultSource!=='function'||",
      "   typeof results.analyticsDatasetFromResultFiles!=='function'||",
      "   typeof course.createCourseAnalyticsDataSource!=='function'||",
      "   !elements.get('p2lrn-analytics'))process.exit(2);",
    ].join('\n').replace('EXPECTED_VERSION',JSON.stringify(CURRENT));
    const loaded=run(process.execPath,['--input-type=module','-e',probe],{cwd:project});
    assert.equal(loaded.status,0,loaded.stderr||loaded.stdout);
  }finally{
    rmSync(temp,{recursive:true,force:true});
  }
});
