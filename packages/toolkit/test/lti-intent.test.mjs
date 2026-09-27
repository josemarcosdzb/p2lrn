import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLtiPortableIntent} from '../dist/core/index.js';

test('portable LTI intent preserves target Link URL and migration metadata',()=>{
  const intent=validateLtiPortableIntent({
    sourceStandard:'IMS Basic LTI',
    sourceVersion:'1.0',
    launchUrl:'https://tool.example.invalid/resource/42',
    targetLinkUri:'https://tool.example.invalid/resource/42',
    rebindRequired:true,
    migrationTarget:'LTI 1.3',
    title:'Legacy tool'
  });
  assert.equal(intent.targetLinkUri,'https://tool.example.invalid/resource/42');
  assert.equal(intent.rebindRequired,true);
  assert.equal(intent.migrationTarget,'LTI 1.3');
});

test('portable LTI intent rejects embedded URL credentials',()=>{
  assert.throws(()=>validateLtiPortableIntent({targetLinkUri:'https://user:secret@tool.example.invalid/launch'}),/embedded credentials/);
});

test('portable LTI intent rejects credential-like fields recursively',()=>{
  for(const value of [
    {targetLinkUri:'https://tool.example.invalid/launch',client_secret:'secret'},
    {targetLinkUri:'https://tool.example.invalid/launch',access_token:'token'},
    {targetLinkUri:'https://tool.example.invalid/launch',platform:{private_key:'pem'}},
    {targetLinkUri:'https://tool.example.invalid/launch',oauth_consumer_secret:'legacy-secret'},
  ])assert.throws(()=>validateLtiPortableIntent(value),/must not contain credential field/);
});

test('portable LTI intent rejects conflicting launchUrl and targetLinkUri',()=>{
  assert.throws(()=>validateLtiPortableIntent({
    launchUrl:'https://tool.example.invalid/a',
    targetLinkUri:'https://tool.example.invalid/b'
  }),/same portable target/);
});
