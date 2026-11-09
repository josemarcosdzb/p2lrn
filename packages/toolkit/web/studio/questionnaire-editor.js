import {fillBlankDistractors,fillBlankInputMode,fillBlankTemplate} from '../fill-blanks-core.js';
import {studioUiText,studioNewDefaults,studioLanguage} from './studio-ui-i18n.js';
import {questionnaireForLearner} from './questionnaire-grading.js';
import {renderAssembly3DEditor} from './assembly-3d-editor.js';
const TYPE_LABELS={
  'single-choice':'Elección única','multiple-choice':'Elección múltiple','true-false':'Verdadero / falso','text':'Respuesta de texto','fill-blanks':'Completar huecos','ordering':'Ordenar','matching':'Relacionar','classification':'Clasificar',
};
const GAME_LABELS={
  'https://p2lrn.org/renderer/questionnaire/standard':'Cuestionario',
  'https://p2lrn.org/renderer/questionnaire/memory':'Memoria',
  'https://p2lrn.org/renderer/questionnaire/matching':'Relacionar',
  'https://p2lrn.org/renderer/questionnaire/ordering':'Ordenar',
  'https://p2lrn.org/renderer/questionnaire/classification':'Clasificar',
  'https://p2lrn.org/renderer/questionnaire/true-false':'Verdadero / falso',
  'https://p2lrn.org/renderer/questionnaire/fill-blanks':'Rellenar huecos',
  'https://p2lrn.org/renderer/questionnaire/word-search':'Sopa de letras',
  'https://p2lrn.org/renderer/questionnaire/crossword':'Crucigrama',
  'https://p2lrn.org/renderer/questionnaire/rosco':'Rosco',
  'https://p2lrn.org/renderer/questionnaire/3d-order-match':'Juego 3D',
};
const RENDERER_TYPES={
  'https://p2lrn.org/renderer/questionnaire/standard':Object.keys(TYPE_LABELS),
  'https://p2lrn.org/renderer/questionnaire/memory':['matching'],
  'https://p2lrn.org/renderer/questionnaire/matching':['matching'],
  'https://p2lrn.org/renderer/questionnaire/ordering':['ordering'],
  'https://p2lrn.org/renderer/questionnaire/classification':['classification'],
  'https://p2lrn.org/renderer/questionnaire/true-false':['true-false'],
  'https://p2lrn.org/renderer/questionnaire/fill-blanks':['fill-blanks'],
  'https://p2lrn.org/renderer/questionnaire/word-search':['text'],
  'https://p2lrn.org/renderer/questionnaire/crossword':['text'],
  'https://p2lrn.org/renderer/questionnaire/rosco':['text'],
  'https://p2lrn.org/renderer/questionnaire/3d-order-match':['ordering','matching','classification'],
};
const uid=(prefix='id')=>prefix+'-'+crypto.randomUUID().slice(0,8);
const node=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=studioUiText(text);return el;};
const labeled=(label,control)=>{const wrap=node('label','q-field');wrap.append(node('span','q-label',label),control);return wrap;};
const textInput=(value='',placeholder='')=>{const input=document.createElement('input');input.type='text';input.value=value??'';input.placeholder=studioUiText(placeholder);return input;};
const textAreaInput=(value='',placeholder='',rows=4)=>{const area=document.createElement('textarea');area.value=value??'';area.placeholder=studioUiText(placeholder);area.rows=rows;return area;};
const numberInput=(value=1,min=0,step='0.25')=>{const input=document.createElement('input');input.type='number';input.min=String(min);input.step=String(step);input.value=value===null||value===undefined?'':String(value);return input;};
const selectInput=(value,options)=>{const select=document.createElement('select');for(const [key,label] of options){const option=document.createElement('option');option.value=key;option.textContent=studioUiText(label);if(key===value)option.selected=true;select.append(option);}return select;};
const save=(model,activityId,payload,onChange)=>{const learner=questionnaireForLearner(payload);model.setQuestionnaire(activityId,learner);onChange?.(learner);};

