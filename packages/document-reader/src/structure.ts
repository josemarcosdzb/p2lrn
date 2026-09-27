import type {CanonicalBlock,CanonicalDocument,CanonicalTable} from './types.js';

export type OutlineContentKind='CONTENT'|'QUESTION'|'SOLUTION'|'TABLE'|'IMAGE'|'SEPARATOR';
export interface OutlineContent {
  id:string;
  kind:OutlineContentKind;
  sourceBlockId?:string;
  sourceTableId?:string;
  title?:string;
  text?:string;
  level?:number;
  order:number;
}
export interface OutlineLesson {
  id:string;
  title:string;
  sourceBlockId?:string;
  inferred?:boolean;
  content:OutlineContent[];
}
export interface OutlineModule {
  id:string;
  title:string;
  sourceBlockId?:string;
  inferred?:boolean;
  lessons:OutlineLesson[];
}
export interface DocumentOutline {
  title:string;
  modules:OutlineModule[];
  orphanQuestions:OutlineContent[];
  warnings:string[];
}

type StructuralRole='MODULE'|'LESSON'|'CONTENT';
type Numbering={raw:string;depth:number;family:'alpha'|'decimal'};

function normalize(value:string):string{return value.normalize('NFKC').replace(/\s+/g,' ').trim();}
function numbering(text:string):Numbering|undefined{
  const t=normalize(text);
  const m=t.match(/^((?:[A-Za-z](?:\.[A-Za-z]){0,8}|\d+(?:\.\d+){0,8}))(?:[.)])?(?:\s+|$)/);
  if(!m)return undefined;
  const raw=m[1]!;
  return{raw,depth:raw.split('.').length,family:/^\d/.test(raw)?'decimal':'alpha'};
}
function isQuizHeading(text:string):boolean{
  return /^(?:cuestionario|quiz|evaluaci[oó]n|examen|test|preguntas?)(?:\b|\s|:)/i.test(normalize(text));
}
function contentKind(block:CanonicalBlock):OutlineContentKind{
  switch(block.type){
    case'QUESTION':return'QUESTION';case'SOLUTION':return'SOLUTION';case'TABLE':return'TABLE';case'IMAGE':return'IMAGE';case'SEPARATOR':return'SEPARATOR';default:return'CONTENT';
  }
}
function key(prefix:string,id:string){return prefix+'-'+id.replace(/[^A-Za-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,96);}
function implicitLesson(module:OutlineModule,title='Contenido'):OutlineLesson{
  let lesson=module.lessons.find(x=>x.inferred);
  if(!lesson){lesson={id:key('lesson',module.id+'-implicit'),title,inferred:true,content:[]};module.lessons.push(lesson);}
  return lesson;
}
function implicitModule(outline:DocumentOutline):OutlineModule{
  let module=outline.modules.find(x=>x.inferred);
  if(!module){module={id:'module-imported-content',title:outline.title||'Contenido importado',inferred:true,lessons:[]};outline.modules.push(module);}
  return module;
}

export function resolveDocumentOutline(document:CanonicalDocument):DocumentOutline{
  const title=document.metadata.title?.trim()||document.source.name;
  const outline:DocumentOutline={title,modules:[],orphanQuestions:[],warnings:[]};
  const blocks=[...document.blocks].sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
  const headingLevels=blocks.filter(b=>b.type==='TITLE'&&Number.isInteger(b.level)&&!isQuizHeading(b.text)).map(b=>b.level!) ;
  const distinctLevels=[...new Set(headingLevels)].sort((a,b)=>a-b);
  const levelRole=new Map<number,StructuralRole>();
  if(distinctLevels[0]!=null)levelRole.set(distinctLevels[0],'MODULE');
  if(distinctLevels[1]!=null)levelRole.set(distinctLevels[1],'LESSON');
  for(const level of distinctLevels.slice(2))levelRole.set(level,'CONTENT');

  let currentModule:OutlineModule|undefined;
  let currentLesson:OutlineLesson|undefined;
  let quizContext=false;

  const attach=(item:OutlineContent)=>{
    if(item.kind==='QUESTION'&&!currentModule&&!currentLesson){outline.orphanQuestions.push(item);return;}
    currentModule??=implicitModule(outline);
    currentLesson??=implicitLesson(currentModule);
    currentLesson.content.push(item);
  };

  for(const block of blocks){
    if(block.type==='TITLE'){
      if(isQuizHeading(block.text)){
        quizContext=true;
        attach({id:key('content',block.id),kind:'CONTENT',sourceBlockId:block.id,title:block.text,text:block.text,level:block.level,order:block.order});
        continue;
      }
      quizContext=false;
      const num=numbering(block.text);
      let role:StructuralRole|undefined;
      if(document.source.format==='PPTX'&&block.slide!=null&&(block.source?.raw?.placeholderTitle===true||block.source?.raw?.syntheticSlideTitle===true))role='LESSON';
      if(!role&&num&&num.depth<=3)role=num.depth===1?'MODULE':num.depth===2?'LESSON':'CONTENT';
      if(!role&&block.level!=null)role=levelRole.get(block.level);
      role??='CONTENT';

      if(role==='MODULE'){
        currentModule={id:key('module',block.id),title:block.text,sourceBlockId:block.id,lessons:[]};
        outline.modules.push(currentModule);currentLesson=undefined;continue;
      }
      if(role==='LESSON'){
        currentModule??=implicitModule(outline);
        currentLesson={id:key('lesson',block.id),title:block.text,sourceBlockId:block.id,content:[]};
        currentModule.lessons.push(currentLesson);continue;
      }
      attach({id:key('content',block.id),kind:'CONTENT',sourceBlockId:block.id,title:block.text,text:block.text,level:block.level,order:block.order});
      continue;
    }

    const kind=contentKind(block);
    // A numbered paragraph remains content unless extraction/reconciliation has
    // explicitly classified it as QUESTION. This prevents quiz numbering from
    // becoming course hierarchy.
    if(kind==='QUESTION')quizContext=true;
    if(kind==='SOLUTION'&&!quizContext)outline.warnings.push(`Solution without active question context at source order ${block.order}`);
    attach({id:key('content',block.id),kind,sourceBlockId:block.id,text:block.text,level:block.level,order:block.order});
  }

  // Tables are independent observations and are attached by source order when
  // no TABLE block already references them.
  const referenced=new Set(blocks.filter(b=>b.type==='TABLE').map(b=>String(b.source?.raw?.tableId??'')).filter(Boolean));
  for(const table of [...document.tables].sort((a,b)=>a.order-b.order)){
    if(referenced.has(table.id))continue;
    const item:OutlineContent={id:key('table',table.id),kind:'TABLE',sourceTableId:table.id,title:table.name,text:table.name,order:table.order};
    currentModule??=implicitModule(outline);currentLesson??=implicitLesson(currentModule);currentLesson.content.push(item);
  }

  for(const module of outline.modules){
    if(module.lessons.length===0)implicitLesson(module);
    for(const lesson of module.lessons)lesson.content.sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
  }
  return outline;
}
