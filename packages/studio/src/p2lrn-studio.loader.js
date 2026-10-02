(()=>{'use strict';
const current=document.currentScript;
const src=current?.src||'';
const moduleUrl=src?new URL('./p2lrn-studio.esm.js',src).href:'./p2lrn-studio.esm.js';
globalThis.P2LRNStudioReady=import(moduleUrl);
})();
