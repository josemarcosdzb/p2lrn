import {createHash} from 'node:crypto';
import {copyFile,mkdir,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {reviseSiteBrowserAssets} from '../deploy/netlify/browser-site-revision.mjs';

// Update only the browser version of the existing Player site.
// This does not change the homepage, course examples, npm registry, or game code.
const userProfile=process.env.USERPROFILE;
const root=resolve(import.meta.dirname,'..');
if(!userProfile)throw new Error('The Windows USERPROFILE environment is required');
const site=join(userProfile,'P2LRN-local-4183','site');
const htmlPath=join(site,'demo','index.html');
const sourceHtmlPath=join(root,'deploy','netlify','site','demo','index.html');
const compare=[
  ['renderers/questionnaire-rosco.js','renderers/questionnaire-rosco.js','p2lrn-rosco-center'],
  ['renderers/game-common.js','renderers/game-common.js','gameStyleUrl.search'],
  ['questionnaire-games.css','questionnaire-games.css','p2lrn-rosco-layout'],
  ['p2lrn-player.js','p2lrn-player.js','playerStyleUrl.search'],
];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const htmlBefore=await readFile(htmlPath,'utf8');
const sourceHtml=await readFile(sourceHtmlPath,'utf8');
for(const [distRelative,sourceRelative,marker] of compare){
  const dist=await readFile(join(site,'player','current','dist',...distRelative.split('/')));
  const source=await readFile(join(root,'packages','toolkit','web',...sourceRelative.split('/')));
  if(!dist.toString('utf8').includes(marker)){
    throw new Error('Local Player is missing corrected module '+distRelative+
      '. Do not update HTML until Player distribution is synchronized.');
  }
  if(hash(dist)!==hash(source)){
    throw new Error('Local Player differs from current main: '+distRelative+
      '. A complete Player distribution update is required, not a cache-only refresh.');
  }
  console.log('LOCAL_PLAYER_SOURCE_MATCH='+distRelative+' SHA256='+hash(dist));
}
if(!htmlBefore.includes('/player/current/dist/p2lrn.js')){
  throw new Error('Local viewer entrypoint was customized; refusing to rewrite it.');
}
if(!sourceHtml.includes('/player/current/dist/p2lrn.js')){
  throw new Error('The canonical viewer entrypoint is missing; refusing to rewrite it.');
}
const dest=join(userProfile,'Downloads','p2lrn-validation','local-demo-revision',process.env.GITHUB_RUN_ID??'manual');
await mkdir(dest,{recursive:true});
await copyFile(htmlPath,join(dest,'demo-index-before.html'));
const updated=await reviseSiteBrowserAssets({siteRoot:site,htmlFiles:[htmlPath]});
const localHtml=await readFile(htmlPath,'utf8');
const asset='/player/current/dist/renderers/questionnaire-rosco.js';
const expected=asset+'?v='+updated.runtimeRevision;
if(!localHtml.includes('"'+expected+'"'))throw Error('Versioned rosco module missing from viewer import map');
if(!localHtml.includes('/player/current/dist/p2lrn.js?v='+updated.runtimeRevision))throw Error('Versioned entrypoint missing');
const response=await fetch('http://127.0.0.1:4183/demo/?_p2lrn_revision='+updated.runtimeRevision,{cache:'no-store'});
const served=await response.text();
if(response.status!==200 || !served.includes(expected))throw new Error('The local HTTP server is not serving the corrected viewer HTML');
const reg=/src=["']\/player\/current\/dist\/p2lrn\.js\?v=([a-f0-9]{16})["']/u.exec(served)?.[1];
if(reg!==updated.runtimeRevision)throw Error('The HTTP Player version differs from the revised import map');
console.log('LOCAL_VIEWER_PREVIOUS_VERSIONING='+JSON.stringify({
  hadImportMap:htmlBefore.includes('<script type="importmap">'),
  hadVersionedPlayer:/\/player\/current\/dist\/p2lrn\.js\?v=/u.test(htmlBefore),
  sourceHasVersionedPlayer:/\/player\/current\/dist\/p2lrn\.js\?v=/u.test(sourceHtml),
}));
console.log('LOCAL_VIEWER_REVISION='+updated.runtimeRevision);
console.log('LOCAL_VIEWER_REVISED_PAGES='+JSON.stringify(updated.changes));
console.log('LOCAL_VIEWER_BACKUP='+dest);
console.log('LOCAL_VIEWER_HTTP_CACHE_CONTROL='+response.headers.get('cache-control'));
console.log('LOCAL_VIEWER_BROWSER_CACHE_BUST_PASS');
