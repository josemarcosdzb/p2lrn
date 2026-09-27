import {createServer} from 'node:http';
import {existsSync, mkdirSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {basename, extname, join, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {
  AUTHORING_API_VERSION,
  AUTHORING_FORMAT_VERSION,
  AUTHORING_PROJECT_VERSION,
  P2LRNAuthoringWorkspace,
} from '@p2lrn/toolkit/authoring';

const APP_ROOT=fileURLToPath(new URL('./', import.meta.url));
const PUBLIC_ROOT=join(APP_ROOT,'public');
const PLAYER_ROOT=fileURLToPath(new URL('../../packages/player/dist/', import.meta.url));
const DATA_ROOT=resolve(process.env.P2LRN_EDITOR_DATA_DIR||fileURLToPath(new URL('../../.p2lrn-editor-data/', import.meta.url)));
const PROJECTS_ROOT=join(DATA_ROOT,'projects');
const BUILDS_ROOT=join(DATA_ROOT,'builds');
const HOST=process.env.P2LRN_EDITOR_HOST||'127.0.0.1';
const PORT=Number(process.env.P2LRN_EDITOR_PORT||4173);
const MAX_JSON=1024*1024;

mkdirSync(PROJECTS_ROOT,{recursive:true});
mkdirSync(BUILDS_ROOT,{recursive:true});

const mime={
  '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg',
  '.jpeg':'image/jpeg','.webp':'image/webp','.p2lrn':'application/vnd.p2lrn+zip'
};

function send(res,status,body,type='application/json; charset=utf-8',extra={}){
  const bytes=Buffer.isBuffer(body)?body:Buffer.from(typeof body==='string'?body:JSON.stringify(body,null,2)+'\n');
  res.statusCode=status;res.setHeader('Content-Type',type);res.setHeader('Content-Length',String(bytes.length));
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  for(const [k,v] of Object.entries(extra))res.setHeader(k,v);
  res.end(bytes);
}
function json(res,status,value){send(res,status,value);}
function safeId(value){const id=String(value||'');if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id))throw new Error('Invalid project id.');return id;}
function projectRoot(id){return join(PROJECTS_ROOT,safeId(id));}
function buildPath(id){return join(BUILDS_ROOT,safeId(id)+'.p2lrn');}
function safeFile(root,relative){
  const base=resolve(root),target=resolve(base,relative.replace(/^\/+/,'')),prefix=base+sep;
  if(target!==base&&!target.startsWith(prefix))return null;
  return target;
}
async function bodyJson(req){
  const chunks=[];let total=0;
  for await(const chunk of req){total+=chunk.length;if(total>MAX_JSON)throw new Error('Request body too large.');chunks.push(chunk);}
  if(!total)return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function load(id){return P2LRNAuthoringWorkspace.load(projectRoot(id));}
function projectView(workspace){return{summary:workspace.summary(),project:workspace.project};}
function listProjects(){
  if(!existsSync(PROJECTS_ROOT))return[];
  return readdirSync(PROJECTS_ROOT,{withFileTypes:true}).filter(x=>x.isDirectory()).flatMap(x=>{
    try{const w=P2LRNAuthoringWorkspace.load(join(PROJECTS_ROOT,x.name));return[{id:x.name,...w.summary(),course:w.project.course}];}catch{return[];}
  });
}
function serveStatic(res,root,relative,cache='no-store'){
  const file=safeFile(root,relative);if(!file||!existsSync(file)||!statSync(file).isFile()){json(res,404,{error:'Not found'});return;}
  const data=readFileSync(file);send(res,200,data,mime[extname(file).toLowerCase()]||'application/octet-stream',{'Cache-Control':cache});
}
function errorResponse(res,error){json(res,400,{error:error instanceof Error?error.message:String(error)});}

const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url||'/','http://editor.invalid'),path=url.pathname,method=String(req.method||'GET').toUpperCase();
    if(path==='/api/health'&&method==='GET')return json(res,200,{ok:true,editor:'0.1.0-alpha.1',authoringApi:AUTHORING_API_VERSION,authoringProject:AUTHORING_PROJECT_VERSION,format:AUTHORING_FORMAT_VERSION});
    if(path==='/api/projects'&&method==='GET')return json(res,200,{projects:listProjects()});
    if(path==='/api/projects'&&method==='POST'){
      const input=await bodyJson(req),id=randomUUID();
      const workspace=P2LRNAuthoringWorkspace.create(projectRoot(id),{
        title:String(input.title||'Curso sin título'),language:String(input.language||'es'),description:input.description==null?undefined:String(input.description)
      });
      return json(res,201,{id,...projectView(workspace)});
    }
    const m=/^\/api\/projects\/([^/]+)(?:\/(.*))?$/.exec(path);
    if(m){
      const id=safeId(decodeURIComponent(m[1])),tail=m[2]||'';
      if(tail===''&&method==='GET')return json(res,200,{id,...projectView(load(id))});
      if(tail==='course'&&method==='PATCH'){
        const input=await bodyJson(req),w=load(id);w.setCourseMetadata({
          title:input.title===undefined?undefined:String(input.title),
          description:input.description===undefined?undefined:(input.description===null?null:String(input.description)),
          language:input.language===undefined?undefined:String(input.language),
          incrementRevision:input.incrementRevision===true
        });return json(res,200,{id,...projectView(w)});
      }
      if(tail==='units'&&method==='POST'){
        const input=await bodyJson(req),w=load(id);const result=w.addUnit({
          key:String(input.key||('unit-'+Date.now())),title:String(input.title||'Nueva unidad'),language:String(input.language||'es'),
          role:String(input.role||'module'),parent:String(input.parent||'course')
        });return json(res,201,{id,result,...projectView(w)});
      }
      const cm=/^children\/([^/]+)$/.exec(tail);
      if(cm&&method==='PUT'){
        const input=await bodyJson(req),w=load(id),children=Array.isArray(input.children)?input.children.map(String):[];
        const result=w.setChildren(decodeURIComponent(cm[1]),children);return json(res,200,{id,result,...projectView(w)});
      }
      if(tail==='build'&&method==='POST'){
        const w=load(id),output=buildPath(id),result=w.build(output,{strictProfiles:true});
        return json(res,200,{id,result,packageUrl:`/api/projects/${encodeURIComponent(id)}/package`});
      }
      if(tail==='package'&&method==='GET'){
        const file=buildPath(id);if(!existsSync(file))return json(res,404,{error:'Build the project before opening preview.'});
        return serveStatic(res,BUILDS_ROOT,basename(file),'no-store');
      }
    }
    if(path.startsWith('/player/'))return serveStatic(res,PLAYER_ROOT,path.slice('/player/'.length),'public, max-age=3600');
    if(path==='/'||path==='/index.html')return serveStatic(res,PUBLIC_ROOT,'index.html');
    if(path.startsWith('/assets/'))return serveStatic(res,PUBLIC_ROOT,path.slice(1));
    return json(res,404,{error:'Not found'});
  }catch(error){return errorResponse(res,error);}
});

server.listen(PORT,HOST,()=>process.stdout.write(`P2LRN Editor listening on http://${HOST}:${PORT}\nData: ${DATA_ROOT}\n`));
