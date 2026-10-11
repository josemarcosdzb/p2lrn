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
  'https://p2lrn.org/renderer/questionnaire/3d-order-match':['ordering'],
};
const uid=(prefix='id')=>prefix+'-'+crypto.randomUUID().slice(0,8);
const node=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
const labeled=(label,control)=>{const wrap=node('label','q-field');wrap.append(node('span','q-label',label),control);return wrap;};
const textInput=(value='',placeholder='')=>{const input=document.createElement('input');input.type='text';input.value=value??'';input.placeholder=placeholder;return input;};
const numberInput=(value=1,min=0,step='0.25')=>{const input=document.createElement('input');input.type='number';input.min=String(min);input.step=String(step);input.value=value===null||value===undefined?'':String(value);return input;};
const selectInput=(value,options)=>{const select=document.createElement('select');for(const [key,label] of options){const option=document.createElement('option');option.value=key;option.textContent=label;if(key===value)option.selected=true;select.append(option);}return select;};
const save=(model,activityId,payload,onChange)=>{model.setQuestionnaire(activityId,payload);onChange?.(payload);};

function defaultQuestion(type='single-choice'){
  const id=uid('q');
  if(type==='single-choice')return{id,type,prompt:'Escribe aquí la pregunta',points:1,choices:[{id:uid('a'),text:'Respuesta correcta'},{id:uid('a'),text:'Otra respuesta'}],solution:{choiceIds:[]}};
  if(type==='multiple-choice')return{id,type,prompt:'Selecciona todas las respuestas correctas',points:1,choices:[{id:uid('a'),text:'Opción 1'},{id:uid('a'),text:'Opción 2'},{id:uid('a'),text:'Opción 3'}],solution:{choiceIds:[]}};
  if(type==='true-false')return{id,type,prompt:'Escribe una afirmación',points:1,choices:[{id:uid('t'),text:'Verdadero'},{id:uid('f'),text:'Falso'}],solution:{choiceIds:[]}};
  if(type==='text')return{id,type,prompt:'Escribe la pregunta',points:1,solution:{acceptedAnswers:['Respuesta']}};
  if(type==='fill-blanks')return{id,type,prompt:'Completa los huecos',points:1,blanks:[{id:uid('blank')}],solution:{answers:{}}};
  if(type==='ordering')return{id,type,prompt:'Ordena los elementos',points:1,items:[{id:uid('i'),text:'Primero'},{id:uid('i'),text:'Segundo'}],solution:{order:[]}};
  if(type==='matching')return{id,type,prompt:'Relaciona cada elemento',points:1,left:[{id:uid('l'),text:'Elemento A'},{id:uid('l'),text:'Elemento B'}],right:[{id:uid('r'),text:'Pareja A'},{id:uid('r'),text:'Pareja B'}],solution:{pairs:[]}};
  return{id,type:'classification',prompt:'Clasifica los elementos',points:1,items:[{id:uid('i'),text:'Elemento A'},{id:uid('i'),text:'Elemento B'}],categories:[{id:uid('c'),text:'Grupo 1'},{id:uid('c'),text:'Grupo 2'}],solution:{assignments:[]}};
}
function ensureSolution(question){
  if(['single-choice','multiple-choice','true-false'].includes(question.type)){question.choices??=[];question.solution={choiceIds:(question.solution?.choiceIds??[]).filter((id)=>question.choices.some((c)=>c.id===id))};if(!question.solution.choiceIds.length&&question.choices[0])question.solution.choiceIds=[question.choices[0].id];}
  else if(question.type==='text'){question.solution={acceptedAnswers:question.solution?.acceptedAnswers?.length?question.solution.acceptedAnswers:['Respuesta']};}
  else if(question.type==='fill-blanks'){question.blanks??=[];const old=question.solution?.answers??{};question.solution={answers:Object.fromEntries(question.blanks.map((b)=>[b.id,old[b.id]?.length?old[b.id]:['Respuesta']]))};}
  else if(question.type==='ordering'){question.items??=[];question.solution={order:question.items.map((x)=>x.id)};}
  else if(question.type==='matching'){question.left??=[];question.right??=[];question.solution={pairs:question.left.map((left,index)=>({left:left.id,right:question.right[index]?.id??question.right[0]?.id})).filter((p)=>p.right)};}
  else if(question.type==='classification'){question.items??=[];question.categories??=[];const fallback=question.categories[0]?.id;question.solution={assignments:question.items.map((item)=>({item:item.id,category:question.solution?.assignments?.find((x)=>x.item===item.id)?.category??fallback})).filter((x)=>x.category)};}
}
function switchType(question,type){const next=defaultQuestion(type);const id=question.id,prompt=question.prompt,points=question.points;Object.keys(question).forEach((k)=>delete question[k]);Object.assign(question,next,{id,prompt,points});ensureSolution(question);}
function rowButton(text,handler,danger=false){const b=node('button',danger?'q-mini q-danger':'q-mini',text);b.type='button';b.addEventListener('click',handler);return b;}
function renderChoiceEditor(box,question,commit,rerender){
  const multiple=question.type==='multiple-choice';ensureSolution(question);
  question.choices.forEach((choice,index)=>{const row=node('div','q-option-row');const correct=document.createElement('input');correct.type=multiple?'checkbox':'radio';correct.name='correct-'+question.id;correct.checked=question.solution.choiceIds.includes(choice.id);correct.title='Respuesta correcta';correct.addEventListener('change',()=>{if(multiple){const set=new Set(question.solution.choiceIds);correct.checked?set.add(choice.id):set.delete(choice.id);question.solution.choiceIds=[...set];}else question.solution.choiceIds=[choice.id];commit();});const input=textInput(choice.text,'Respuesta');input.addEventListener('input',()=>{choice.text=input.value;commit();});row.append(correct,input,rowButton('Eliminar',()=>{question.choices.splice(index,1);ensureSolution(question);commit();rerender();},true));box.append(row);});
  box.append(rowButton('+ Añadir respuesta',()=>{question.choices.push({id:uid('a'),text:'Nueva respuesta'});ensureSolution(question);commit();rerender();}));
}
function renderTextEditor(box,question,commit){ensureSolution(question);const area=document.createElement('textarea');area.className='q-answer-list';area.value=question.solution.acceptedAnswers.join('\n');area.placeholder='Una respuesta aceptada por línea';area.addEventListener('input',()=>{question.solution.acceptedAnswers=area.value.split(/\r?\n/).map((x)=>x.trim()).filter(Boolean);commit();});box.append(labeled('Respuestas aceptadas',area));}
function renderBlankEditor(box,question,commit,rerender){ensureSolution(question);question.blanks.forEach((blank,index)=>{const row=node('div','q-option-row');const id=node('span','q-chip','Hueco '+(index+1));const answers=textInput((question.solution.answers[blank.id]??[]).join(' | '),'respuesta | alternativa');answers.addEventListener('input',()=>{question.solution.answers[blank.id]=answers.value.split('|').map((x)=>x.trim()).filter(Boolean);commit();});row.append(id,answers,rowButton('Eliminar',()=>{question.blanks.splice(index,1);ensureSolution(question);commit();rerender();},true));box.append(row);});box.append(rowButton('+ Añadir hueco',()=>{question.blanks.push({id:uid('blank')});ensureSolution(question);commit();rerender();}));}
function renderOrderingEditor(box,question,commit,rerender){ensureSolution(question);question.items.forEach((item,index)=>{const row=node('div','q-option-row');row.append(node('span','q-order',String(index+1)));const input=textInput(item.text,'Elemento');input.addEventListener('input',()=>{item.text=input.value;commit();});row.append(input,rowButton('↑',()=>{if(index>0){[question.items[index-1],question.items[index]]=[question.items[index],question.items[index-1]];ensureSolution(question);commit();rerender();}}),rowButton('↓',()=>{if(index<question.items.length-1){[question.items[index+1],question.items[index]]=[question.items[index],question.items[index+1]];ensureSolution(question);commit();rerender();}}),rowButton('Eliminar',()=>{question.items.splice(index,1);ensureSolution(question);commit();rerender();},true));box.append(row);});box.append(rowButton('+ Añadir elemento',()=>{question.items.push({id:uid('i'),text:'Nuevo elemento'});ensureSolution(question);commit();rerender();}));}
function renderMatchingEditor(box,question,commit,rerender){ensureSolution(question);const count=Math.max(question.left.length,question.right.length);for(let i=0;i<count;i++){question.left[i]??={id:uid('l'),text:'Elemento'};question.right[i]??={id:uid('r'),text:'Pareja'};const row=node('div','q-pair-row');const left=textInput(question.left[i].text,'Elemento');const right=textInput(question.right[i].text,'Pareja correcta');left.addEventListener('input',()=>{question.left[i].text=left.value;commit();});right.addEventListener('input',()=>{question.right[i].text=right.value;commit();});row.append(left,node('span','q-arrow','↔'),right,rowButton('Eliminar',()=>{question.left.splice(i,1);question.right.splice(i,1);ensureSolution(question);commit();rerender();},true));box.append(row);}box.append(rowButton('+ Añadir pareja',()=>{question.left.push({id:uid('l'),text:'Elemento'});question.right.push({id:uid('r'),text:'Pareja'});ensureSolution(question);commit();rerender();}));}
function renderClassificationEditor(box,question,commit,rerender){ensureSolution(question);const categories=node('div','q-subsection');categories.append(node('h4',null,'Categorías'));question.categories.forEach((cat,index)=>{const row=node('div','q-option-row');const input=textInput(cat.text,'Categoría');input.addEventListener('input',()=>{cat.text=input.value;commit();});row.append(input,rowButton('Eliminar',()=>{question.categories.splice(index,1);ensureSolution(question);commit();rerender();},true));categories.append(row);});categories.append(rowButton('+ Añadir categoría',()=>{question.categories.push({id:uid('c'),text:'Nueva categoría'});ensureSolution(question);commit();rerender();}));box.append(categories);
  const items=node('div','q-subsection');items.append(node('h4',null,'Elementos'));question.items.forEach((item,index)=>{const row=node('div','q-class-row');const input=textInput(item.text,'Elemento');input.addEventListener('input',()=>{item.text=input.value;commit();});const current=question.solution.assignments.find((x)=>x.item===item.id)?.category;const select=selectInput(current,question.categories.map((c)=>[c.id,c.text]));select.addEventListener('change',()=>{const found=question.solution.assignments.find((x)=>x.item===item.id);if(found)found.category=select.value;else question.solution.assignments.push({item:item.id,category:select.value});commit();});row.append(input,select,rowButton('Eliminar',()=>{question.items.splice(index,1);ensureSolution(question);commit();rerender();},true));items.append(row);});items.append(rowButton('+ Añadir elemento',()=>{question.items.push({id:uid('i'),text:'Nuevo elemento'});ensureSolution(question);commit();rerender();}));box.append(items);}

