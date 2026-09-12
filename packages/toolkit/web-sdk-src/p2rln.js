(function (global, doc) {
  'use strict';
  const current = doc && doc.currentScript;
  if (!current || !current.src) {
    global.P2RLNReady = Promise.reject(new Error('Legacy P2RLN loader requires document.currentScript.src.'));
    return;
  }
  const moduleUrl = new URL('./p2lrn.esm.js', current.src).href;
  global.P2RLNReady = import(moduleUrl).then((module) => global.P2LRN || global.P2RLN || module.default);
})(globalThis, typeof document === 'undefined' ? null : document);
