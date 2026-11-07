/*
 * HTML srcdoc inherits the LTI embedding document's CSP. In a sandboxed,
 * opaque-origin player frame only the trusted, generated bootstrap must
 * receive the current LTI launch nonce; embedded package HTML never does.
 * Standalone runtimes have no such meta tag and are unchanged.
 */
export function withOpaqueRuntimeBootstrapNonce(srcdoc, documentRef = globalThis.document) {
  const nonce = documentRef?.querySelector?.('meta[name="p2lrn-opaque-runtime-nonce"]')?.getAttribute('content');
  if (typeof nonce !== 'string' || !/^[A-Za-z0-9_-]{20,128}$/u.test(nonce)) return srcdoc;
  return srcdoc.replace(/<script(?=[\s>])([^>]*)>/iu, (tag, attributes) =>
    /\bnonce\s*=/iu.test(attributes) ? tag : '<script nonce="' + nonce + '"' + attributes + '>');
}