function defaultQuestion(type='single-choice'){return studioNewDefaults(createSpanishDefaultQuestion(type));}
function createSpanishDefaultQuestion(type='single-choice'){
  const id=uid('q');
  if(type==='single-choice')return{id,type,prompt:'Escribe aquí la pregunta',points:1,choices:[{id:uid('a'),text:'Respuesta correcta'},{id:uid('a'),text:'Otra respuesta'}],solution:{choiceIds:[]}};
  if(type==='multiple-choice')return{id,type,prompt:'Selecciona todas las respuestas correctas',points:1,choices:[{id:uid('a'),text:'Opción 1'},{id:uid('a'),text:'Opción 2'},{id:uid('a'),text:'Opción 3'}],solution:{choiceIds:[]}};
  if(type==='true-false')return{id,type,prompt:'Escribe una afirmación',trueFalseMode:'single',points:1,choices:[{id:uid('t'),text:'Verdadero'},{id:uid('f'),text:'Falso'}],solution:{choiceIds:[]}};
  if(type==='text')return{id,type,prompt:'Escribe la pregunta',points:1,solution:{acceptedAnswers:['Respuesta']}};
  if(type==='fill-blanks'){const blankId=uid('blank');return{id,type,prompt:'Completa los huecos',body:'Escribe aquí el texto y selecciona la palabra que quieras ocultar. {{'+blankId+'}}',inputMode:'text',points:1,blanks:[{id:blankId}],solution:{answers:{[blankId]:['Respuesta']}}};}
  if(type==='ordering')return{id,type,prompt:'Ordena los elementos',points:1,items:[{id:uid('i'),text:'Primero'},{id:uid('i'),text:'Segundo'}],solution:{order:[]}};
  if(type==='matching')return{id,type,prompt:'Relaciona cada elemento',points:1,left:[{id:uid('l'),text:'Elemento A'},{id:uid('l'),text:'Elemento B'}],right:[{id:uid('r'),text:'Pareja A'},{id:uid('r'),text:'Pareja B'}],solution:{pairs:[]}};
  return{id,type:'classification',prompt:'Clasifica los elementos',points:1,items:[{id:uid('i'),text:'Elemento A'},{id:uid('i'),text:'Elemento B'}],categories:[{id:uid('c'),text:'Grupo 1'},{id:uid('c'),text:'Grupo 2'}],solution:{assignments:[]}};
}
function ensureSolution(question){
  if(question.type==='true-false'){
    question.trueFalseMode=question.trueFalseMode==='multiple'?'multiple':'single';
    if(question.trueFalseMode==='multiple'){
      question.statements=Array.isArray(question.statements)?question.statements:[];
      while(question.statements.length<2)question.statements.push({id:uid('tf'),text:studioUiText(`Afirmación ${question.statements.length+1}`)});
      const old=question.solution?.answers??{};
      question.solution={answers:Object.fromEntries(question.statements.map((statement,index)=>[statement.id,typeof old[statement.id]==='boolean'?old[statement.id]:index===0]))};
      return;
    }
    question.choices=Array.isArray(question.choices)&&question.choices.length===2?question.choices:[{id:uid('t'),text:studioUiText('Verdadero')},{id:uid('f'),text:studioUiText('Falso')}];
    const choiceIds=(question.solution?.choiceIds??[]).filter((id)=>question.choices.some((choice)=>choice.id===id));
    question.solution={choiceIds:choiceIds.length?[choiceIds[0]]:[question.choices[0].id]};
  }
  else if(['single-choice','multiple-choice'].includes(question.type)){question.choices??=[];question.solution={choiceIds:(question.solution?.choiceIds??[]).filter((id)=>question.choices.some((c)=>c.id===id))};if(!question.solution.choiceIds.length&&question.choices[0])question.solution.choiceIds=[question.choices[0].id];}
  else if(question.type==='text'){question.solution={acceptedAnswers:question.solution?.acceptedAnswers?.length?question.solution.acceptedAnswers:[studioUiText('Respuesta')]};}
  else if(question.type==='fill-blanks'){question.blanks??=[];const old=question.solution?.answers??{};question.solution={answers:Object.fromEntries(question.blanks.map((b)=>[b.id,old[b.id]?.length?old[b.id]:[studioUiText('Respuesta')]]))};}
  else if(question.type==='ordering'){question.items??=[];question.solution={order:question.items.map((x)=>x.id)};}
  else if(question.type==='matching'){question.left??=[];question.right??=[];question.solution={pairs:question.left.map((left,index)=>({left:left.id,right:question.right[index]?.id??question.right[0]?.id})).filter((p)=>p.right)};}
  else if(question.type==='classification'){question.items??=[];question.categories??=[];const fallback=question.categories[0]?.id;question.solution={assignments:question.items.map((item)=>({item:item.id,category:question.solution?.assignments?.find((x)=>x.item===item.id)?.category??fallback})).filter((x)=>x.category)};}
}

