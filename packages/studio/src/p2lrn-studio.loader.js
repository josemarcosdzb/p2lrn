(()=>{'use strict';
const current=document.currentScript;
const src=current?.src||'';
const match=/\/studio\/([^/]+)\/dist\/p2lrn-studio\.js(?:\?|$)/.exec(src);
const channel=match?.[1]||'current';
const moduleUrl=src?new URL('./p2lrn-studio.esm.js',src).href:'./p2lrn-studio.esm.js';
const playerUrl=src?new URL('../../../player/'+channel+'/dist/p2lrn.js',src).href:'/player/'+channel+'/dist/p2lrn.js';
function loadPlayer(){
  if(globalThis.P2LRNReady)return globalThis.P2LRNReady;
  return new Promise((resolve,reject)=>{
    const existing=[...document.scripts].find((node)=>node.src===playerUrl);
    const done=()=>globalThis.P2LRNReady?globalThis.P2LRNReady.then(resolve,reject):reject(new Error('P2LRN Player did not initialize.'));
    if(existing){if(globalThis.P2LRNReady)done();else existing.addEventListener('load',done,{once:true});return;}
    const script=document.createElement('script');script.src=playerUrl;script.async=true;script.onload=done;script.onerror=()=>reject(new Error('Unable to load P2LRN Player: '+playerUrl));document.head.append(script);
  });
}
globalThis.P2LRNStudioReady=loadPlayer().then(()=>import(moduleUrl));
})();
