import {readFileSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..');
const site=join(root,'deploy','netlify','site');
const headers=readFileSync(join(site,'_headers'),'utf8');
for(const d of ['X-Content-Type-Options: nosniff','Referrer-Policy:','Permissions-Policy:','X-Frame-Options:','Content-Security-Policy:',"object-src 'none'","base-uri 'none'",'frame-ancestors'])assert.ok(headers.includes(d),'Missing: '+d);
assert.ok(headers.includes('/player/')===false,'Runtime headers must not inherit restrictive iframe policy');
assert.ok(headers.includes('/docs/*')&&headers.includes('/studio/*')&&headers.includes('/demo/*'),'Missing protected web sections');
const scripts=headers.split('script-src ')[1]?.split(';',1)[0]??'';
assert.ok(scripts.includes("'self'")&&!scripts.includes("'unsafe-inline'")&&!scripts.includes("'unsafe-eval'"),'Script CSP permits unsafe JS');
let pages=0;
function scan(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const f=join(dir,e.name);if(e.isDirectory())scan(f);else if(e.name.endsWith('.html')){pages++;const h=readFileSync(f,'utf8');for(const m of h.matchAll(/<script\b([^>]*)>/gi))assert.match(m[1],/\bsrc\s*=/i,'Inline script: '+f);assert.ok(!/\son(?:load|error|click|submit|change|input)\s*=/i.test(h),'Inline handler: '+f);}}}
scan(site);assert.ok(pages>=30,'Unexpected HTML coverage');
console.log('Website CSP and '+pages+' HTML pages verified');
