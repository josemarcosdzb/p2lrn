import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {
  inspectScorm2004SequencingSupport,
  createScorm2004Sequencer,
} from '../web/scorm2004-sequencing.js';

const item=(identifier='lesson',sequencing={},children=[])=>({
  identifier,
  title:identifier,resourceIdentifier:'res-'+identifier,
  raw:{sequencing},children,
});
const manifest=(organization)=>({
  version:'2004',title:'Test',
  resources:[{identifier:'res-'+organization.identifier,href:'lesson/index.html'}],
  organizations:[organization],sequencingCollection:[],
});
test('SCORM 2004 bounded sequence can be inspected without executing a SCO',()=>{
  const source=manifest(item('lesson',{
    rules:[{type:'preCondition',action:'skip',conditions:[{condition:'attempted',operator:'not'}]}],
  }));
  const audit=inspectScorm2004SequencingSupport(source);
  assert.equal(audit.status,'conditional');
  assert.equal(audit.fullyConformant,false);
  assert.equal(audit.issues.length,0);
  assert.equal(audit.inspectedItems,1);
  const seq=createScorm2004Sequencer(source);
  assert.equal(typeof seq.navigate,'function');
});
test('unknown SCORM 2004 sequencing conditions and unsupported actions are explicitly diagnosed',()=>{
  const source=manifest(item('lesson',{
    rules:[
      {type:'preCondition',action:'stopForwardTraversal',conditions:[{condition:'satisfied',operator:'noOp'}]},
      {type:'postCondition',action:'continue',conditions:[{condition:'limitBreakReached',operator:'noOp'}]},
      {type:'exitCondition',action:'exit',conditions:[{condition:'always',operator:'unsupported'}]},
    ],
    rollupRules:[{action:'notReal',childActivitySet:'topTwo',conditions:[{condition:'satisfied'}]}],
    controlMode:{flow:'false',forwardOnly:'true'},
  }));
  const audit=inspectScorm2004SequencingSupport(source);
  assert.equal(audit.status,'unsupported-semantics');
  const codes=new Set(audit.issues.map(x=>x.code));
  for(const code of [
    'P2LRN_SCORM2004_RULE_ACTION_UNSUPPORTED',
    'P2LRN_SCORM2004_RULE_CONDITION_UNSUPPORTED',
    'P2LRN_SCORM2004_RULE_OPERATOR_UNSUPPORTED',
    'P2LRN_SCORM2004_CHILD_SET_UNSUPPORTED',
    'P2LRN_SCORM2004_CONTROL_MODE_UNSUPPORTED',
  ])assert(codes.has(code),code);
});
test('SCORM 2004 explicit sequencingCollection references cannot be certified by the bounded engine',()=>{
  const source=manifest(item());
  source.sequencingCollection=[{id:'shared-sequencing'}];
  const result=inspectScorm2004SequencingSupport(source);
  assert.equal(result.status,'unsupported-semantics');
  assert(result.issues.some(x=>x.code==='P2LRN_SCORM2004_SHARED_SEQUENCING_REFERENCES_UNVERIFIED'));
});
test('SCORM 2004 preflight fails bounded on huge or malicious activity trees',()=>{
  const source=manifest(item('root',{},[item('child')]));
  assert.throws(()=>inspectScorm2004SequencingSupport(source,{maxItems:1}),{
    code:'P2LRN_SCORM2004_INSPECTION_LIMIT',
  });
  const n=manifest(item('root',{rules:[{type:'preCondition',action:'skip',conditions:[]}]}));
  assert.throws(()=>inspectScorm2004SequencingSupport(n,{maxRules:1,maxItems:0}),/Invalid SCORM inspection bounds/);
});
test('real SCORM runtime must not swallow invalid sequencing into an unsequenced launch',async()=>{
  const file=fileURLToPath(new URL('../web/renderers/scorm-runtime.js',import.meta.url));
  const source=await readFile(file,'utf8');
  assert.match(source,/P2LRN_SCORM2004_MANIFEST_MISSING/u);
  assert.match(source,/P2LRN_SCORM2004_MANIFEST_VERSION_MISMATCH/u);
  assert.match(source,/p2lrn:scormpreflight/u);
  assert.match(source,/scorm-sequencing-manifest[\s\S]*?throw error;/u);
});
