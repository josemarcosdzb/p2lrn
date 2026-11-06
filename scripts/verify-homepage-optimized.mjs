#!/usr/bin/env node
// Verify the lightweight homepage media, PNG fallback and bounded cache policy.
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('../deploy/netlify/site/',import.meta.url)));
const imgs=['player','studio','games','questionnaires','docs'];
for(const lang of ['','en/']){
 const html=await readFile(join(root,lang,'index.html'),'utf8');
 assert.match(html,/data-hero-carousel-root/);
 assert.match(html,/<video\b[^>]*controls/);
 assert.equal((html.match(/<picture>/g)||[]).length,5);
 for(const name of imgs){
  assert.ok(html.includes('srcset="/assets/hero/optimized/'+name+'-20261106.webp"'));
  const fallback=html.match(new RegExp('<img[^>]+src="/assets/hero/'+name+'\\.png"[^>]*>','i'));
  assert.ok(fallback,'Missing PNG fallback '+name);
  assert.match(fallback[0],/\balt="[^"]+"/,'Missing alt text '+name);
 }
 console.log((lang||'es/')+' carousel intact and 5/5 picture fallbacks');
}
let original=0,optimized=0;
for(const name of imgs){
 const base=join(root,'assets','hero');
 const [oldFile,newFile]=await Promise.all([stat(join(base,name+'.png')),stat(join(base,'optimized',name+'-20261106.webp'))]);
 const data=await readFile(join(base,'optimized',name+'-20261106.webp'));
 assert.equal(data.subarray(0,4).toString('ascii'),'RIFF');
 assert.equal(data.subarray(8,12).toString('ascii'),'WEBP');
 assert.ok(newFile.size>3000&&newFile.size<oldFile.size,'Bad WebP asset '+name);
 original+=oldFile.size;optimized+=newFile.size;
}
const headers=await readFile(join(root,'_headers'),'utf8');
for(const expected of [
 '/assets/hero/optimized/*\n  Cache-Control: public, max-age=31536000, immutable',
 '/p2lrn.css\n  Cache-Control: public, max-age=300, must-revalidate',
 '/p2lrn.js\n  Cache-Control: public, max-age=300, must-revalidate',
 '/en/p2lrn.js\n  Cache-Control: public, max-age=300, must-revalidate'
])assert.ok(headers.includes(expected),'Missing cache policy '+expected.slice(0,38));
console.log(JSON.stringify({ok:true,originalBytes:original,optimizedBytes:optimized,savedBytes:original-optimized,percentSaved:Number(((1-optimized/original)*100).toFixed(1))}));