export function renderQuestionnaireVisualEditor(container,{model,activityId,payload,renderer,onChange,onStatus}={}){
  const render=()=>{
    container.replaceChildren();
    const root=node('div','questionnaire-visual-editor');
    const hero=node('div','q-editor-head');
    const copy=node('div');copy.append(node('span','q-kicker',GAME_LABELS[renderer]??'Cuestionario / juego'),node('h2',null,payload.title||'Cuestionario'),node('p',null,'Edita preguntas y respuestas con controles normales. No necesitas tocar JSON.'));
    hero.append(copy);root.append(hero);
    const settings=node('div','q-settings');
    const title=textInput(payload.title,'Título');title.addEventListener('input',()=>{payload.title=title.value;save(model,activityId,payload,onChange);hero.querySelector('h2').textContent=title.value||'Cuestionario';});
    const language=textInput(payload.language||'es','es');language.addEventListener('input',()=>{payload.language=language.value;save(model,activityId,payload,onChange);});
    const mode=selectInput(payload.presentation?.questionMode??'one-at-a-time',[['one-at-a-time','Una pregunta cada vez'],['all','Todas a la vez']]);mode.addEventListener('change',()=>{payload.presentation??={};payload.presentation.questionMode=mode.value;save(model,activityId,payload,onChange);});
    const feedback=selectInput(payload.presentation?.showFeedback??'after-submit',[['after-submit','Mostrar después de responder'],['never','No mostrar corrección']]);feedback.addEventListener('change',()=>{payload.presentation??={};payload.presentation.showFeedback=feedback.value;save(model,activityId,payload,onChange);});
    const shuffle=document.createElement('input');shuffle.type='checkbox';shuffle.checked=Boolean(payload.presentation?.shuffleQuestions);shuffle.addEventListener('change',()=>{payload.presentation??={};payload.presentation.shuffleQuestions=shuffle.checked;save(model,activityId,payload,onChange);});
    const progression=model.progressionForActivity?.(activityId)??null;
    const progressionMode=progression?.gateFollowing===true?(progression.completionRequirement==='passed'?'passed':'completed'):'none';
    const continueMode=selectInput(progressionMode,[['none','Libre'],['completed','Completar'],['passed','Superar']]);
    const minScore=numberInput(Number.isFinite(Number(progression?.minScore))?Number(progression.minScore):80,0,1);minScore.max='100';minScore.disabled=continueMode.value!=='passed';
    const attempts=numberInput(payload.attemptPolicy?.maxAttempts??null,1,1);attempts.placeholder='Ilimitados';
    const saveProgression=()=>{const selected=continueMode.value;minScore.disabled=selected!=='passed';model.setActivityProgression?.(activityId,{mode:selected,minScore:Number(minScore.value)||0});onChange?.(payload);};
    continueMode.addEventListener('change',saveProgression);minScore.addEventListener('input',saveProgression);
    attempts.addEventListener('input',()=>{const value=attempts.value.trim();if(!value){if(payload.attemptPolicy){delete payload.attemptPolicy.maxAttempts;if(Object.keys(payload.attemptPolicy).length===0)delete payload.attemptPolicy;}}else{payload.attemptPolicy??={};payload.attemptPolicy.maxAttempts=Math.max(1,Math.floor(Number(value)||1));}save(model,activityId,payload,onChange);});
    settings.append(labeled('Título',title),labeled('Idioma',language),labeled('Presentación',mode),labeled('Corrección',feedback),labeled('Mezclar preguntas',shuffle),labeled('Para poder seguir',continueMode),labeled('Nota mínima (%)',minScore),labeled('Número de intentos',attempts));root.append(settings);
    const list=node('div','q-list');
    payload.questions.forEach((question,index)=>{
      ensureSolution(question);
      const card=node('section','q-card');
      const top=node('div','q-card-head');top.append(node('strong',null,'Pregunta '+(index+1)));const actions=node('div','q-card-actions');actions.append(rowButton('Duplicar',()=>{const copy=structuredClone(question);copy.id=uid('q');payload.questions.splice(index+1,0,copy);save(model,activityId,payload,onChange);render();}),rowButton('Eliminar',()=>{if(payload.questions.length<=1){onStatus?.('El cuestionario necesita al menos una pregunta');return;}payload.questions.splice(index,1);save(model,activityId,payload,onChange);render();},true));top.append(actions);card.append(top);
      const basic=node('div','q-basic-grid');const prompt=textInput(question.prompt,'Pregunta');prompt.addEventListener('input',()=>{question.prompt=prompt.value;save(model,activityId,payload,onChange);});const allowed=RENDERER_TYPES[renderer]??Object.keys(TYPE_LABELS);let typeControl;if(allowed.length===1){typeControl=node('div','q-fixed-type',TYPE_LABELS[allowed[0]]??allowed[0]);if(question.type!==allowed[0]){switchType(question,allowed[0]);save(model,activityId,payload,onChange);}}else{typeControl=selectInput(question.type,allowed.map((key)=>[key,TYPE_LABELS[key]??key]));typeControl.addEventListener('change',()=>{switchType(question,typeControl.value);save(model,activityId,payload,onChange);render();});}
      const points=numberInput(question.points,0);points.addEventListener('input',()=>{question.points=Math.max(0,Number(points.value)||0);save(model,activityId,payload,onChange);});
      const questionTime=numberInput(question.timeLimitSeconds??null,1,1);questionTime.placeholder='Sin límite';questionTime.addEventListener('input',()=>{const value=questionTime.value.trim();if(!value)delete question.timeLimitSeconds;else question.timeLimitSeconds=Math.max(1,Math.floor(Number(value)||1));save(model,activityId,payload,onChange);});
      const subtract=document.createElement('input');subtract.type='checkbox';subtract.checked=question.scoring==='partial-with-penalty';
      const penalty=numberInput(subtract.checked?(question.penalty??0.25):null,0,'0.25');penalty.placeholder='0.25';penalty.disabled=!subtract.checked;
      const savePenalty=()=>{if(subtract.checked){question.scoring='partial-with-penalty';question.penalty=Math.max(0,Number(penalty.value)||0);}else{if(question.scoring==='partial-with-penalty')delete question.scoring;delete question.penalty;}penalty.disabled=!subtract.checked;save(model,activityId,payload,onChange);};
      subtract.addEventListener('change',()=>{if(subtract.checked&&!penalty.value)penalty.value='0.25';savePenalty();});penalty.addEventListener('input',savePenalty);
      basic.append(labeled('Enunciado',prompt),labeled('Tipo',typeControl),labeled('Tiempo (s)',questionTime),labeled('Puntos',points),labeled('El fallo resta',subtract),labeled('Penalización',penalty));card.append(basic);
      const body=node('div','q-type-editor');const commit=()=>{ensureSolution(question);save(model,activityId,payload,onChange);};
      if(['single-choice','multiple-choice','true-false'].includes(question.type))renderChoiceEditor(body,question,commit,render);
      else if(question.type==='text')renderTextEditor(body,question,commit);
      else if(question.type==='fill-blanks')renderBlankEditor(body,question,commit,render);
      else if(question.type==='ordering')renderOrderingEditor(body,question,commit,render);
      else if(question.type==='matching')renderMatchingEditor(body,question,commit,render);
      else if(question.type==='classification')renderClassificationEditor(body,question,commit,render);
      card.append(body);list.append(card);
    });
    const add=node('div','q-add-row');const allowed=RENDERER_TYPES[renderer]??Object.keys(TYPE_LABELS);const addType=allowed.length===1?null:selectInput(allowed[0],allowed.map((key)=>[key,TYPE_LABELS[key]??key]));const addButton=rowButton('+ Añadir pregunta',()=>{const q=defaultQuestion(addType?.value??allowed[0]);ensureSolution(q);payload.questions.push(q);save(model,activityId,payload,onChange);render();});if(addType)add.append(addType);add.append(addButton);list.append(add);root.append(list);
    const advanced=document.createElement('details');advanced.className='q-advanced';const summary=document.createElement('summary');summary.textContent='Avanzado: ver JSON';const area=document.createElement('textarea');area.value=JSON.stringify(payload,null,2);area.spellcheck=false;area.addEventListener('change',()=>{try{const parsed=JSON.parse(area.value);Object.keys(payload).forEach((k)=>delete payload[k]);Object.assign(payload,parsed);save(model,activityId,payload,onChange);onStatus?.('Modelo avanzado actualizado');render();}catch(error){onStatus?.('JSON avanzado no válido: '+error.message);}});advanced.append(summary,area);root.append(advanced);
    container.append(root);
  };
  render();
}
