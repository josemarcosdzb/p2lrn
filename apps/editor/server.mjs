import {createServer} from 'node:http';
import {cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {basename, extname, join, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {
  AUTHORING_API_VERSION,
  AUTHORING_FORMAT_VERSION,
  AUTHORING_PROJECT_VERSION,
  P2LRNAuthoringWorkspace,
} from '@p2lrn/toolkit/authoring';
import {
  DefaultP2LRNDocumentReader,
  createDefaultDocumentExtractorRegistry,
  resolveDocumentOutline,
  splitLessonAuthoringSegments,
  detectedQuestionToNative,
} from '@p2lrn/document-reader';

const APP_ROOT=fileURLToPath(new URL('./', import.meta.url));
const PUBLIC_ROOT=join(APP_ROOT,'public');
const PLAYER_ROOT=fileURLToPath(new URL('../../packages/player/dist/', import.meta.url));
const DATA_ROOT=resolve(process.env.P2LRN_EDITOR_DATA_DIR||fileURLToPath(new URL('../../.p2lrn-editor-data/', import.meta.url)));
const PROJECTS_ROOT=join(DATA_ROOT,'projects');
const BUILDS_ROOT=join(DATA_ROOT,'builds');
const HOST=process.env.P2LRN_EDITOR_HOST||'127.0.0.1';
const PORT=Number(process.env.P2LRN_EDITOR_PORT||4173);
const MAX_JSON=1024*1024;
const MAX_DOCUMENT_BYTES=Number(process.env.P2LRN_EDITOR_MAX_DOCUMENT_BYTES||256*1024*1024);
const documentReader=new DefaultP2LRNDocumentReader({registry:createDefaultDocumentExtractorRegistry()});

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
async function bodyBytes(req,limit){
  const chunks=[];let total=0;
  for await(const chunk of req){total+=chunk.length;if(total>limit)throw new Error(`Request body exceeds ${limit} bytes.`);chunks.push(chunk);}
  return Buffer.concat(chunks,total);
}
async function bodyJson(req){
  const bytes=await bodyBytes(req,MAX_JSON);if(!bytes.length)return {};return JSON.parse(bytes.toString('utf8'));
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

function htmlEscape(value){
  return String(value??'').replace(/[&<>"']/g,(ch)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function safeAssetName(reference){
  const raw=basename(String(reference?.name||reference?.id||'asset'));
  const clean=raw.replace(/[^A-Za-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'')||'asset';
  const digest=String(reference?.byteDigest||reference?.id||'asset').replace(/[^A-Za-z0-9]+/g,'').slice(-12)||'asset';
  return digest+'-'+clean;
}
function renderTable(table){
  if(!table)return '';
  const headers=(table.columns||[]).map(x=>'<th>'+htmlEscape(x)+'</th>').join('');
  const rows=(table.rows||[]).map(row=>'<tr>'+(table.columns||[]).map(col=>'<td>'+htmlEscape(row?.[col]??'')+'</td>').join('')+'</tr>').join('');
  return '<table><thead><tr>'+headers+'</tr></thead><tbody>'+rows+'</tbody></table>';
}
function renderLessonHtml(document,lesson,assets,webRoot){
  const blockById=new Map(document.blocks.map(b=>[b.id,b]));
  const tableById=new Map(document.tables.map(t=>[t.id,t]));
  const assetById=new Map(assets.map(a=>[a.reference.id,a]));
  const copied=new Map();
  const body=[];
  let listOpen=false;
  const closeList=()=>{if(listOpen){body.push('</ul>');listOpen=false;}};
  for(const item of lesson.content||[]){
    const block=item.sourceBlockId?blockById.get(item.sourceBlockId):null;
    if(item.kind==='TABLE'){
      closeList();
      const tableId=item.sourceTableId||block?.source?.raw?.tableId;
      body.push(renderTable(tableById.get(String(tableId||''))));
      continue;
    }
    if(item.kind==='IMAGE'){
      closeList();
      const reference=block?.asset;
      const materialized=reference?assetById.get(reference.id):null;
      if(materialized){
        let relative=copied.get(reference.id);
        if(!relative){
          const name=safeAssetName(reference),target=join(webRoot,'assets',name);
          mkdirSync(join(webRoot,'assets'),{recursive:true});
          writeFileSync(target,materialized.bytes);
          relative='assets/'+name;copied.set(reference.id,relative);
        }
        const alt=htmlEscape(block?.text||reference.name||'');
        body.push('<figure data-source-block-id="'+htmlEscape(block?.id||'')+'"><img src="'+htmlEscape(relative)+'" alt="'+alt+'"></figure>');
      }else{
        const raw=block?.source?.raw&&typeof block.source.raw==='object'?block.source.raw:{};
        const label=htmlEscape(block?.text||reference?.name||'Imagen no materializada');
        const source=htmlEscape(String(raw.src||reference?.sourcePath||''));
        body.push('<figure class="p2lrn-unmaterialized-image" data-source-block-id="'+htmlEscape(block?.id||'')+'"><div role="img" aria-label="'+label+'">'+label+'</div>'+(source?'<figcaption>Recurso no materializado: '+source+'</figcaption>':'')+'</figure>');
      }
      continue;
    }
    if(block?.type==='LIST'){
      if(!listOpen){body.push('<ul>');listOpen=true;}
      body.push('<li data-source-block-id="'+htmlEscape(block.id)+'">'+htmlEscape(block.text)+'</li>');
      continue;
    }
    closeList();
    if(item.kind==='QUESTION'){
      body.push('<section class="p2lrn-question" data-p2lrn-kind="question" data-source-block-id="'+htmlEscape(block?.id||'')+'"><strong>Pregunta</strong><p>'+htmlEscape(item.text||block?.text||'')+'</p></section>');
      continue;
    }
    if(item.kind==='SOLUTION'){
      body.push('<section class="p2lrn-solution" data-p2lrn-kind="solution" data-source-block-id="'+htmlEscape(block?.id||'')+'"><strong>Solución</strong><p>'+htmlEscape(item.text||block?.text||'')+'</p></section>');
      continue;
    }
    if(item.kind==='SEPARATOR'){body.push('<hr>');continue;}
    if(item.title&&block?.type==='TITLE'){
      const level=Math.min(6,Math.max(2,Number(block.level||3)));
      body.push('<h'+level+' data-source-block-id="'+htmlEscape(block.id)+'">'+htmlEscape(item.title)+'</h'+level+'>');
    }else if(block?.source?.raw?.preserveWhitespace===true){
      body.push('<pre data-source-block-id="'+htmlEscape(block?.id||'')+'">'+htmlEscape(item.text||block?.text||'')+'</pre>');
    }else{
      body.push('<p data-source-block-id="'+htmlEscape(block?.id||'')+'">'+htmlEscape(item.text||block?.text||'')+'</p>');
    }
  }
  closeList();
  return '<!doctype html><html lang="'+htmlEscape(document.metadata.language||'es')+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+htmlEscape(lesson.title)+'</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:900px;margin:auto;padding:32px}img{max-width:100%;height:auto}table{border-collapse:collapse;width:100%;margin:1rem 0}th,td{border:1px solid #bbb;padding:.5rem;text-align:left}.p2lrn-question,.p2lrn-solution{border-left:4px solid currentColor;padding:.75rem 1rem;margin:1rem 0;background:#f7f7f7}pre{overflow:auto;white-space:pre-wrap}.p2lrn-unmaterialized-image{border:1px dashed #888;padding:1rem}.p2lrn-unmaterialized-image figcaption{font-size:.875rem;word-break:break-all}</style></head><body><h1>'+htmlEscape(lesson.title)+'</h1>'+body.join('\n')+'</body></html>';
}
function transactionalWorkspace(id,operation){
  const root=projectRoot(id),stage=join(DATA_ROOT,'staging',id+'-'+randomUUID()),backup=root+'.backup-'+randomUUID();
  mkdirSync(resolve(stage,'..'),{recursive:true});
  cpSync(root,stage,{recursive:true,errorOnExist:true});
  try{
    const workspace=P2LRNAuthoringWorkspace.load(stage);
    const result=operation(workspace,stage);
    renameSync(root,backup);
    try{renameSync(stage,root);}catch(error){
      try{renameSync(backup,root);}catch(restoreError){
        const failure=new Error('Import promotion failed and the original workspace could not be restored automatically.');
        failure.cause={promotion:error,restore:restoreError};throw failure;
      }
      throw error;
    }
    try{rmSync(backup,{recursive:true,force:true});}catch{}
    return result;
  }catch(error){
    rmSync(stage,{recursive:true,force:true});
    throw error;
  }
}
function importDocumentIntoWorkspace(workspace,stageRoot,result,outline){
  const hash=String(result.document.inventory.documentHash||'').replace(/^sha256:/,'');
  const prefix='imp-'+hash.slice(0,10);
  const language=result.document.metadata.language||workspace.project.course.languages?.[0]||'es';
  const created={modules:0,lessons:0,activities:0,questions:0,hostGradedQuestions:0};
  let moduleIndex=0;
  for(const module of outline.modules){
    moduleIndex+=1;
    const moduleKey=(prefix+'-m'+moduleIndex).slice(0,120);
    workspace.addUnit({key:moduleKey,title:module.title,language,role:'module',parent:'course'});created.modules+=1;
    let lessonIndex=0;
    for(const lesson of module.lessons){
      lessonIndex+=1;
      const lessonKey=(prefix+'-m'+moduleIndex+'-l'+lessonIndex).slice(0,120);
      workspace.addUnit({key:lessonKey,title:lesson.title,language,role:'lesson',parent:moduleKey});created.lessons+=1;
      const segments=splitLessonAuthoringSegments(result.document,lesson);
      let contentIndex=0,questionIndex=0;
      for(const segment of segments){
        if(segment.kind==='content'){
          if(!segment.content.length)continue;
          contentIndex+=1;
          const webKey=(prefix+'-w'+moduleIndex+'-'+lessonIndex+'-'+contentIndex).slice(0,120);
          const webRoot=join(stageRoot,'.p2lrn-import-tmp',webKey);
          mkdirSync(webRoot,{recursive:true});
          writeFileSync(join(webRoot,'index.html'),renderLessonHtml(result.document,{...lesson,content:segment.content},result.assets,webRoot));
          workspace.addWebContent({sourceDirectory:webRoot,entrypoint:'index.html',key:webKey,title:segments.length===1?lesson.title:`${lesson.title} · contenido ${contentIndex}`,language,parent:lessonKey,copyDirectory:true});
          created.activities+=1;
          rmSync(webRoot,{recursive:true,force:true});
          continue;
        }
        questionIndex+=1;
        const converted=detectedQuestionToNative(segment.question);
        const quizKey=(prefix+'-q'+moduleIndex+'-'+lessonIndex+'-'+questionIndex).slice(0,120);
        const payload={
          schema:'https://p2lrn.org/schema/native-questionnaire/0.4.0',
          version:'0.4.0',
          title:segment.question.prompt,
          language,
          grading:{mode:converted.grading},
          presentation:{questionMode:'one-at-a-time',showFeedback:'after-submit'},
          questions:[converted.question],
          extensions:{
            'https://p2lrn.org/ext/source-document/1':{
              documentHash:result.document.inventory.documentHash,
              sourceBlockIds:segment.question.sourceBlockIds,
              confidence:segment.question.confidence,
              requiresReview:converted.grading==='host',
            }
          }
        };
        workspace.addQuestionnaireData({data:payload,key:quizKey,title:segment.question.prompt,language,parent:lessonKey});
        created.activities+=1;created.questions+=1;if(converted.grading==='host')created.hostGradedQuestions+=1;
      }
    }
  }
  const tmpRoot=join(stageRoot,'.p2lrn-import-tmp');
  if(existsSync(tmpRoot))rmSync(tmpRoot,{recursive:true,force:true});
  workspace.setCourseMetadata({incrementRevision:true,language});
  return{created,documentHash:result.document.inventory.documentHash,outlineWarnings:outline.warnings,readerWarnings:result.document.warnings};
}


const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url||'/','http://editor.invalid'),path=url.pathname,method=String(req.method||'GET').toUpperCase();
    if(path==='/api/health'&&method==='GET')return json(res,200,{ok:true,editor:'0.1.0-alpha.1',authoringApi:AUTHORING_API_VERSION,authoringProject:AUTHORING_PROJECT_VERSION,format:AUTHORING_FORMAT_VERSION});
    if(path==='/api/documents/inspect'&&method==='POST'){
      const name=String(url.searchParams.get('name')||'').trim();
      if(!name)throw new Error('Document name is required.');
      const bytes=await bodyBytes(req,MAX_DOCUMENT_BYTES);
      if(!bytes.length)throw new Error('Document is empty.');
      const result=await documentReader.read({name,bytes:new Uint8Array(bytes),mediaType:String(req.headers['content-type']||'')||undefined});
      const outline=resolveDocumentOutline(result.document);
      return json(res,200,{document:result.document,outline,assetCount:result.assets.length});
    }
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
      if(tail==='import-document'&&method==='POST'){
        const name=String(url.searchParams.get('name')||'').trim();
        if(!name)throw new Error('Document name is required.');
        const bytes=await bodyBytes(req,MAX_DOCUMENT_BYTES);
        if(!bytes.length)throw new Error('Document is empty.');
        const read=await documentReader.read({name,bytes:new Uint8Array(bytes),mediaType:String(req.headers['content-type']||'')||undefined});
        const outline=resolveDocumentOutline(read.document);
        if(!outline.modules.length)throw new Error('Reader did not resolve any importable module.');
        const imported=transactionalWorkspace(id,(workspace,stageRoot)=>importDocumentIntoWorkspace(workspace,stageRoot,read,outline));
        const w=load(id);
        return json(res,201,{id,imported,...projectView(w)});
      }
      if(tail==='questionnaires'&&method==='POST'){
        const input=await bodyJson(req),w=load(id);
        const key=String(input.key||('quiz-'+randomUUID().slice(0,8)));
        const title=String(input.title||input.data?.title||'Cuestionario');
        const result=w.addQuestionnaireData({
          data:input.data,key,title,parent:String(input.parent||'course'),language:String(input.language||'es'),
          renderer:input.renderer==null?undefined:String(input.renderer),rendererVersion:input.rendererVersion==null?undefined:String(input.rendererVersion)
        });
        return json(res,201,{id,result,...projectView(w)});
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
