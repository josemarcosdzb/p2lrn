import test from 'node:test';
import assert from 'node:assert/strict';
import {validateGraphSemantics} from '../dist/core/validator.js';

const XAPI='https://p2lrn.org/profile/xapi';
const ACCESS='https://p2lrn.org/profile/accessibility';
const CASE='https://p2lrn.org/profile/case';
const LTI='https://p2lrn.org/profile/lti';

function fixture(){
  const course='urn:uuid:00000000-0000-4000-8000-000000000001';
  const activity='urn:uuid:00000000-0000-4000-8000-000000000002';
  const resource='urn:uuid:00000000-0000-4000-8000-000000000003';
  const objective='urn:uuid:00000000-0000-4000-8000-000000000004';
  const representation='urn:uuid:00000000-0000-4000-8000-000000000005';
  const manifest={
    graph:{path:'content/graph.json'},
    files:[],
    entrypoints:[{id:course,type:'course',role:'primary'}],
    profiles:[
      {id:'https://p2lrn.org/profile/course',version:'0.4.0',requirement:'required'},
      {id:XAPI,version:'0.4.0',requirement:'optional'},
      {id:ACCESS,version:'0.4.0',requirement:'optional'},
      {id:CASE,version:'0.4.0',requirement:'optional'},
      {id:LTI,version:'0.4.0',requirement:'optional'},
    ]
  };
  const graph={graphVersion:'0.4.0',relations:[],entities:[
    {id:course,type:'course',revision:1,title:{en:'Course'},children:[activity]},
    {id:activity,type:'activity',activityType:'https://p2lrn.org/type/resource',title:{en:'Activity'},resource,objectives:[objective]},
    {id:resource,type:'resource',representations:[{id:representation,role:'primary',mediaType:'text/html',location:{type:'remote',href:'https://example.invalid/content'}}]},
    {id:objective,type:'objective',title:{en:'Objective'}},
  ]};
  return{manifest,graph,activity:graph.entities[1],resource:graph.entities[2],objective:graph.entities[3]};
}

test('Core semantic validation rejects malformed xAPI declarations in external graphs',()=>{
  const f=fixture();
  f.activity.extensions={[XAPI]:{version:'2.0',activityId:'/relative'}};
  assert.throws(()=>validateGraphSemantics(f.graph,f.manifest),/invalid .*xapi.*absolute IRI/i);
});

test('Core semantic validation rejects accessibility metadata on the wrong holder',()=>{
  const f=fixture();
  f.activity.extensions={[ACCESS]:{version:'1',accessibilityFeature:['alternativeText']}};
  assert.throws(()=>validateGraphSemantics(f.graph,f.manifest),/accessibility profile extension is only valid on representations/i);
});

test('Core semantic validation rejects malformed representation accessibility metadata',()=>{
  const f=fixture();
  f.resource.representations[0].extensions={[ACCESS]:{version:'1',accessibilityFeature:['']}};
  assert.throws(()=>validateGraphSemantics(f.graph,f.manifest),/accessibilityFeature.*must not be empty/i);
});

test('Core semantic validation rejects malformed CASE alignments on objectives',()=>{
  const f=fixture();
  f.objective.alignments=[{
    type:'Alignment',targetType:'CFItem',targetUrl:'urn:uuid:item-1',
    extensions:{[CASE]:{version:'1.1'}}
  }];
  assert.throws(()=>validateGraphSemantics(f.graph,f.manifest),/invalid CASE alignment.*HTTP\(S\)/i);
});

test('Core semantic validation accepts valid xAPI, accessibility and CASE metadata together',()=>{
  const f=fixture();
  f.activity.extensions={[XAPI]:{version:'2.0',activityId:'https://learning.example.invalid/activity/1'}};
  f.resource.representations[0].role='accessible';
  f.resource.representations[0].accessibility=['alternativeText'];
  f.resource.representations[0].extensions={[ACCESS]:{version:'1',accessibilityFeature:['alternativeText'],accessibilityHazard:['noFlashingHazard']}};
  f.objective.alignments=[{
    type:'Alignment',targetType:'CFItem',targetUrl:'https://case.example.invalid/uri/item-1',
    extensions:{[CASE]:{version:'1.1'}}
  }];
  const entities=validateGraphSemantics(f.graph,f.manifest);
  assert.equal(entities.size,4);
});


test('Core semantic validation rejects secrets embedded in LTI representation intent',()=>{
  const f=fixture();
  f.resource.representations[0].extensions={[LTI]:{
    targetLinkUri:'https://tool.example.invalid/resource/42',
    rebindRequired:true,
    client_secret:'must-not-travel'
  }};
  assert.throws(()=>validateGraphSemantics(f.graph,f.manifest),/credential field/i);
});


test('Core semantic validation rejects LRS deployment state hidden in xAPI extensions',()=>{
  const f=fixture();
  f.activity.extensions={[XAPI]:{
    version:'2.0',
    activityId:'https://learning.example.invalid/activity/1',
    endpoint:'https://lrs.example.invalid/xapi/'
  }};
  assert.throws(()=>validateGraphSemantics(f.graph,f.manifest),/Unsupported xAPI activity declaration field: endpoint/i);
});
