// Public deployment audit only. It never declares source checkout as deployed.
import {readFile} from 'node:fs/promises';
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
      for(const slug of ['h5p-arithmetic','imscc-single-page','qti30-two-questions','snack-safety-scorm12']){
        const resp=await fetch(origin+'/examples/canonical/external/free/'+slug+'.p2lrn',{
          method:'HEAD',redirect:'follow',cache:'no-store',signal:AbortSignal.timeout(22000)});
        result['head:'+slug]={status:resp.status,bytes:resp.headers.get('content-length')};
        if(!resp.ok)result.status='PACKAGE_UNAVAILABLE';
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