function switchType(question,type){
  const next=defaultQuestion(type);
  const defaults={ordering:studioUiText('Ordena los elementos'),matching:studioUiText('Relaciona cada elemento'),classification:studioUiText('Clasifica los elementos')};
  const prompt=question.prompt===defaults[question.type]&&defaults[type] ? defaults[type] : question.prompt;
  const {id,points,timeLimitSeconds,scoring,penalty}=question;
  Object.keys(question).forEach((k)=>delete question[k]);
  Object.assign(question,next,{id,prompt,points});
  if(timeLimitSeconds!==undefined)question.timeLimitSeconds=timeLimitSeconds;
  if(scoring!==undefined)question.scoring=scoring;
  if(penalty!==undefined)question.penalty=penalty;
  ensureSolution(question);
}
function rowButton(text,handler,danger=false){const b=node('button',danger?'q-mini q-danger':'q-mini',text);b.type='button';b.addEventListener('click',handler);return b;}
function guardedDelete(handler,enabled,reason){const b=rowButton('Eliminar',handler,true);b.disabled=!enabled;if(!enabled)b.title=studioUiText(reason);return b;}

function setTrueFalseMode(question,mode){
  ensureSolution(question);
  const next=mode==='multiple'?'multiple':'single';
  if(question.trueFalseMode===next)return;
  if(next==='multiple'){
    const trueChoice=question.choices?.find((choice)=>['verdadero','true'].includes(String(choice.text).normalize('NFKC').trim().toLocaleLowerCase('es')));
    const correctId=question.solution?.choiceIds?.[0];
    const firstValue=Boolean(trueChoice&&correctId===trueChoice.id);
    const firstId=uid('tf'),secondId=uid('tf');
    const firstText=String(question.prompt||'').trim()||studioUiText('Afirmación 1');
    question.trueFalseMode='multiple';
    question.prompt=studioUiText('Indica si cada afirmación es verdadera o falsa');
    question.statements=[{id:firstId,text:firstText},{id:secondId,text:studioUiText('Afirmación 2')}];
    delete question.choices;
    question.solution={answers:{[firstId]:firstValue,[secondId]:false}};
    return;
  }
  const first=question.statements?.[0];
  const firstValue=first?question.solution?.answers?.[first.id]!==false:true;
  const trueId=uid('t'),falseId=uid('f');
  question.trueFalseMode='single';
  question.prompt=first?.text||studioUiText('Escribe una afirmación');
  question.choices=[{id:trueId,text:studioUiText('Verdadero')},{id:falseId,text:studioUiText('Falso')}];
  delete question.statements;
  question.solution={choiceIds:[firstValue?trueId:falseId]};
}

function renderTrueFalseEditor(box,question,commit,rerender,manual=false){
  ensureSolution(question);
  const mode=selectInput(question.trueFalseMode,[['single','Una afirmación'],['multiple','Varias afirmaciones']]);
  const modeField=labeled('Formato de verdadero / falso',mode);modeField.classList.add('q-field--wide','q-tf-mode');
  box.append(modeField);
  mode.addEventListener('change',()=>{setTrueFalseMode(question,mode.value);commit();rerender();});
  if(question.trueFalseMode==='single'){renderChoiceEditor(box,question,commit,rerender,manual);return;}
  box.append(node('small','q-help',manual?'Cada afirmación se responde de forma independiente. La corrección se realizará después.':'Cada afirmación se responde de forma independiente. Marca cuál es la respuesta correcta para cada fila.'));
  question.statements.forEach((statement,index)=>{
    const row=node('div','q-tf-row');
    const text=textAreaInput(statement.text,'Escribe una afirmación',2);text.className='q-tf-statement-input';
    text.addEventListener('input',()=>{statement.text=text.value;commit();});
    const answers=node('div','q-tf-answer');
    for(const [value,labelText] of [[true,'Verdadero'],[false,'Falso']]){
      const label=node('label','q-tf-answer-option');
      const radio=document.createElement('input');radio.type='radio';radio.name='tf-correct-'+question.id+'-'+statement.id;radio.checked=question.solution.answers[statement.id]===value;
      radio.addEventListener('change',()=>{if(radio.checked){question.solution.answers[statement.id]=value;commit();}});
      label.append(radio,node('span',null,labelText));answers.append(label);
    }
    const remove=guardedDelete(()=>{question.statements.splice(index,1);ensureSolution(question);commit();rerender();},question.statements.length>2,'Se necesitan al menos dos afirmaciones.');
    answers.hidden=manual;answers.querySelectorAll('input').forEach((input)=>{input.disabled=manual;});row.append(node('span','q-tf-number',String(index+1)),text,answers,remove);box.append(row);
  });
  box.append(rowButton('+ Añadir afirmación',()=>{const id=uid('tf');question.statements.push({id,text:studioUiText('Nueva afirmación')});question.solution.answers[id]=true;commit();rerender();}));
}

