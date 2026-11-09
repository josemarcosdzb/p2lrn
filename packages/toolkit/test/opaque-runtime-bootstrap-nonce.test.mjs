import test from 'node:test';
import assert from 'node:assert/strict';
import {withOpaqueRuntimeBootstrapNonce} from '../web/opaque-runtime-bootstrap-nonce.js';

const launchNonce = 'abcdef0123456789_nonceABCDE';
const doc = content => ({
  querySelector(selector) {
    assert.equal(selector, 'meta[name="p2lrn-opaque-runtime-nonce"]');
    return content == null ? null : {getAttribute: () => content};
  },
});

test('LTI srcdoc grants its nonce only to the internally generated bootstrap', () => {
  const html = '<html><body><script>boot()</script><script>embedded package</script></body></html>';
  const out = withOpaqueRuntimeBootstrapNonce(html, doc(launchNonce));
  assert.ok(out.includes('<script nonce="' + launchNonce + '">boot()</script>'));
  assert.ok(out.includes('<script>embedded package</script>'));
  assert.equal(out.split('nonce=').length - 1, 1);
});
test('standalone and malformed nonce leave content untouched', () => {
  const html = '<script>boot()</script>';
  assert.equal(withOpaqueRuntimeBootstrapNonce(html,doc(null)), html);
  assert.equal(withOpaqueRuntimeBootstrapNonce(html,doc('invalid" onload="unsafe')), html);
});
test('never replace an existing script nonce', () => {
  const html = '<script nonce="existing">boot()</script>';
  assert.equal(withOpaqueRuntimeBootstrapNonce(html,doc(launchNonce)), html);
});