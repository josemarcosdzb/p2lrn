(function (global, doc) {
  'use strict';
  const version = '0.4.0-alpha.15';
  const key = '__P2RLN_CDN_LOADER__';

  function conflict(found) {
    const error = new Error(`P2RLN runtime version conflict: loader ${version} cannot share a page with ${found || 'an unversioned runtime'}.`);
    error.code = 'P2RLN_VERSION_CONFLICT';
    return error;
  }

  const existing = global[key];
  if (existing) {
    if (existing.version !== version) {
      global.P2RLNReady = Promise.reject(conflict(existing.version));
      return;
    }
    global.P2RLNReady = existing.promise;
    return;
  }

  const current = doc && doc.currentScript;
  if (!current || !current.src) {
    const error = new Error('P2RLN CDN loader requires document.currentScript.src. Use p2rln.esm.js for module imports.');
    error.code = 'P2RLN_LOADER_BASE_URL_UNAVAILABLE';
    global.P2RLNReady = Promise.reject(error);
    return;
  }

  const moduleUrl = new URL('./p2rln.esm.js', current.src).href;
  const promise = import(moduleUrl).then((module) => {
    const api = global.P2RLN || module.default;
    if (!api || api.version !== version) throw conflict(api && api.version);
    return api;
  });

  global[key] = Object.freeze({version, moduleUrl, promise});
  global.P2RLNReady = promise;
})(globalThis, typeof document === 'undefined' ? null : document);
