import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import recordConversion from '../netlify/functions/p2lrn-conversion.mjs';
import {STUDIO_RUNTIME_SHARED_FILES} from '../deploy/netlify/studio-runtime-assets.mjs';
import {createP2LRNStudioDocument} from '../packages/toolkit/web/studio/new-document.js';

const repoRoot=join(dirname(fileURLToPath(import.meta.url)),'..');
const file=(relative)=>readFileSync(join(repoRoot,relative),'utf8');

test('Studio build includes its transitive renderer localization module',()=>{
  assert.ok(STUDIO_RUNTIME_SHARED_FILES.includes('renderers/ui-i18n.js'));
  const build=file('deploy/netlify/build-site.mjs');
  assert.match(build,/Studio renderer translation dependency not deployed/);
  const browserFixture=file('scripts/verify-local-viewer.mjs');
  assert.match(browserFixture,/await mkdir\(dirname\(destination\),\{recursive:true\}\)/);
});

test('fresh Studio documents contain a usable first lesson, not a shell',async()=>{
  for(const lang of ['es','en']){
    const doc=createP2LRNStudioDocument({language:lang});
    const course=doc.entity(doc.rootId);
    const unit=doc.entity(course.children[0]);
    const lesson=doc.entity(unit.children[0]);
    assert.equal(unit.type,'unit');
    assert.equal(lesson.type,'activity');
    const editable=await doc.readEditableText(lesson.id);
    assert.equal(editable.mediaType,'text/html');
    assert.match(editable.text,lang==='es'?/Empieza a escribir aquí/:/Start writing here/);
  }
});

test('Studio in both languages opens itself and keeps drafts, controls and intentional new course',()=>{
  for(const lang of ['','en/']){
    const js=file('deploy/netlify/site/'+lang+'studio/studio.js');
    const html=file('deploy/netlify/site/'+lang+'studio/index.html');
    assert.match(js,/async function initializeStudioWorkspace\(\)/);
    assert.match(js,/void initializeStudioWorkspace\(\)/);
    assert.match(js,/await refreshDraftAvailability\(\)/);
    assert.match(js,/await recoverLatestDraft\(\)/);
    assert.match(js,/await createNewCourse\(\{automatic:true\}\)/);
    assert.match(js,/firstLessonId/);
    assert.match(js,/recoveredSelectedId:firstLessonId\|\|null/);
    assert.match(js,/document\.documentElement\.dataset\.p2lrnStudioReady='true'/);
    assert.match(js,/globalThis\.P2LRNRecordConversion\?\.\('studio_editor_ready'\)/);
    assert.match(js,/if\(!automatic && modified && !confirm/);
    assert.match(html,/data-create-course/);
    assert.match(html,/data-toolbar[^>]*hidden/);
    assert.match(html,/data-workspace[^>]*hidden/);
    assert.match(html,lang?/>New course<\//:/>Nuevo curso<\//);
  }
});

test('homepage offers direct Studio, Player and AI Skill actions in both locales',()=>{
  for(const [lang,prefix] of [['',''],['en/','/en']]){
    const html=file('deploy/netlify/site/'+lang+'index.html');
    assert.match(html,new RegExp('class="button primary" href="'+prefix+'/studio/"'));
    assert.match(html,new RegExp('href="'+prefix+'/demo/"'));
    assert.match(html,new RegExp('href="'+prefix+'/skills/#descargar"'));
    const tracker=file('deploy/netlify/site/'+lang+'p2lrn.js');
    assert.match(tracker,/globalThis\.P2LRNRecordConversion=emit/);
    assert.match(tracker,/skill_download_clicked/);
    assert.match(tracker,/navigator\.sendBeacon/);
  }
});

function eventRequest(record,origin='https://p2lrn.org'){
  return new Request('https://p2lrn.org/.netlify/functions/p2lrn-conversion',{
    method:'POST',headers:{'Content-Type':'text/plain','Origin':origin},
    body:JSON.stringify(record)
  });
}
const validEvent={event:'studio_editor_ready',page:'/studio/',locale:'es',destination:'',channel:'internal'};

test('the conversion endpoint rejects unexpected methods, foreign origins and personal data routes',async()=>{
  const base='https://p2lrn.org/.netlify/functions/p2lrn-conversion';
  assert.equal((await recordConversion(new Request(base))).status,405);
  assert.equal((await recordConversion(eventRequest(validEvent,'https://other.example'))).status,403);
  assert.equal((await recordConversion(eventRequest({...validEvent,event:'user_email'}))).status,400);
  assert.equal((await recordConversion(eventRequest({...validEvent,page:'/private/user-id/'}))).status,400);
  assert.equal((await recordConversion(eventRequest({...validEvent,channel:'some-query?q=secret'}))).status,400);
});

test('the conversion endpoint logs only the allowed event dimensions',async()=>{
  let line='';
  const original=console.info;
  console.info=(message)=>{line=String(message);};
  try{
    const response=await recordConversion(eventRequest({...validEvent,userId:'sensitive',query:'private'}));
    assert.equal(response.status,204);
  }finally{console.info=original;}
  assert.match(line,/^P2LRN_CONVERSION /);
  const entry=JSON.parse(line.slice('P2LRN_CONVERSION '.length));
  assert.equal(entry.event,'studio_editor_ready');
  assert.equal(entry.page,'/studio/');
  assert.equal(entry.locale,'es');
  assert.equal(entry.channel,'internal');
  assert.ok(!line.includes('sensitive')&&!line.includes('private'));
  assert.deepEqual(Object.keys(entry).sort(),['at','channel','destination','event','locale','page']);
});
