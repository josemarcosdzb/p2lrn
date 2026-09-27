import type {CanonicalBlock,CanonicalDocument} from './types.js';
import type {DocumentPostProcessor,DocumentReadContext} from './contracts.js';
import type {SourceDocumentInput} from './types.js';
import type {OutlineContent,OutlineLesson} from './structure.js';

export interface DetectedQuestionOption {label?:string;text:string;sourceBlockId:string;}
export interface DetectedQuestion {
  id:string;
  prompt:string;
  sourceBlockId:string;
  sourceBlockIds:string[];
  options:DetectedQuestionOption[];
  solution?:string;
  solutionSourceBlockId?:string;
  confidence:number;
}
export type LessonAuthoringSegment =
  | {kind:'content';content:OutlineContent[]}
  | {kind:'question';question:DetectedQuestion};

const QUIZ_HEADING=/^(?:cuestionario|quiz|evaluaci[oó]n|examen|test|preguntas?|ejercicios?|actividades?|pr[aá]cticas?)\b/i;
const SOLUTION=/^(?:respuesta(?:s)?(?:\s+correcta(?:s)?)?|soluci[oó]n(?:es)?|answer(?:s)?|solution(?:s)?|correcta(?:s)?|correcto(?:s)?)\s*[:=\-]\s*(.+)$/i;
const OPTION=/^(?:opci[oó]n\s*)?([A-H]|\d{1,2})\s*[)\].:\-]\s*(.+)$/i;
const LABELED_QUESTION=/^(?:pregunta|question)\s*(?:n[ºo.]?\s*)?(\d{1,3})?\s*[:.)\-]\s*(.+)$/i;
const NUMBERED_QUESTION=/^\d{1,3}\s*[.)]\s*(.+[?？])\s*$/u;

function questionText(text:string,quizContext:boolean):{text:string;confidence:number}|null{
  const value=text.replace(/\s+/g,' ').trim();if(!value)return null;
  const labeled=value.match(LABELED_QUESTION);if(labeled)return{text:(labeled[2]??'').trim(),confidence:0.99};
  const numbered=value.match(NUMBERED_QUESTION);if(numbered)return{text:numbered[1]!.trim(),confidence:0.97};
  if(/^¿[\s\S]+\?$/.test(value))return{text:value,confidence:quizContext?0.98:0.92};
  if(quizContext&&/\?$/.test(value)&&value.length<=1000)return{text:value,confidence:0.93};
  return null;
}
function optionText(text:string):{label:string;text:string}|null{
  const m=text.replace(/\s+/g,' ').trim().match(OPTION);return m?{label:m[1]!.toUpperCase(),text:m[2]!.trim()}:null;
}
function solutionText(text:string):string|null{
  const m=text.replace(/\s+/g,' ').trim().match(SOLUTION);return m?.[1]?.trim()||null;
}
function semanticRaw(block:CanonicalBlock,role:string,confidence:number,extra:Record<string,unknown>={}){
  return{...(block.source?.raw??{}),semanticRole:role,semanticConfidence:confidence,...extra};
}

export function observeQuestionSemantics(document:CanonicalDocument):CanonicalDocument{
  const next=structuredClone(document),blocks=[...next.blocks].sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
  let quizContext=false,activeQuestion=false,changed=0;
  for(const block of blocks){
    if(block.type==='TITLE'){
      quizContext=QUIZ_HEADING.test(block.text.trim());
      activeQuestion=false;
      continue;
    }
    if(!['PARAGRAPH','LIST','OPTION','QUESTION','SOLUTION'].includes(block.type))continue;
    const solution=solutionText(block.text);
    if(solution&&activeQuestion){
      block.type='SOLUTION';block.text=solution;block.source={format:block.source?.format??next.source.format,raw:semanticRaw(block,'SOLUTION',0.99)};changed+=1;activeQuestion=false;continue;
    }
    const option=optionText(block.text);
    if(option&&activeQuestion){
      block.type='OPTION';block.text=option.text;block.source={format:block.source?.format??next.source.format,raw:semanticRaw(block,'OPTION',0.98,{optionLabel:option.label})};changed+=1;continue;
    }
    const question=questionText(block.text,quizContext);
    if(question){
      block.type='QUESTION';block.text=question.text;block.source={format:block.source?.format??next.source.format,raw:semanticRaw(block,'QUESTION',question.confidence)};changed+=1;activeQuestion=true;continue;
    }
    if(activeQuestion&&block.type!=='OPTION')activeQuestion=false;
  }
  if(!changed)return document;
  const blockById=new Map(blocks.map(b=>[b.id,b]));
  next.sequence.nodes=next.sequence.nodes.map(node=>{
    const block=blockById.get(node.id);if(!block)return node;
    if(block.type==='QUESTION')return{...node,type:'QUESTION',text:block.text,data:{...(node.data??{}),sourceBlockType:'QUESTION'}};
    if(block.type==='SOLUTION')return{...node,type:'SOLUTION',text:block.text,data:{...(node.data??{}),sourceBlockType:'SOLUTION'}};
    if(block.type==='OPTION')return{...node,type:'PARAGRAPH',text:block.text,data:{...(node.data??{}),sourceBlockType:'OPTION',optionLabel:block.source?.raw?.optionLabel}};
    return node;
  });
  next.warnings=[...next.warnings,{path:'semantics.questions',message:`Detected ${blocks.filter(b=>b.type==='QUESTION').length} explicit question block(s); option/solution evidence remains source-traceable.`,level:'INFO'}];
  return next;
}

