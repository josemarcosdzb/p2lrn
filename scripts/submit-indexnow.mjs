#!/usr/bin/env node
/**
 * Notify participating IndexNow search engines when P2LRN URLs change.
 *
 * Usage:
 *   node scripts/submit-indexnow.mjs --dry-run https://p2lrn.org/skills/
 *   node scripts/submit-indexnow.mjs https://p2lrn.org/skills/ https://p2lrn.org/en/skills/
 *
 * Do not submit an unchanged sitemap on every build. Only send published,
 * newly added, updated or deleted canonical URLs. The key is public by design.
 */
import {readFile} from 'node:fs/promises';

const ORIGIN='https://p2lrn.org';
const HOST='p2lrn.org';
const KEY_FILE='acc6b70e531da19216a0ab9303a647ff.txt';
const ENDPOINT='https://api.indexnow.org/indexnow';

const args=process.argv.slice(2);
const dryRun=args.includes('--dry-run');
const targets=args.filter(arg=>arg!=='--dry-run');

if(targets.length===0||targets.length>100){
  console.error('Usage: node scripts/submit-indexnow.mjs [--dry-run] https://p2lrn.org/changed-page/');
  process.exitCode=2;
}else{
  const urls=[];
  const seen=new Set();
  for(const target of targets){
    let parsed;
    try{parsed=new URL(target);}catch{throw Error('Invalid URL: '+target);}
    if(parsed.origin!==ORIGIN||parsed.username||parsed.password||
       parsed.search||parsed.hash||!parsed.pathname.startsWith('/'))
      throw Error('Only canonical HTTPS p2lrn.org URLs without query strings or fragments are accepted: '+target);
    if(!seen.has(parsed.href)){seen.add(parsed.href);urls.push(parsed.href);}
  }
  const key=(await readFile(new URL('../deploy/netlify/site/'+KEY_FILE,import.meta.url),'utf8')).trim();
  if(!/^[a-f0-9]{32}$/.test(key)||KEY_FILE!==key+'.txt')
    throw Error('Invalid public IndexNow key file');
  const payload={
    host:HOST,
    key,
    keyLocation:ORIGIN+'/'+KEY_FILE,
    urlList:urls
  };
  if(dryRun){
    console.log(JSON.stringify({dryRun:true,endpoint:ENDPOINT,payload},null,2));
  }else{
    const response=await fetch(ENDPOINT,{
      method:'POST',
      headers:{'Content-Type':'application/json; charset=utf-8'},
      body:JSON.stringify(payload),
      signal:AbortSignal.timeout(20000)
    });
    const detail=(await response.text()).trim().slice(0,600);
    if(response.status!==200&&response.status!==202)
      throw Error('IndexNow rejected the request (HTTP '+response.status+'): '+detail);
    console.log(JSON.stringify({
      status:response.status,
      accepted:true,
      keyVerificationPending:response.status===202,
      submittedUrls:urls,
      note:'Acceptance does not guarantee indexing or search ranking.'
    },null,2));
  }
}
