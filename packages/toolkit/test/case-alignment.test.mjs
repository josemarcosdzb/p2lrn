import test from 'node:test';
import assert from 'node:assert/strict';
import {caseAlignmentFromCfItem,createCaseAlignment,validateCaseAlignment,CASE_PROFILE} from '../dist/core/index.js';

test('CASE alignment uses stable 1EdTech-style Alignment fields without dereferencing target URL',()=>{
  const alignment=createCaseAlignment({
    targetUrl:'https://casenetwork.example/uri/74f5bb7d-d7cc-11e8-824f-0242ac160002#statement',
    targetType:'CFItem',
    targetCode:'74f5bb7d-d7cc-11e8-824f-0242ac160002',
    targetFramework:'Alabama Course of Study',
    targetName:'Cite strong and thorough textual evidence',
    frameworkUrl:'https://casenetwork.example/uri/framework-1',
    sourceIdentifier:'74f5bb7d-d7cc-11e8-824f-0242ac160002',
  });
  assert.equal(alignment.type,'Alignment');
  assert.equal(alignment.targetType,'CFItem');
  assert.equal(alignment.targetUrl,'https://casenetwork.example/uri/74f5bb7d-d7cc-11e8-824f-0242ac160002#statement');
  assert.equal(alignment.extensions[CASE_PROFILE].version,'1.1');
  assert.equal(alignment.extensions[CASE_PROFILE].frameworkUrl,'https://casenetwork.example/uri/framework-1');
  assert.deepEqual(validateCaseAlignment(alignment),alignment);
});

test('CASE CFItem helper preserves identifier, statement and framework metadata',()=>{
  const alignment=caseAlignmentFromCfItem({
    uri:'https://case.example/uri/item-1',
    identifier:'item-1',
    fullStatement:'Analyze a sample text.',
    frameworkUri:'https://case.example/uri/framework-1',
    frameworkTitle:'English Language Arts',
  });
  assert.equal(alignment.targetType,'CFItem');
  assert.equal(alignment.targetCode,'item-1');
  assert.equal(alignment.targetName,'Analyze a sample text.');
  assert.equal(alignment.targetFramework,'English Language Arts');
  assert.equal(alignment.extensions[CASE_PROFILE].sourceIdentifier,'item-1');
});

test('CASE alignment rejects non-HTTP identifiers, embedded credentials and unsupported target types',()=>{
  assert.throws(()=>createCaseAlignment({targetUrl:'urn:uuid:1234'}),/HTTP\(S\)/);
  assert.throws(()=>createCaseAlignment({targetUrl:'https://user:secret@example.invalid/item'}),/embedded credentials/);
  assert.throws(()=>createCaseAlignment({targetUrl:'https://case.example/item',targetType:'Unknown'}),/Unsupported CASE alignment targetType/);
});

test('CASE validation requires explicit P2LRN CASE 1.1 extension',()=>{
  assert.throws(()=>validateCaseAlignment({type:'Alignment',targetType:'CFItem',targetUrl:'https://case.example/item'}),/version must be 1\.1/);
});
