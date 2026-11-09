// Public deployment audit only. It never declares source checkout as deployed.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const provenance=JSON.parse(await readFile(join(root,'examples','canonical','external','free','provenance.json'),'utf8'));
const expected=new Set(provenance.samples.map(x=>x.slug));
const results=[];
for(const origin of ['https://p2lrn.org','https://p2lrn.netlify.app']){
  const result={origin,checkedAt:new Date().toISOString(),expected:expected.size,live:0,status:'UNKNOWN',missing:[],reachable:false};
  try{
    const response=await fetch(origin+'/examples/catalog.json?audit='+Date.now(),{
      redirect:'follow',cache:'no-store',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(25000)});
    result.catalogHttp=response.status;result.finalUrl=response.url;
    if(!response.ok)throw Error('HTTP '+response.status+' catalog');
    const content=await response.json();
    const entries=(Array.isArray(content.examples)?content.examples:[])
      .filter(x=>/^\/examples\/canonical\/external\/free\/[a-z0-9-]+\.p2lrn$/.test(x?.url??''));
    const found=new Set(entries.map(x=>x.url.split('/').at(-1).slice(0,-6)));
    result.live=entries.length;
    result.reachable=true;
    result.missing=[...expected].filter(x=>!found.has(x));
    result.unexpected=[...found].filter(x=>!expected.has(x));
    result.status=result.missing.length||result.unexpected.length||entries.length!==expected.size?'STALE':'CATALOG_COMPLETE';
    if(result.status==='CATALOG_COMPLETE'){
      result.packagesHttpOk=0;
      result.packagesSha256Verified=0;
      result.packageErrors=[];
      for(const sample of provenance.samples){
        const url=origin+'/examples/canonical/external/free/'+sample.slug+'.p2lrn';
        const head=await fetch(url,{
          method:'HEAD',redirect:'follow',cache:'no-store',signal:AbortSignal.timeout(25000)});
        if(!head.ok){
          result.packageErrors.push({slug:sample.slug,reason:'HEAD HTTP '+head.status});
          result.status='PACKAGE_UNAVAILABLE';
          continue;
        }
        result.packagesHttpOk++;
        // The Netlify alias redirects to the canonical origin. Verify all
        // aliases by HEAD and download the actual bytes only once, directly
        // from p2lrn.org, to avoid duplicate bandwidth.
        if(origin!=='https://p2lrn.org')continue;
        const response=await fetch(url,{
          method:'GET',redirect:'follow',cache:'no-store',signal:AbortSignal.timeout(60000)});
        if(!response.ok||!response.body){
          result.packageErrors.push({slug:sample.slug,reason:'GET HTTP '+response.status});
          result.status='PACKAGE_UNAVAILABLE';
          continue;
        }
        const hasher=createHash('sha256');
        let bytes=0;
        for await (const chunk of response.body){
          bytes+=chunk.byteLength;
          if(bytes>64*1024*1024)throw Error('Public package exceeds max bytes: '+sample.slug);
          hasher.update(chunk);
        }
        const observed='sha256:'+hasher.digest('hex');
        if(observed!==sample.packageSha256){
          result.packageErrors.push({slug:sample.slug,reason:'PUBLIC_SHA256_MISMATCH',expected:sample.packageSha256,observed});
          result.status='PACKAGE_INTEGRITY_FAILURE';
        }else{
          result.packagesSha256Verified++;
        }
      }
      if(result.packagesHttpOk!==expected.size)result.status='PACKAGE_UNAVAILABLE';
      if(origin==='https://p2lrn.org'&&result.packagesSha256Verified!==expected.size){
        if(result.status==='CATALOG_COMPLETE')result.status='PACKAGE_INTEGRITY_FAILURE';
      }
    }
    for(const path of ['/docs/ejemplos/community-gallery.js','/docs/ejemplos/','/en/docs/ejemplos/']){
      const resp=await fetch(origin+path,{method:'HEAD',redirect:'follow',signal:AbortSignal.timeout(20000)});
      result['head:'+path]=resp.status;
      if(!resp.ok)result.status='GALLERY_UNAVAILABLE';
    }
  }catch(error){result.status='UNREACHABLE_OR_INVALID';result.error=String(error?.message??error);}
  results.push(result);
}
console.log('PUBLIC_P2LRN_COMMUNITY_AUDIT='+JSON.stringify({results},null,2));
if(results.some(x=>x.status!=='CATALOG_COMPLETE'))process.exitCode=1;
