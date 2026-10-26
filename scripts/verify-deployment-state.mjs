import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const sha=b=>createHash('sha256').update(b).digest('hex');
const out=join(process.env.USERPROFILE||homedir(),'Downloads','p2lrn-deployment-audit',String(process.env.GITHUB_RUN_ID||'manual'));
await mkdir(out,{recursive:true});
const expected={
  '/studio/':{marker:'navigation="external"'},
  '/studio/studio.js':{source:'deploy/netlify/site/studio/studio.js',marker:"setAttribute('navigation','external')"},
  '/player/current/dist/p2lrn-player.js':{source:'packages/toolkit/web/p2lrn-player.js',marker:'p2lrn-layout-external'},
  '/studio/current/dist/p2lrn-studio.esm.js':{source:'packages/studio/src/p2lrn-studio.js',marker:"setAttribute('navigation','external')"},
  '/index.json':{marker:'"player"'}
};
const report={gitCommit:process.env.GITHUB_SHA||null,checkedAt:new Date().toISOString(),sources:{},deployments:[],npm:[]};
for(const [route,r] of Object.entries(expected)){
  if(r.source){
    const bytes=await readFile(join(root,r.source));
    report.sources[route]={path:r.source,sha256:sha(bytes),markerPresent:bytes.toString('utf8').includes(r.marker)};
    if(!report.sources[route].markerPresent)throw Error('GitHub main lacks '+r.marker+' in '+r.source);
  }
}
async function fetchBytes(url,headers={}){
  const res=await fetch(url,{cache:'no-store',headers:{'Cache-Control':'no-cache',...headers},signal:AbortSignal.timeout(22000)});
  return {status:res.status,bytes:Buffer.from(await res.arrayBuffer()),headers:res.headers};
}
for(const origin of ['http://127.0.0.1:4183','https://p2lrn.netlify.app']){
  const deployment={origin,assets:[],versions:null};
  report.deployments.push(deployment);
  for(const [route,r] of Object.entries(expected)){
    try{
      const reply=await fetchBytes(origin+route+'?audit='+encodeURIComponent(String(process.env.GITHUB_RUN_ID||Date.now())));
      const content=reply.bytes.toString('utf8');
      const evidence={route,status:reply.status,bytes:reply.bytes.length,sha256:sha(reply.bytes),markerPresent:content.includes(r.marker),matchesMain:r.source?sha(reply.bytes)===report.sources[route].sha256:null};
      deployment.assets.push(evidence);
      if(route==='/index.json'&&reply.status===200){
        try{const idx=JSON.parse(content);deployment.versions={player:idx.player?.version,studio:idx.studio?.version,h5p:idx.h5p?.sharedLibraryPackageVersion};}catch(e){evidence.indexError=String(e);}
      }
      console.log('LIVE_ASSET_PROOF='+JSON.stringify({origin,...evidence}));
    }catch(e){
      const evidence={route,error:String(e?.message||e)};
      deployment.assets.push(evidence);
      console.log('LIVE_ASSET_UNAVAILABLE='+JSON.stringify({origin,...evidence}));
    }
  }
  deployment.status=deployment.assets.every(x=>x.status===200&&x.markerPresent&&x.matchesMain!==false)?'CURRENT':'STALE_OR_UNREACHABLE';
  console.log('LIVE_DEPLOYMENT_STATUS='+JSON.stringify({origin,status:deployment.status,versions:deployment.versions}));
}
for(const name of ['toolkit','h5p-libraries','player','studio']){
  try{
    const res=await fetchBytes('https://registry.npmjs.org/@p2lrn%2f'+name,{Accept:'application/vnd.npm.install-v1+json'});
    if(res.status!==200)throw Error('npm HTTP '+res.status);
    const data=JSON.parse(res.bytes.toString('utf8'));
    const item={name,distTags:data['dist-tags']||{},alpha11Published:Boolean(data.versions?.['0.5.0-alpha.11']),alpha10Published:Boolean(data.versions?.['0.5.0-alpha.10'])};
    report.npm.push(item);console.log('PUBLIC_NPM_TAG_PROOF='+JSON.stringify(item));
  }catch(e){const item={name,error:String(e?.message||e)};report.npm.push(item);console.log('PUBLIC_NPM_UNAVAILABLE='+JSON.stringify(item));}
}
report.status=report.deployments.every(x=>x.status==='CURRENT')?'ALL_ASSETS_CURRENT':'DEPLOYMENTS_NOT_SYNCHRONIZED';
report.completedAt=new Date().toISOString();
const reportFile=join(out,'report.json');await writeFile(reportFile,JSON.stringify(report,null,2)+'\n');
console.log('LIVE_DEPLOYMENT_AUDIT='+JSON.stringify({status:report.status,file:reportFile,deployments:report.deployments.map(x=>({origin:x.origin,status:x.status,versions:x.versions})),npm:report.npm}));
if(report.status!=='ALL_ASSETS_CURRENT')process.exitCode=1;
