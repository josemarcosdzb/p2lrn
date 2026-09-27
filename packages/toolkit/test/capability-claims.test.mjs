import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const capabilities=JSON.parse(readFileSync(resolve('config/capabilities.json'),'utf8'));
const authoring=JSON.parse(readFileSync(resolve('config/authoring-capabilities.json'),'utf8'));
const byId=(doc,id)=>doc.profiles.find(x=>x.id===id);

test('capability matrix exposes semantic validation for LTI CASE xAPI and accessibility',()=>{
  for(const id of [
    'https://p2lrn.org/profile/lti',
    'https://p2lrn.org/profile/case',
    'https://p2lrn.org/profile/xapi',
    'https://p2lrn.org/profile/accessibility',
  ]){
    assert.ok(byId(capabilities,id).modes.includes('validate'),id);
    assert.equal(byId(authoring,id).reader.validate,true,id);
  }
});

test('typed authoring claims exist only for CASE xAPI and accessibility among the new integration profiles',()=>{
  for(const id of [
    'https://p2lrn.org/profile/case',
    'https://p2lrn.org/profile/xapi',
    'https://p2lrn.org/profile/accessibility',
  ])assert.equal(byId(authoring,id).creator.author,true,id);
  assert.equal(byId(authoring,'https://p2lrn.org/profile/lti').creator.author,false);
});

test('capability matrix does not overclaim full delivery for partially implemented external standards',()=>{
  for(const id of [
    'https://p2lrn.org/profile/scorm',
    'https://p2lrn.org/profile/qti',
    'https://p2lrn.org/profile/cmi5',
    'https://p2lrn.org/profile/lti',
    'https://p2lrn.org/profile/h5p',
    'https://p2lrn.org/profile/common-cartridge',
  ]){
    assert.equal(byId(capabilities,id).modes.includes('deliver'),false,id);
    assert.equal(byId(authoring,id).reader.deliver,false,id);
  }
});
