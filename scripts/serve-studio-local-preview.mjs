// Loopback-only static server for P2LRN Studio visual comparison.
// Intentionally has no write endpoint, no external listener and no npm publishing.
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,relative,sep,extname,join} from 'node:path';

const args=process.argv.slice(2);
const get=key=>{const index=args.indexOf(key);return index<0?null:args[index+1];};
const rootArg=get('--root');
const port=Number(get('--port')||'5531');
if(!rootArg||!Number.isInteger(port)||port<1024||port>65535)
  throw Error('Usage: node preview-server.mjs --root <preview-directory> --port 5531');
const root=resolve(rootArg);
const types={
  '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8','.svg':'image/svg+xml',
  '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg',
  '.gif':'image/gif','.webp':'image/webp','.wasm':'application/wasm',
  '.woff2':'font/woff2','.woff':'font/woff','.ico':'image/x-icon',
  '.pdf':'application/pdf','.mp4':'video/mp4','.webm':'video/webm',
  '.zip':'application/zip','.bin':'application/octet-stream',
};
const noCache={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex,nofollow'};
const server=createServer(async(req,res)=>{
  try{
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,noCache);res.end();return;}
    const url=new URL(req.url,'http://127.0.0.1:'+port);
    if(url.pathname==='/__preview_health'){
      const manifest=JSON.parse(await readFile(join(root,'preview-manifest.json'),'utf8'));
      res.writeHead(200,{...noCache,'Content-Type':'application/json; charset=utf-8'});
      res.end(JSON.stringify({ok:true,port,...manifest}));return;
    }
    const decoded=decodeURIComponent(url.pathname);
    if(decoded.includes('\0')||decoded.includes('\\')){res.writeHead(400,noCache);res.end();return;}
    let file=resolve(root,'.'+decoded);
    let relativePath=relative(root,file);
    if(relativePath==='..'||relativePath.startsWith('..'+sep)||relativePath.startsWith(sep)||relativePath.includes(':')){
      res.writeHead(403,noCache);res.end();return;
    }
    let info=await stat(file).catch(()=>null);
    if(info?.isDirectory()){
      file=join(file,'index.html');
      info=await stat(file).catch(()=>null);
    }
    if(!info?.isFile()){res.writeHead(404,{...noCache,'Content-Type':'text/plain; charset=utf-8'});res.end('No encontrado');return;}
    const body=await readFile(file);
    const headers={...noCache,'Content-Type':types[extname(file).toLowerCase()]||'application/octet-stream'};
    res.writeHead(200,headers);
    if(req.method==='HEAD'){res.end();return;}
    res.end(body);
  }catch(error){
    const code=/URI malformed/.test(String(error))?400:500;
    res.writeHead(code,noCache);res.end('Preview server error');
    console.error('Preview request failed:',error?.message??error);
  }
});
server.on('error',error=>{console.error('Unable to start preview:',error.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>{
  console.log(JSON.stringify({ok:true,port,root,host:'127.0.0.1',
    website:'http://127.0.0.1:'+port+'/studio/',
    npm:'http://127.0.0.1:'+port+'/npm-studio/'}));
});