function renderChoiceEditor(box,question,commit,rerender,manual=false){
  const multiple=question.type==='multiple-choice';const trueFalse=question.type==='true-false';ensureSolution(question);
  question.choices.forEach((choice,index)=>{
    const row=node('div','q-option-row');const correct=document.createElement('input');
    correct.type=multiple?'checkbox':'radio';correct.hidden=manual;correct.disabled=manual;correct.name='correct-'+question.id;correct.checked=question.solution.choiceIds.includes(choice.id);correct.title=studioUiText('Respuesta correcta');
    correct.addEventListener('change',()=>{
      if(multiple){
        const set=new Set(question.solution.choiceIds);
        correct.checked?set.add(choice.id):set.delete(choice.id);
        if(!set.size){correct.checked=true;return;}
        question.solution.choiceIds=[...set];
      }else question.solution.choiceIds=[choice.id];
      commit();
    });
    const input=textInput(choice.text,'Respuesta');input.addEventListener('input',()=>{choice.text=input.value;commit();});
    const del=guardedDelete(()=>{question.choices.splice(index,1);ensureSolution(question);commit();rerender();},question.choices.length>2,'La pregunta necesita al menos dos respuestas.');
    row.append(correct,input,del);box.append(row);
  });
  if(!trueFalse)box.append(rowButton('+ Añadir respuesta',()=>{question.choices.push({id:uid('a'),text:studioUiText('Nueva respuesta')});ensureSolution(question);commit();rerender();}));
}

function renderTextEditor(box,question,commit,manual=false){
  if(manual){box.append(node('small','q-help','Respuesta abierta: el profesor corregirá después. No se guarda una lista de respuestas correctas en el curso.'));return;}
  ensureSolution(question);
  const area=document.createElement('textarea');area.className='q-answer-list';area.value=question.solution.acceptedAnswers.join('\n');area.placeholder=studioUiText('Una respuesta aceptada por línea');
  area.addEventListener('input',()=>{
    const answers=area.value.split(/\r?\n/).map((x)=>x.trim()).filter(Boolean);
    question.solution.acceptedAnswers=answers;
    area.setCustomValidity(answers.length?'':studioUiText('Añade al menos una respuesta aceptada.'));
    commit();
  });
  box.append(labeled('Respuestas aceptadas',area));
}
function renderBlankEditor(box,question,commit,rerender,manual=false){
  ensureSolution(question);
  question.inputMode=fillBlankInputMode(question);
  const derived=fillBlankTemplate(question);
  const template=textAreaInput(derived.template,'Escribe el texto y convierte las palabras seleccionadas en huecos',7);
  template.className='q-blank-template-editor';
  const templateField=labeled('Texto a completar',template);templateField.classList.add('q-field--wide');
  const templateHelp=node('small','q-help','Selecciona una palabra o frase en el texto y pulsa “Convertir selección en hueco”. El alumno verá el hueco en ese mismo lugar, nunca la respuesta.');
  templateField.append(templateHelp);box.append(templateField);
  template.addEventListener('input',()=>{question.body=template.value;commit();});

  const mode=selectInput(question.inputMode,[['text','Escribir respuesta'],['drag','Arrastrar palabras']]);
  const modeField=labeled('Modo de respuesta',mode);modeField.classList.add('q-field--mode');box.append(modeField);

  const syncDragOptions=(distractors=fillBlankDistractors(question))=>{
    const primary=question.blanks.map((blank)=>String(question.solution.answers?.[blank.id]?.[0]??'').trim()).filter(Boolean);
    const bank=[];const seen=new Set();
    for(const value of primary){const key=value.normalize('NFKC').trim().toLocaleLowerCase('es');if(key&&!seen.has(key)){seen.add(key);bank.push(value);}}
    for(const value of distractors){const text=String(value??'').trim(),key=text.normalize('NFKC').trim().toLocaleLowerCase('es');if(text&&!seen.has(key)){seen.add(key);bank.push(text);}}
    for(const blank of question.blanks)blank.options=question.inputMode==='drag'?[...bank]:undefined;
  };

  mode.addEventListener('change',()=>{question.inputMode=mode.value;syncDragOptions();commit();rerender();});

  const convert=rowButton('Convertir selección en hueco',()=>{
    const a=template.selectionStart??0,b=template.selectionEnd??0;
    const selected=template.value.slice(a,b);
    if(!selected.trim())return;
    const id=uid('blank');
    question.blanks.push({id});
    question.solution.answers[id]=[selected.trim()];
    const token='{{'+id+'}}';
    question.body=template.value.slice(0,a)+token+template.value.slice(b);
    syncDragOptions();commit();rerender();
  });
  convert.classList.add('q-blank-convert');box.append(convert);

  question.blanks.forEach((blank,index)=>{
    const row=node('div','q-option-row q-blank-row');
    const id=node('span','q-chip','Hueco '+(index+1));
    const answers=textInput((question.solution.answers[blank.id]??[]).join(' | '),'respuesta | alternativa');answers.hidden=manual;answers.disabled=manual;
    answers.addEventListener('input',()=>{const distractors=fillBlankDistractors(question);question.solution.answers[blank.id]=answers.value.split('|').map((x)=>x.trim()).filter(Boolean);syncDragOptions(distractors);commit();});
    row.append(id,answers,guardedDelete(()=>{
      const distractors=fillBlankDistractors(question);
      const replacement=String(question.solution.answers?.[blank.id]?.[0]??'');
      const body=String(question.body??fillBlankTemplate(question).template);
      question.body=body.replace('{{'+blank.id+'}}',replacement);
      delete question.solution.answers[blank.id];question.blanks.splice(index,1);
      ensureSolution(question);syncDragOptions(distractors);commit();rerender();
    },question.blanks.length>1,'Rellenar huecos necesita al menos un hueco.'));box.append(row);
  });

  box.append(rowButton('+ Añadir hueco',()=>{
    const id=uid('blank'),token='{{'+id+'}}';
    const current=String(question.body??template.value);
    const cursor=template.selectionStart??current.length;
    question.body=current.slice(0,cursor)+token+current.slice(cursor);
    question.blanks.push({id});question.solution.answers[id]=[studioUiText('Respuesta')];syncDragOptions();commit();rerender();
  }));

  if(question.inputMode==='drag'){
    const extras=textAreaInput(fillBlankDistractors(question).join('\n'),'Una palabra o frase incorrecta por línea',4);extras.className='q-answer-list';
    extras.addEventListener('input',()=>{syncDragOptions(extras.value.split(/\r?\n/).map((x)=>x.trim()).filter(Boolean));commit();});
    const extrasField=labeled('Palabras extra / distractores',extras);extrasField.classList.add('q-field--wide');box.append(extrasField);
  }
}

