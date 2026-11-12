(function (global, doc) {
  'use strict';
  const version = '0.5.0-alpha.14';
  const key = '__P2LRN_CDN_LOADER__';

  function conflict(found) {
    const error = new Error(`P2LRN runtime version conflict: loader ${version} cannot share a page with ${found || 'an unversioned runtime'}.`);
    error.code = 'P2LRN_VERSION_CONFLICT';
    return error;
  }

  const existing = global[key];
  if (existing) {
    if (existing.version !== version) {
      global.P2LRNReady = Promise.reject(conflict(existing.version));
      return;
    }
    global.P2LRNReady = existing.promise;
    return;
  }

  const current = doc && doc.currentScript;
  if (!current || !current.src) {
    const error = new Error('P2LRN CDN loader requires document.currentScript.src. Use p2lrn.esm.js for module imports.');
    error.code = 'P2LRN_LOADER_BASE_URL_UNAVAILABLE';
    global.P2LRNReady = Promise.reject(error);
    return;
  }

  const moduleUrl = new URL('./p2lrn.esm.js', current.src).href;
  const promise = import(moduleUrl).then((module) => {
    const api = global.P2LRN || module.default;
    if (!api || api.version !== version) throw conflict(api && api.version);
    return api;
  });

  global[key] = Object.freeze({version, moduleUrl, promise});
  global.P2LRNReady = promise;
})(globalThis, typeof document === 'undefined' ? null : document);
