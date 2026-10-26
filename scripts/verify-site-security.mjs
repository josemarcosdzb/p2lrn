import {readFileSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..');
const site=join(root,'deploy','netlify','site');
const headers=readFileSync(join(site,'_headers'),'utf8');
for(const d of ['X-Content-Type-Options: nosniff','Referrer-Policy:','Permissions-Policy:','X-Frame-Options:','Content-Security-Policy:',"object-src 'none'","base-uri 'none'",'frame-ancestors'])assert.ok(headers.includes(d),'Missing: '+d);
assert.ok(headers.includes('/player/')===false,'Runtime headers must not inherit restrictive iframe policy');
assert.ok(headers.includes('/docs/*')&&headers.includes('/studio/*')&&headers.includes('/demo/*'),'Missing protected web sections');
const sections=headers.replaceAll('\r\n','\n').split('\n');
const cspForRoute=(route)=>{
  const pos=sections.findIndex(line=>line===route);
  assert.ok(pos>=0,'Missing route '+route);
  const policy=sections.slice(pos+1).find(line=>line.startsWith('  Content-Security-Policy: '));
  assert.ok(policy,'Missing policy for '+route);
  return policy;
};
for(const route of ['/studio/*','/demo/*']){
  const policy=cspForRoute(route);
  const connect=/connect-src ([^;]+)/u.exec(policy)?.[1]??'';
  assert.match(connect,/(?:^|\s)blob:(?:\s|$)/u,route+' must allow verified local Blob packages');
  assert.ok(!policy.includes("script-src 'unsafe-inline'"),'Authoring script CSP must remain strict');
}
for(const route of ['/','/contacto/*','/docs/*']){
  const connect=/connect-src ([^;]+)/u.exec(cspForRoute(route))?.[1]??'';
  assert.ok(!connect.includes('blob:'),'Do not widen Blob connections beyond authoring/player: '+route);
}
const scripts=headers.split('script-src ')[1]?.split(';',1)[0]??'';
assert.ok(scripts.includes("'self'")&&!scripts.includes("'unsafe-inline'")&&!scripts.includes("'unsafe-eval'"),'Script CSP permits unsafe JS');
for(const [page,marker] of [['studio/index.html','data-studio-status'],['demo/index.html','data-viewer-status']]){
  const html=readFileSync(join(site,...page.split('/')),'utf8');
  assert.ok(html.includes('data-functional-status'),'Functional status marker missing from '+page);
  assert.ok(html.includes(marker),'Application status element missing from '+page);
}
let pages=0;
function scan(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const f=join(dir,e.name);if(e.isDirectory())scan(f);else if(e.name.endsWith('.html')){pages++;const h=readFileSync(f,'utf8');for(const m of h.matchAll(/<script\b([^>]*)>/gi))assert.match(m[1],/\bsrc\s*=/i,'Inline script: '+f);assert.ok(!/\son(?:load|error|click|submit|change|input)\s*=/i.test(h),'Inline handler: '+f);}}}
scan(site);assert.ok(pages>=30,'Unexpected HTML coverage');
console.log('Website CSP and '+pages+' HTML pages verified');
