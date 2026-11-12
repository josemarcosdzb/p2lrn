import test from 'node:test';
import assert from 'node:assert/strict';
import {assertScormScriptReferences, createScormApi} from '../web/scorm-runtime-core.js';

test('restoring a bookmark cannot replace the SCORM session identity',()=>{
  for(const version of ['1.2','2004']) {
    const id=version==='2004'?'cmi.learner_id':'cmi.core.student_id';
    const name=version==='2004'?'cmi.learner_name':'cmi.core.student_name';
    const location=version==='2004'?'cmi.location':'cmi.core.lesson_location';
    const runtime=createScormApi({version,learnerId:'',learnerName:'',initialState:{values:{[id]:'old-platform-user',[name]:'Old Private Name',[location]:'page-2'}}});
    const initialize=version==='2004'?'Initialize':'LMSInitialize';
    const get=version==='2004'?'GetValue':'LMSGetValue';
    assert.equal(runtime.api[initialize](''),'true');
    assert.equal(runtime.api[get](id),'');
    assert.equal(runtime.api[get](name),'');
    assert.equal(runtime.api[get](location),'page-2');
  }
});

test('SCORM rejects incomplete source before attempting to load script resources',()=>{
  const present=new Set(['course/scripts/api.js']);
  const resolveMember=(member,reference)=>{
    const url=new URL(reference,'https://package.invalid/'+member);
    return present.has(url.pathname.slice(1)) ? {path:url.pathname.slice(1)} : null;
  };
  assert.doesNotThrow(()=>assertScormScriptReferences(
    ['scripts/api.js?v=2#init'],'course/index.html',resolveMember));
  assert.throws(()=>assertScormScriptReferences(
    ['scripts/api.js','scripts/missing.js'],'course/index.html',resolveMember),
    /SCORM source package is missing JavaScript: scripts\/missing\.js \(in course\/index\.html\)/);
  assert.throws(()=>assertScormScriptReferences([''],'course/index.html',()=>null),
    /source package is missing JavaScript/);
});
