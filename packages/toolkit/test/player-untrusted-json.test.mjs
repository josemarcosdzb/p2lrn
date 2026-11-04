import test from 'node:test';
import assert from 'node:assert/strict';
import {parseP2LRNUntrustedJson,canonicalizeIdentifiers} from '../web/identifiers.js';

test('manifest and graph JSON reject prototype pollution keys at arbitrary depth',()=>{
  for(const key of ['__proto__','constructor','prototype']){
    const source=JSON.stringify({format:'P2LRN',nested:{[key]:{admin:true}}});
    // Computed key ensures this is an actual JSON property, not an object literal setter.
    assert.throws(()=>parseP2LRNUntrustedJson(source),/Forbidden JSON object key/);
  }
  assert.equal({}.admin,undefined);
});

test('identifier canonicalization cannot propagate object prototype keys',()=>{
  for(const key of ['__proto__','constructor','prototype']){
    const source=JSON.parse('{"nested":{"'+key+'":{"polluted":true}}}');
    assert.throws(()=>canonicalizeIdentifiers(source),/Forbidden graph key/);
  }
  assert.equal({}.polluted,undefined);
});

test('normal P2LRN graph metadata and ordinary JSON remain intact',()=>{
  const source='{"graphVersion":"0.4.0","entities":[{"id":"lesson1","title":"Intro"}],"metadata":{"createdBy":"teacher"}}';
  const safe=parseP2LRNUntrustedJson(source);
  assert.deepEqual(safe,JSON.parse(source));
  assert.deepEqual(canonicalizeIdentifiers(safe),safe);
});