export const questionSemanticPostProcessor:DocumentPostProcessor={
  id:'p2lrn.question-semantics.v1',
  async process(document:CanonicalDocument,_input:SourceDocumentInput,_context:DocumentReadContext){return observeQuestionSemantics(document);}
};

function blockMap(document:CanonicalDocument){return new Map(document.blocks.map(b=>[b.id,b]));}

export function splitLessonAuthoringSegments(document:CanonicalDocument,lesson:OutlineLesson):LessonAuthoringSegment[]{
  const blocks=blockMap(document),segments:LessonAuthoringSegment[]=[],content:OutlineContent[]=[];
  const flush=()=>{if(content.length){segments.push({kind:'content',content:[...content]});content.length=0;}};
  for(let index=0;index<lesson.content.length;index++){
    const item=lesson.content[index]!;
    if(item.kind!=='QUESTION'){content.push(item);continue;}
    flush();
    const questionBlock=item.sourceBlockId?blocks.get(item.sourceBlockId):undefined;
    const question:DetectedQuestion={
      id:`question-${item.sourceBlockId??item.id}`,
      prompt:item.text||questionBlock?.text||item.title||'Pregunta',
      sourceBlockId:item.sourceBlockId??item.id,
      sourceBlockIds:[item.sourceBlockId??item.id],
      options:[],
      confidence:Number(questionBlock?.source?.raw?.semanticConfidence??0.9),
    };
    let cursor=index+1;
    for(;cursor<lesson.content.length;cursor++){
      const candidate=lesson.content[cursor]!;
      if(candidate.kind==='QUESTION')break;
      const block=candidate.sourceBlockId?blocks.get(candidate.sourceBlockId):undefined;
      const sourceType=block?.type;
      if(sourceType==='OPTION'){
        question.options.push({label:typeof block.source?.raw?.optionLabel==='string'?block.source.raw.optionLabel:undefined,text:block.text,sourceBlockId:block.id});
        question.sourceBlockIds.push(block.id);continue;
      }
      if(candidate.kind==='SOLUTION'||sourceType==='SOLUTION'){
        question.solution=candidate.text||block?.text;
        question.solutionSourceBlockId=block?.id??candidate.sourceBlockId;
        if(question.solutionSourceBlockId)question.sourceBlockIds.push(question.solutionSourceBlockId);
        continue;
      }
      break;
    }
    segments.push({kind:'question',question});
    index=cursor-1;
  }
  flush();
  return segments;
}

function normalized(value:string){return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLowerCase();}
function solutionLabels(solution:string|undefined,options:DetectedQuestionOption[]):string[]{
  if(!solution)return[];
  const aliases=new Map<string,string>();
  options.forEach((option,index)=>{
    const id=`c${index+1}`,text=normalized(option.text);aliases.set(text,id);aliases.set(String(index+1),id);
    if(option.label)aliases.set(normalized(option.label),id);
  });
  const cleaned=solution.replace(/^(?:respuesta|soluci[oó]n|answer|solution)\s*[:=\-]?\s*/i,'').trim();
  const direct=aliases.get(normalized(cleaned));if(direct)return[direct];
  const parts=cleaned.split(/[,;|/]+|\s+(?:y|and)\s+/i).map(normalized).filter(Boolean);
  return[...new Set(parts.map(part=>aliases.get(part)).filter((x):x is string=>Boolean(x)))];
}

export function detectedQuestionToNative(question:DetectedQuestion){
  const prompt=question.prompt.trim()||'Pregunta';
  if(question.options.length>=2){
    const choices=question.options.map((option,index)=>({id:`c${index+1}`,text:option.text}));
    const correct=solutionLabels(question.solution,question.options);
    const optionKeys=new Set(question.options.map(o=>normalized(o.text)));
    const vf=question.options.length===2&&((optionKeys.has('verdadero')&&optionKeys.has('falso'))||(optionKeys.has('true')&&optionKeys.has('false')));
    const type=vf?'true-false':correct.length>1?'multiple-choice':'single-choice';
    return{
      grading:correct.length?'embedded-key':'host',
      question:{id:question.id.replace(/[^A-Za-z0-9._:-]+/g,'-').slice(0,150),type,prompt,points:1,required:false,choices,...(correct.length?{solution:{choiceIds:correct}}:{})},
    };
  }
  const accepted=question.solution?.trim()?[question.solution.trim()]:[];
  return{
    grading:accepted.length?'embedded-key':'host',
    question:{id:question.id.replace(/[^A-Za-z0-9._:-]+/g,'-').slice(0,150),type:'text',prompt,points:1,required:false,...(accepted.length?{solution:{acceptedAnswers:accepted}}:{})},
  };
}
