// Browser-only QA server for a REAL Studio-created course.
// It never converts a destination-specific copy and never proxies credentials.
// The H5P and SCORM sample imports are existing, independently validated P2LRN
// wrappers of genuine external package formats; the import route is byte-for-byte.
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,relative,sep,join,extname} from 'node:path';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const mediaTypes={
 '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
 '.json':'application/json; charset=utf-8','.svg':'image/svg+xml',
 '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg',
 '.webp':'image/webp','.gif':'image/gif','.webm':'video/webm',
 '.mp4':'video/mp4','.woff':'font/woff','.woff2':'font/woff2',
 '.p2lrn':'application/vnd.p2lrn+zip','.wasm':'application/wasm',
 '.ico':'image/x-icon','.bin':'application/octet-stream',
};
const responseHeaders={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
 'Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex,nofollow'};
const samples=Object.freeze({
  'h5p-arithmetic.p2lrn':'examples/canonical/external/free/h5p-arithmetic.p2lrn',
  'snack-safety-scorm12.p2lrn':'examples/canonical/external/free/snack-safety-scorm12.p2lrn',
  'video.webm':'scripts/studio-media-test.webm',
});
export async function createInteropStudioServer({siteRoot,repoRoot,coursePath=null}={}){
  const root=resolve(siteRoot),repo=resolve(repoRoot);
  const report={imports:[],requests:[],sourceFiles:{}};
  for(const [name,path] of Object.entries(samples)){
    const bytes=await readFile(join(repo,path));
    report.sourceFiles[name]={bytes:bytes.length,sha256:sha(bytes)};
  }
  const server=createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://127.0.0.1');
      const pathname=decodeURIComponent(url.pathname);
      const send=(status,body,type='text/plain; charset=utf-8')=>{
        res.writeHead(status,{...responseHeaders,'Content-Type':type});
        res.end(req.method==='HEAD'?undefined:body);
      };
      if(pathname==='/__interop_health'){
        send(200,JSON.stringify({ok:true,kind:'real-studio-ui',samples:Object.keys(samples)}),'application/json');
        return;
      }
      if(req.method==='POST'&&pathname==='/api/p2lrn/studio/import'){
        const rawName=req.headers['x-p2lrn-filename'];
        let name;
        try{name=decodeURIComponent(String(rawName??''));}catch{send(400,'Invalid filename');return;}
        if(!(name==='h5p-arithmetic.p2lrn'||name==='snack-safety-scorm12.p2lrn')){
          send(422,JSON.stringify({error:'Only the two known real external-format samples are allowed in QA.'}),'application/json');
          return;
        }
        const chunks=[];let size=0;
        for await(const chunk of req){size+=chunk.length;if(size>8*1024*1024){send(413,'Too large');return;}chunks.push(chunk);}
        const body=Buffer.concat(chunks);
        const expected=await readFile(join(repo,samples[name]));
        if(body.length!==expected.length||sha(body)!==sha(expected)){send(422,JSON.stringify({error:'Sample content digest mismatch'}),'application/json');return;}
        report.imports.push({name,sha256:sha(body),byteIdentical:true,at:new Date().toISOString()});
        send(200,body,'application/vnd.p2lrn+zip');
        return;
      }
      if(!['GET','HEAD'].includes(req.method)){send(405,'Method not allowed');return;}
      if(pathname.startsWith('/interop/sources/')){
        const name=pathname.slice('/interop/sources/'.length);
        if(!Object.hasOwn(samples,name)){send(404,'Not found');return;}
        const bytes=await readFile(join(repo,samples[name]));
        send(200,bytes,mediaTypes[extname(name)]||'application/octet-stream');return;
      }
      if(pathname==='/interop/seguridad-informatica.p2lrn'){
        if(!coursePath){send(404,'Course not yet exported');return;}
        const body=await readFile(coursePath).catch(()=>null);
        if(!body){send(404,'Course not yet exported');return;}
        send(200,body,'application/vnd.p2lrn+zip');return;
      }
      if(pathname.includes('\0')||pathname.includes('\\')){send(400,'Bad request');return;}
      const file=resolve(root,'.'+pathname);
      const rel=relative(root,file);
      if(rel==='..'||rel.startsWith('..'+sep)||rel.startsWith(sep)||rel.includes(':')){send(403,'Forbidden');return;}
      let selected=file,info=await stat(selected).catch(()=>null);
      if(info?.isDirectory()){selected=join(selected,'index.html');info=await stat(selected).catch(()=>null);}
      if(!info?.isFile()){send(404,'Not found');return;}
      const bytes=await readFile(selected);
      send(200,bytes,mediaTypes[extname(selected).toLowerCase()]||'application/octet-stream');
    }catch(error){
      console.error('P2LRN QA HTTP:',String(error?.message||error).slice(0,300));
      res.writeHead(500,responseHeaders);res.end('Internal QA error');
    }
  });
  await new Promise((done,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',done);});
  const port=server.address().port;
  return {port,base:'http://127.0.0.1:'+port,report,close:()=>new Promise(done=>server.close(done))};
}