function renderOrderingEditor(box,question,commit,rerender){
  ensureSolution(question);
  question.items.forEach((item,index)=>{
    const row=node('div','q-option-row');row.append(node('span','q-order',String(index+1)));
    const input=textInput(item.text,'Elemento');input.addEventListener('input',()=>{item.text=input.value;commit();});
    row.append(
      input,
      rowButton('↑',()=>{if(index>0){[question.items[index-1],question.items[index]]=[question.items[index],question.items[index-1]];ensureSolution(question);commit();rerender();}}),
      rowButton('↓',()=>{if(index<question.items.length-1){[question.items[index+1],question.items[index]]=[question.items[index],question.items[index+1]];ensureSolution(question);commit();rerender();}}),
      guardedDelete(()=>{question.items.splice(index,1);ensureSolution(question);commit();rerender();},question.items.length>2,'Ordenar necesita al menos dos elementos.')
    );
    box.append(row);
  });
  box.append(rowButton('+ Añadir elemento',()=>{question.items.push({id:uid('i'),text:'Nuevo elemento'});ensureSolution(question);commit();rerender();}));
}

function renderMatchingEditor(box,question,commit,rerender,manual=false){
  ensureSolution(question);
  const count=Math.max(question.left.length,question.right.length);
  for(let i=0;i<count;i++){
    question.left[i]??={id:uid('l'),text:'Elemento'};question.right[i]??={id:uid('r'),text:'Pareja'};
    const row=node('div','q-pair-row');const left=textInput(question.left[i].text,'Elemento');const right=textInput(question.right[i].text,manual?'Elemento de la derecha':'Pareja correcta');
    left.addEventListener('input',()=>{question.left[i].text=left.value;commit();});right.addEventListener('input',()=>{question.right[i].text=right.value;commit();});
    row.append(left,node('span','q-arrow',manual?'|':'↔'),right,guardedDelete(()=>{question.left.splice(i,1);question.right.splice(i,1);ensureSolution(question);commit();rerender();},count>1,'Relacionar necesita al menos una pareja.'));
    box.append(row);
  }
  box.append(rowButton('+ Añadir pareja',()=>{question.left.push({id:uid('l'),text:'Elemento'});question.right.push({id:uid('r'),text:'Pareja'});ensureSolution(question);commit();rerender();}));
}

