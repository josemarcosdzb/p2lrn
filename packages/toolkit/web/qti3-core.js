import {attr,children,descendants,firstChild,parseXmlLite,textContent} from './xml-lite.js';

export const QTI3_PROFILE='https://p2lrn.org/profile/qti';
export const QTI3_MATCH_CORRECT='https://purl.imsglobal.org/spec/qti/v3p0/rptemplates/match_correct.xml';
export const QTI3_STATE_VERSION='p2lrn-qti3-state/1';

function name(node){return String(node?.localName??'').replace(/^qti-/,'').replace(/-([a-z])/g,(_m,c)=>c.toUpperCase());}
function child(node,wanted){return children(node).find(x=>name(x)===wanted);}
function descendantsNamed(node,wanted){return descendants(node).filter(x=>name(x)===wanted);}
function valueAttr(node,...names){for(const n of names){const v=attr(node,n);if(v!=null)return v;}return undefined;}
function integer(value,fallback=null){const n=Number(value);return Number.isInteger(n)?n:fallback;}
function bool(value,fallback=false){if(value==null)return fallback;return String(value).toLowerCase()==='true';}
function cleanText(node){return textContent(node).replace(/\s+/g,' ').trim();}
function fail(code,message){const error=new Error(message);error.code=code;throw error;}
function templateKind(value){
  const normalized=String(value??'').trim().replace(/[?#].*$/,'').replace(/\.xml$/i,'').replace(/\/$/,'');
  if(normalized==='match_correct'||normalized.endsWith('/match_correct'))return'match_correct';
  if(normalized==='map_response'||normalized.endsWith('/map_response'))return'map_response';
  if(normalized==='map_response_point'||normalized.endsWith('/map_response_point'))return'map_response_point';
  return normalized?'custom':'none';
}

function parseDeclarations(root){
  const responses=new Map();
  for(const node of descendantsNamed(root,'responseDeclaration')){
    const identifier=valueAttr(node,'identifier');
    if(!identifier)fail('P2LRN_QTI_RESPONSE_DECLARATION_INVALID','QTI response declaration requires identifier.');
    if(responses.has(identifier))fail('P2LRN_QTI_RESPONSE_DECLARATION_INVALID',`Duplicate QTI response declaration: ${identifier}`);
    const correct=child(node,'correctResponse');
    const values=correct?descendantsNamed(correct,'value').map(cleanText):[];
    responses.set(identifier,Object.freeze({
      identifier,
      cardinality:String(valueAttr(node,'cardinality')??'single'),
      baseType:String(valueAttr(node,'base-type','baseType')??'identifier'),
      correctValues:Object.freeze(values),
    }));
  }
  return responses;
}

function bodyLead(body,interaction){
  const parts=[];
  for(const node of children(body)){
    if(node===interaction)break;
    if(['p','div','blockquote','h1','h2','h3','h4','h5','h6'].includes(name(node))||['p','div','blockquote','h1','h2','h3','h4','h5','h6'].includes(node.localName)){
      const text=cleanText(node);if(text)parts.push(text);
    }
  }
  return parts.join('\n').trim();
}

function parseChoice(interaction,declaration){
  const choices=children(interaction).filter(x=>name(x)==='simpleChoice').map(node=>({
    id:String(valueAttr(node,'identifier')??'').trim(),
    text:cleanText(node),
    fixed:bool(valueAttr(node,'fixed'),false),
  }));
  if(choices.length<2)fail('P2LRN_QTI_INTERACTION_INVALID','QTI choiceInteraction requires at least two simple choices.');
  const ids=new Set();
  for(const choice of choices){
    if(!choice.id||!choice.text)fail('P2LRN_QTI_INTERACTION_INVALID','QTI simpleChoice requires identifier and visible text.');
    if(ids.has(choice.id))fail('P2LRN_QTI_INTERACTION_INVALID',`Duplicate QTI simpleChoice identifier: ${choice.id}`);ids.add(choice.id);
  }
  for(const value of declaration.correctValues)if(!ids.has(value))fail('P2LRN_QTI_CORRECT_RESPONSE_INVALID',`QTI correct response references unknown choice: ${value}`);
  const maxChoices=integer(valueAttr(interaction,'max-choices','maxChoices'),declaration.cardinality==='single'?1:choices.length);
  const minChoices=integer(valueAttr(interaction,'min-choices','minChoices'),0);
  return Object.freeze({
    type:'choice',
    responseIdentifier:declaration.identifier,
    prompt:cleanText(child(interaction,'prompt'))||'Selecciona una respuesta.',
    cardinality:declaration.cardinality,
    minChoices:Math.max(0,minChoices??0),
    maxChoices:Math.max(1,maxChoices??1),
    shuffle:bool(valueAttr(interaction,'shuffle'),false),
    choices:Object.freeze(choices.map(Object.freeze)),
  });
}

function parseText(interaction,declaration,type){
  if(!['string','integer','float'].includes(declaration.baseType))fail('P2LRN_QTI_INTERACTION_UNSUPPORTED',`QTI ${type} base-type is not supported for delivery: ${declaration.baseType}`);
  return Object.freeze({
    type,
    responseIdentifier:declaration.identifier,
    prompt:cleanText(child(interaction,'prompt'))||'Introduce tu respuesta.',
    cardinality:declaration.cardinality,
    expectedLength:integer(valueAttr(interaction,'expected-length','expectedLength'),null),
    patternMask:valueAttr(interaction,'pattern-mask','patternMask')??null,
    placeholderText:valueAttr(interaction,'placeholder-text','placeholderText')??null,
  });
}

export function parseQti3Item(xml){
  let root;try{root=parseXmlLite(String(xml??''));}catch(error){fail('P2LRN_QTI_INVALID_XML',`Invalid QTI XML: ${error?.message??error}`);}
  if(name(root)!=='assessmentItem')fail('P2LRN_QTI_ITEM_UNSUPPORTED',`QTI delivery currently requires qti-assessment-item; found ${root.localName}.`);
  const namespace=String(valueAttr(root,'xmlns')??'');
  if(namespace&&!(/imsqti.*v3p0/i.test(namespace)||/v3p0.*imsqti/i.test(namespace)))fail('P2LRN_QTI_VERSION_UNSUPPORTED',`QTI delivery currently supports QTI 3 assessment items; namespace is ${namespace}.`);
  const identifier=String(valueAttr(root,'identifier')??'').trim();
  const title=String(valueAttr(root,'title')??identifier??'QTI item').trim()||'QTI item';
  if(!identifier)fail('P2LRN_QTI_ITEM_INVALID','QTI assessment item requires identifier.');
  if(bool(valueAttr(root,'adaptive'),false))fail('P2LRN_QTI_ADAPTIVE_UNSUPPORTED','Adaptive QTI items are not yet supported by the P2LRN QTI 3 runtime.');

  const responses=parseDeclarations(root);
  const body=child(root,'itemBody');
  if(!body)fail('P2LRN_QTI_ITEM_INVALID','QTI assessment item requires qti-item-body.');
  const supportedNames=new Set(['choiceInteraction','textEntryInteraction','extendedTextInteraction']);
  const allInteractions=descendants(body).filter(node=>/Interaction$/.test(name(node)));
  const supported=allInteractions.filter(node=>supportedNames.has(name(node)));
  if(allInteractions.length!==1||supported.length!==1){
    const kinds=allInteractions.map(name).join(', ')||'none';
    fail('P2LRN_QTI_INTERACTION_UNSUPPORTED',`QTI runtime currently supports exactly one choice/text interaction per item; found: ${kinds}.`);
  }
  const interactionNode=supported[0];
  const responseIdentifier=String(valueAttr(interactionNode,'response-identifier','responseIdentifier')??'').trim();
  const declaration=responses.get(responseIdentifier);
  if(!responseIdentifier||!declaration)fail('P2LRN_QTI_RESPONSE_DECLARATION_INVALID',`QTI interaction references missing response declaration: ${responseIdentifier||'(empty)'}`);

  const processing=child(root,'responseProcessing');
  const processingTemplate=valueAttr(processing,'template')??'';
  const processingKind=templateKind(processingTemplate);
  if(processingKind!=='match_correct'){
    fail('P2LRN_QTI_RESPONSE_PROCESSING_UNSUPPORTED',processingKind==='none'
      ?'QTI item has no supported fixed response-processing template.'
      :`QTI response processing is not yet supported by this runtime: ${processingTemplate}`);
  }
  if(responseIdentifier!=='RESPONSE')fail('P2LRN_QTI_RESPONSE_PROCESSING_UNSUPPORTED','QTI match_correct delivery currently requires response identifier RESPONSE.');
  if(declaration.correctValues.length===0)fail('P2LRN_QTI_CORRECT_RESPONSE_INVALID','QTI match_correct requires qti-correct-response values.');

  const kind=name(interactionNode);
  const interaction=kind==='choiceInteraction'
    ?parseChoice(interactionNode,declaration)
    :parseText(interactionNode,declaration,kind==='textEntryInteraction'?'text-entry':'extended-text');

  return Object.freeze({
    version:'3.0',
    identifier,
    title,
    language:valueAttr(root,'xml:lang','lang')??'und',
    timeDependent:bool(valueAttr(root,'time-dependent','timeDependent'),false),
    bodyLead:bodyLead(body,interactionNode),
    processing:Object.freeze({kind:'match_correct',template:processingTemplate||QTI3_MATCH_CORRECT}),
    response:declaration,
    interaction,
  });
}

function equalChoice(correct,response){
  const actual=Array.isArray(response)?response.map(String):response==null?[]:[String(response)];
  if(correct.length!==actual.length)return false;
  const a=[...correct].sort(),b=[...actual].sort();
  return a.every((value,index)=>value===b[index]);
}
function scalar(value,baseType){
  const text=String(value??'').trim();
  if(baseType==='integer'){const n=Number(text);return Number.isInteger(n)?n:NaN;}
  if(baseType==='float'){const n=Number(text);return Number.isFinite(n)?n:NaN;}
  return text;
}

export function scoreQti3Response(item,response){
  if(!item||item.processing?.kind!=='match_correct')fail('P2LRN_QTI_RESPONSE_PROCESSING_UNSUPPORTED','QTI item does not use supported match_correct processing.');
  const correct=item.response.correctValues;
  let isCorrect=false;
  if(item.interaction.type==='choice')isCorrect=equalChoice(correct,response);
  else if(item.response.cardinality==='single')isCorrect=Object.is(scalar(correct[0],item.response.baseType),scalar(response,item.response.baseType));
  else fail('P2LRN_QTI_INTERACTION_UNSUPPORTED',`QTI text response cardinality is not supported: ${item.response.cardinality}`);
  const raw=isCorrect?1:0;
  return Object.freeze({graded:true,raw,max:1,normalized:raw,passed:isCorrect,completed:true,correct:isCorrect});
}

export function sanitizeQti3State(value,item){
  const raw=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const response=item.interaction.type==='choice'
    ?(Array.isArray(raw.response)?raw.response.filter(v=>typeof v==='string'):[])
    :typeof raw.response==='string'?raw.response:'';
  const choiceIds=new Set(item.interaction.type==='choice'?item.interaction.choices.map(x=>x.id):[]);
  const choiceOrder=Array.isArray(raw.choiceOrder)&&raw.choiceOrder.length===choiceIds.size&&new Set(raw.choiceOrder).size===choiceIds.size&&raw.choiceOrder.every(id=>choiceIds.has(id))?[...raw.choiceOrder]:null;
  return{version:QTI3_STATE_VERSION,response,choiceOrder,completed:Boolean(raw.completed),score:raw.score&&typeof raw.score==='object'?JSON.parse(JSON.stringify(raw.score)):null};
}