function renderClassificationEditor(box,question,commit,rerender,manual=false){
  ensureSolution(question);
  const categories=node('div','q-subsection');categories.append(node('h4',null,'Categorías'));
  question.categories.forEach((cat,index)=>{
    const row=node('div','q-option-row');const input=textInput(cat.text,'Categoría');input.addEventListener('input',()=>{cat.text=input.value;commit();});
    row.append(input,guardedDelete(()=>{question.categories.splice(index,1);ensureSolution(question);commit();rerender();},question.categories.length>2,'Clasificar necesita al menos dos categorías.'));categories.append(row);
  });
  categories.append(rowButton('+ Añadir categoría',()=>{question.categories.push({id:uid('c'),text:'Nueva categoría'});ensureSolution(question);commit();rerender();}));box.append(categories);
  const items=node('div','q-subsection');items.append(node('h4',null,'Elementos'));
  question.items.forEach((item,index)=>{
    const row=node('div','q-class-row');const input=textInput(item.text,'Elemento');input.addEventListener('input',()=>{item.text=input.value;commit();});
    const current=question.solution.assignments.find((x)=>x.item===item.id)?.category;const select=selectInput(current,question.categories.map((c)=>[c.id,c.text]));select.hidden=manual;select.disabled=manual;
    select.addEventListener('change',()=>{const found=question.solution.assignments.find((x)=>x.item===item.id);if(found)found.category=select.value;else question.solution.assignments.push({item:item.id,category:select.value});commit();});
    row.append(input,select,guardedDelete(()=>{question.items.splice(index,1);ensureSolution(question);commit();rerender();},question.items.length>2,'Clasificar necesita al menos dos elementos.'));items.append(row);
  });
  items.append(rowButton('+ Añadir elemento',()=>{question.items.push({id:uid('i'),text:'Nuevo elemento'});ensureSolution(question);commit();rerender();}));box.append(items);
}
export function renderQuestionnaireVisualEditor(container,{model,activityId,payload,renderer,onChange,onStatus}={}){
  const report=(message)=>onStatus?.(studioUiText(message));
  const render=()=>{
    container.replaceChildren();
    const root=node('div','questionnaire-visual-editor');
    const manual=payload.grading?.mode==='host';
    const hero=node('div','q-editor-head');
    const copy=node('div');copy.append(node('span','q-kicker',GAME_LABELS[renderer]??'Cuestionario / juego'),node('h2',null,payload.title||'Cuestionario'),node('p',null,renderer==='https://p2lrn.org/renderer/questionnaire/3d-order-match'?'Cada pregunta puede ser Ordenar, Relacionar o Clasificar en 3D. Cambia su modalidad desde «Tipo».':'Edita preguntas y respuestas con controles normales. No necesitas tocar JSON.'));
    hero.append(copy);root.append(hero);
    const settings=node('div','q-settings');
    const title=textInput(payload.title,'Título');title.addEventListener('input',()=>{payload.title=title.value;save(model,activityId,payload,onChange);hero.querySelector('h2').textContent=title.value||'Cuestionario';});
    const language=textInput(payload.language||studioLanguage(),studioLanguage());language.addEventListener('input',()=>{payload.language=language.value;save(model,activityId,payload,onChange);});
    const mode=selectInput(payload.presentation?.questionMode??'one-at-a-time',[['one-at-a-time','Una pregunta cada vez'],['all','Todas a la vez']]);mode.addEventListener('change',()=>{payload.presentation??={};payload.presentation.questionMode=mode.value;save(model,activityId,payload,onChange);});
    const supportsDeferred=!renderer||renderer==='https://p2lrn.org/renderer/questionnaire/standard';
    const grading=selectInput(manual?'host':'embedded-key',[
      ['embedded-key','Automática: corregir al finalizar'],
      ['host','Corregir después: no incluir soluciones'],
    ]);
    if(!supportsDeferred)grading.querySelector('option[value="host"]').disabled=true;
    grading.addEventListener('change',()=>{
      payload.grading={...(payload.grading??{}),mode:grading.value};
      if(grading.value==='host'){
        for(const q of payload.questions)delete q.solution;
        payload.presentation??={};payload.presentation.showFeedback='never';
        const previous=model.progressionForActivity?.(activityId);
        if(previous?.completionRequirement==='passed')
          model.setActivityProgression?.(activityId,{mode:'completed'});
      }else{
        // Deferred assessments never persist an answer key. Re-enable the
        // editable key when switching back to automatic grading.
        for(const q of payload.questions)ensureSolution(q);
        report('Revisa y marca las respuestas correctas antes de publicar la corrección automática.');
      }
      save(model,activityId,payload,onChange);render();
    });
    const feedback=selectInput(payload.presentation?.showFeedback??'never',[['never','No mostrar autocorrección ni soluciones al alumno'],['after-submit','Mostrar autocorrección solo al finalizar']]);feedback.disabled=manual;
    feedback.addEventListener('change',()=>{payload.presentation??={};payload.presentation.showFeedback=feedback.value;save(model,activityId,payload,onChange);});
    const shuffle=document.createElement('input');shuffle.type='checkbox';shuffle.checked=Boolean(payload.presentation?.shuffleQuestions);shuffle.addEventListener('change',()=>{payload.presentation??={};payload.presentation.shuffleQuestions=shuffle.checked;save(model,activityId,payload,onChange);});
    const progression=model.progressionForActivity?.(activityId)??null;
    const progressionMode=progression?.gateFollowing===true?(progression.completionRequirement==='passed'?'passed':'completed'):'none';
    const continueMode=selectInput(manual&&progressionMode==='passed'?'completed':progressionMode,[['none','Libre'],['completed','Completar'],['passed','Superar']]);if(manual)continueMode.querySelector('option[value="passed"]').disabled=true;
    const minScore=numberInput(Number.isFinite(Number(progression?.minScore))?Number(progression.minScore):80,0,1);minScore.max='100';minScore.disabled=manual||continueMode.value!=='passed';
    const attempts=numberInput(payload.attemptPolicy?.maxAttempts??null,1,1);attempts.placeholder=studioUiText('Ilimitados');
    const saveProgression=()=>{const selected=manual&&continueMode.value==='passed'?'completed':continueMode.value;minScore.disabled=manual||selected!=='passed';model.setActivityProgression?.(activityId,{mode:selected,minScore:Number(minScore.value)||0});onChange?.(questionnaireForLearner(payload));};
    continueMode.addEventListener('change',saveProgression);minScore.addEventListener('input',saveProgression);
    attempts.addEventListener('input',()=>{const value=attempts.value.trim();if(!value){if(payload.attemptPolicy){delete payload.attemptPolicy.maxAttempts;if(Object.keys(payload.attemptPolicy).length===0)delete payload.attemptPolicy;}}else{payload.attemptPolicy??={};payload.attemptPolicy.maxAttempts=Math.max(1,Math.floor(Number(value)||1));}save(model,activityId,payload,onChange);});
    settings.append(labeled('Título',title),labeled('Idioma',language),labeled('Presentación',mode),labeled('Modo de corrección',grading),labeled('Mostrar resultados al alumno',feedback),labeled('Mezclar preguntas',shuffle),labeled('Para poder seguir',continueMode),labeled('Nota mínima (%)',minScore),labeled('Número de intentos',attempts));root.append(settings);
    if(manual)root.append(node('p','q-help q-grading-notice','Corregir después: el paquete no incluirá las soluciones; los alumnos entregarán respuestas sin nota automática. El profesor las revisará en su plataforma o al importar la entrega.'));
    if(!supportsDeferred)root.append(node('p','q-help','Este juego necesita soluciones durante su ejecución. Para crear preguntas sin solución y corregirlas después, utiliza Cuestionario con el tipo de pregunta correspondiente.'));
    const list=node('div','q-list');
    payload.questions.forEach((question,index)=>{
      ensureSolution(question);
      const card=node('section','q-card');
      const top=node('div','q-card-head');top.append(node('strong',null,'Pregunta '+(index+1)));const actions=node('div','q-card-actions');actions.append(rowButton('Duplicar',()=>{const copy=structuredClone(question);copy.id=uid('q');payload.questions.splice(index+1,0,copy);save(model,activityId,payload,onChange);render();}),rowButton('Eliminar',()=>{if(payload.questions.length<=1){report('El cuestionario necesita al menos una pregunta');return;}payload.questions.splice(index,1);save(model,activityId,payload,onChange);render();},true));top.append(actions);card.append(top);
      const basic=node('div','q-basic-grid');const prompt=textAreaInput(question.prompt,'Escribe el enunciado completo de la pregunta',4);prompt.className='q-prompt-input';prompt.addEventListener('input',()=>{question.prompt=prompt.value;save(model,activityId,payload,onChange);});const promptField=labeled('Enunciado',prompt);promptField.classList.add('q-field--prompt');const allowed=RENDERER_TYPES[renderer]??Object.keys(TYPE_LABELS);let typeControl;if(allowed.length===1){typeControl=node('div','q-fixed-type',TYPE_LABELS[allowed[0]]??allowed[0]);if(question.type!==allowed[0]){switchType(question,allowed[0]);save(model,activityId,payload,onChange);}}else{typeControl=selectInput(question.type,allowed.map((key)=>[key,TYPE_LABELS[key]??key]));typeControl.title=studioUiText('Cambiar de modalidad reemplaza los elementos y soluciones de esta pregunta, conservando título, tiempo y puntuación.');typeControl.addEventListener('change',()=>{switchType(question,typeControl.value);save(model,activityId,payload,onChange);render();});}
      const points=numberInput(question.points,0);points.addEventListener('input',()=>{question.points=Math.max(0,Number(points.value)||0);save(model,activityId,payload,onChange);});
      const questionTime=numberInput(question.timeLimitSeconds??null,1,1);questionTime.placeholder=studioUiText('Sin límite');questionTime.addEventListener('input',()=>{const value=questionTime.value.trim();if(!value)delete question.timeLimitSeconds;else question.timeLimitSeconds=Math.max(1,Math.floor(Number(value)||1));save(model,activityId,payload,onChange);});
      const subtract=document.createElement('input');subtract.type='checkbox';subtract.checked=question.scoring==='partial-with-penalty';
      const penalty=numberInput(subtract.checked?(question.penalty??0.25):null,0,'0.25');penalty.placeholder=studioUiText('0.25');penalty.disabled=!subtract.checked;
      const savePenalty=()=>{if(subtract.checked){question.scoring='partial-with-penalty';question.penalty=Math.max(0,Number(penalty.value)||0);}else{if(question.scoring==='partial-with-penalty')delete question.scoring;delete question.penalty;}penalty.disabled=!subtract.checked;save(model,activityId,payload,onChange);};
      subtract.addEventListener('change',()=>{if(subtract.checked&&!penalty.value)penalty.value='0.25';savePenalty();});penalty.addEventListener('input',savePenalty);
      basic.append(promptField,labeled('Tipo',typeControl),labeled('Tiempo (s)',questionTime),labeled('Puntos',points),labeled('El fallo resta',subtract),labeled('Penalización',penalty));card.append(basic);
      const body=node('div','q-type-editor');const commit=()=>{ensureSolution(question);save(model,activityId,payload,onChange);};
      if(question.type==='true-false')renderTrueFalseEditor(body,question,commit,render,manual);
      else if(['single-choice','multiple-choice'].includes(question.type))renderChoiceEditor(body,question,commit,render,manual);
      else if(question.type==='text')renderTextEditor(body,question,commit,manual);
      else if(question.type==='fill-blanks')renderBlankEditor(body,question,commit,render,manual);
      else if(question.type==='ordering')renderOrderingEditor(body,question,commit,render);
      else if(question.type==='matching')renderMatchingEditor(body,question,commit,render,manual);
      else if(question.type==='classification'&&question.assembly3d)renderAssembly3DEditor(body,{question,model,commit,onStatus:report});
      else if(question.type==='classification')renderClassificationEditor(body,question,commit,render,manual);
      card.append(body);list.append(card);
    });
    const add=node('div','q-add-row');const allowed=RENDERER_TYPES[renderer]??Object.keys(TYPE_LABELS);const addType=allowed.length===1?null:selectInput(allowed[0],allowed.map((key)=>[key,TYPE_LABELS[key]??key]));const addButton=rowButton('+ Añadir pregunta',()=>{const q=defaultQuestion(addType?.value??allowed[0]);ensureSolution(q);payload.questions.push(q);save(model,activityId,payload,onChange);render();});if(addType)add.append(addType);add.append(addButton);list.append(add);root.append(list);
    const advanced=document.createElement('details');advanced.className='q-advanced';const summary=document.createElement('summary');summary.textContent=studioUiText('Avanzado: ver JSON');const area=document.createElement('textarea');area.value=JSON.stringify(questionnaireForLearner(payload),null,2);area.spellcheck=false;area.addEventListener('change',()=>{try{const parsed=JSON.parse(area.value);Object.keys(payload).forEach((k)=>delete payload[k]);Object.assign(payload,parsed);save(model,activityId,payload,onChange);report('Modelo avanzado actualizado');render();}catch(error){report('JSON avanzado no válido: '+error.message);}});advanced.append(summary,area);root.append(advanced);
    container.append(root);
  };
  render();
}
