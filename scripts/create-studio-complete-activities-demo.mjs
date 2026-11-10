// Reusable real-course fixture. Produces one editable, exportable P2LRN file
// using the official Studio document API; no second editor or mock Player.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash,webcrypto} from 'node:crypto';
import {createP2LRNStudioDocument} from '../packages/toolkit/web/studio/new-document.js';
import {exportP2LRNPackage} from '../packages/toolkit/web/studio/package-export.js';
import {openP2LRNPackageBytes} from '../packages/toolkit/web/p2lrn-player.js';
import {validateQuestionnaire} from '../packages/toolkit/web/questionnaire-core.js';
import {buildQuestionnaireGame,SPANISH_ALPHABET} from '../packages/toolkit/web/questionnaire-games-core.js';
import {defaultAssembly} from '../packages/toolkit/web/assembly-3d-core.js';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const ROOT=resolve(process.cwd());
const OUT=resolve(process.env.P2LRN_DEMO_OUTPUT_DIR||join(ROOT,'.visual-evidence','studio-curso-integral'));
const encoder=new TextEncoder();
const schema='https://p2lrn.org/schema/native-questionnaire/0.4.0';
const ren=(id)=>'https://p2lrn.org/renderer/questionnaire/'+id;
const assert=(value,message)=>{if(!value)throw new Error(message);};
const uuid=(prefix)=>prefix+'-'+crypto.randomUUID().slice(0,12);
const text=(prompt,answer,id=uuid('q'))=>({id,type:'text',prompt,points:1,solution:{acceptedAnswers:[answer]}});
const choice=(type,prompt,options,correct,points=1)=>({
  id:uuid('q'),type,prompt,points,choices:options.map((value,i)=>({id:'op'+i,text:value})),
  solution:{choiceIds:correct.map(i=>'op'+i)},
});
const tf=(prompt,isTrue)=>({
  id:uuid('q'),type:'true-false',trueFalseMode:'single',prompt,points:1,
  choices:[{id:'t',text:'Verdadero'},{id:'f',text:'Falso'}],
  solution:{choiceIds:[isTrue?'t':'f']},
});
const tfMulti=(prompt,statements,answers)=>({
  id:uuid('q'),type:'true-false',trueFalseMode:'multiple',prompt,points:2,
  statements:statements.map((value,i)=>({id:'s'+i,text:value})),
  solution:{answers:Object.fromEntries(answers.map((answer,i)=>['s'+i,answer]))},
});
const blanks=(prompt,body,entries,mode='text')=>{
  const options=entries.map(v=>v[1]);
  return {
    id:uuid('q'),type:'fill-blanks',prompt,body,inputMode:mode,points:entries.length,
    blanks:entries.map(([id],i)=>({id, ...(mode==='drag'?{options:[...options,'Marte','hidrógeno','meridiano']}:{})})),
    solution:{answers:Object.fromEntries(entries.map(([id,answer])=>[id,[answer]]))},
  };
};
const ordering=(prompt,items)=>({
  id:uuid('q'),type:'ordering',prompt,points:items.length,
  items:items.map((v,i)=>({id:'ord'+i,text:v})),
  solution:{order:items.map((_,i)=>'ord'+i)},
});
const matching=(prompt,pairs)=>({
  id:uuid('q'),type:'matching',prompt,points:pairs.length,
  left:pairs.map(([value],i)=>({id:'left'+i,text:value})),
  right:pairs.map(([,value],i)=>({id:'right'+i,text:value})),
  solution:{pairs:pairs.map((_,i)=>({left:'left'+i,right:'right'+i}))},
});
const classification=(prompt,categories,rows)=>({
  id:uuid('q'),type:'classification',prompt,points:rows.length,
  categories:categories.map(([id,label])=>({id,text:label})),
  items:rows.map(([name],i)=>({id:'item'+i,text:name})),
  solution:{assignments:rows.map(([,cat],i)=>({item:'item'+i,category:cat}))},
});
const mkPayload=(title,questions,other={})=>({
  schema,version:'0.4.0',title,language:'es',
  grading:{mode:'embedded-key'},
  presentation:{questionMode:'one-at-a-time',shuffleQuestions:false,showFeedback:'after-submit'},
  attemptPolicy:{maxAttempts:3},
  ...other,questions,
});
const lexical=(title,pairs)=>mkPayload(title,pairs.map(([q,a])=>text(q,a)));
const sciencePairs=[
  ['Mercurio','Planeta más cercano al Sol'],
  ['Venus','Planeta con atmósfera densa'],
  ['Tierra','Planeta con océanos líquidos'],
  ['Marte','Planeta conocido como rojo'],
];
const worldPairs=[
  ['España','Madrid'],['Portugal','Lisboa'],['Francia','París'],['Italia','Roma'],
];
const classificationQuestion=()=>classification('Clasifica cada elemento en su grupo correcto',[
  ['astro','Astros'],['geo','Geología'],['agua','Hidrosfera'],
],[
  ['Luna','astro'],['Cometa','astro'],['Granito','geo'],['Volcán','geo'],
  ['Océano','agua'],['Río','agua'],
]);

const RoscoItems=[
  ['A','starts','Atmósfera','Capa de gases que rodea la Tierra.'],
  ['B','starts','Biosfera','Conjunto de zonas terrestres donde existe vida.'],
  ['C','starts','Corteza','Capa sólida más externa de nuestro planeta.'],
  ['D','starts','Densidad','Masa dividida entre volumen.'],
  ['E','starts','Eclipse','Ocultación temporal de un astro por otro.'],
  ['F','starts','Fósil','Resto o huella de un ser vivo del pasado.'],
  ['G','starts','Gravedad','Interacción que atrae a los cuerpos con masa.'],
  ['H','starts','Hidrosfera','Conjunto de toda el agua de la Tierra.'],
  ['I','starts','Isótopo','Átomo con igual número de protones y distinto número de neutrones.'],
  ['J','starts','Júpiter','Mayor planeta del Sistema Solar.'],
  ['M','starts','Magma','Roca fundida que se encuentra bajo la superficie terrestre.'],
  ['N','starts','Núcleo','Región central interna de un planeta.'],
  ['Ñ','contains','Montaña','Gran elevación natural del terreno.'],
  ['Q','contains','Equinoccio','Momento del año en que la duración del día y la noche es aproximadamente igual.'],
  ['R','contains','Terremoto','Sacudida del terreno por liberación de energía sísmica.'],
  ['Z','contains','Ozono','Gas compuesto por tres átomos de oxígeno.'],
];
const roscoQuestion=(letter,mode,answer,clue)=>({
  ...text(clue,answer,'rosco-'+letter),roscoLetter:letter,roscoMode:mode,
});
const crossWords=[
  ['Astro que ilumina la Tierra.','Sol'],
  ['Satélite natural terrestre.','Luna'],
  ['Gran masa de agua salada.','Mar'],
  ['Conjunto de gases que respiramos.','Aire'],
  ['Movimiento periódico de la superficie del mar.','Marea'],
  ['Nuestro planeta.','Tierra'],
  ['Energía que permite ver.','Luz'],
  ['Arena y agua junto al mar.','Playa'],
];
const wordSearchWords=[
  ['Cuerpo celeste que orbita una estrella.','Planeta'],
  ['Objeto helado con cola al acercarse al Sol.','Cometa'],
  ['Astro que produce luz por fusión.','Estrella'],
  ['Conjunto enorme de estrellas.','Galaxia'],
  ['Trayectoria de un cuerpo alrededor de otro.','Órbita'],
  ['Objeto que gira alrededor de un planeta.','Satélite'],
  ['Gran extensión de agua salada.','Océano'],
  ['Abertura geológica que expulsa lava.','Volcán'],
];
const doc=createP2LRNStudioDocument({
  title:'Laboratorio completo P2LRN · Cuestionarios y juegos',
  language:'es',
  description:'Curso editable que muestra todos los tipos de pregunta y juegos nativos disponibles, con rosco de dieciséis letras.',
  license:'P2LRN-NCSL-1.0',
});
const baseUnit=doc.children(doc.rootId)[0];
doc.setTitle(baseUnit.id,'01 · Introducción y guía');
const unitQuiz=doc.addUnit(doc.rootId,{title:'02 · Todos los tipos de pregunta'});
const unitGames=doc.addUnit(doc.rootId,{title:'03 · Juegos 2D'});
const unit3d=doc.addUnit(doc.rootId,{title:'04 · Juegos 3D'});
const activityList=[];
function addActivity(unit,title,renderer,payload,kind){
  validateQuestionnaire(payload);
  if(renderer!==ren('standard')){
    const compatible=buildQuestionnaireGame(payload,renderer,{seedSource:'curso-demostracion-real'});
    assert(compatible.compatible,title+' no compatible: '+compatible.reasons.join('; '));
  }
  const activity=doc.addQuestionnaire(unit.id,{title,language:'es',renderer,payload});
  activityList.push({id:activity.id,title,renderer,questions:payload.questions.length,kind});
  return activity;
}
const standard=mkPayload('Cuestionario completo: diez modalidades y variaciones',[
  choice('single-choice','¿Cuál es el tercer planeta desde el Sol?',['Marte','Tierra','Venus','Mercurio'],[1]),
  choice('multiple-choice','Selecciona los cuerpos que son planetas.',['Marte','Cometa Halley','Saturno','Luna'],[0,2],2),
  tf('La Tierra gira alrededor del Sol.',true),
  tfMulti('Marca verdadero o falso en cada afirmación.',[
    'La Luna es un satélite natural.','Júpiter es una estrella.','El agua líquida existe en los océanos.',
  ],[true,false,true]),
  {...text('Escribe el nombre del planeta rojo.','Marte'),points:2},
  blanks('Rellena escribiendo las palabras','Nuestro planeta se llama {{b1}} y orbita alrededor del {{b2}}.',[['b1','Tierra'],['b2','Sol']]),
  blanks('Arrastra las palabras al espacio correcto','El {{b1}} contiene agua salada y la {{b2}} es nuestra estrella.',[['b1','océano'],['b2','estrella']],'drag'),
  ordering('Ordena las fases principales del ciclo del agua.',[
    'Evaporación','Condensación','Precipitación','Acumulación',
  ]),
  matching('Relaciona cada país con su capital.',worldPairs),
  classificationQuestion(),
],{presentation:{questionMode:'one-at-a-time',shuffleQuestions:false,showFeedback:'after-submit'},attemptPolicy:{maxAttempts:3}});
standard.questions[1].scoring='partial-per-item';
standard.questions[6].scoring='partial-with-penalty';
standard.questions[6].penalty=0.25;
addActivity(unitQuiz,'Cuestionario completo · diez tipos y variantes',ren('standard'),standard,'standard');

addActivity(unitGames,'Memoria · parejas de planetas',ren('memory'),
  mkPayload('Memoria', [matching('Memoriza y empareja',sciencePairs)]),'memory');
addActivity(unitGames,'Emparejar · capitales',ren('matching'),
  mkPayload('Emparejar', [matching('Relaciona los países con sus capitales',worldPairs)]),'matching');
addActivity(unitGames,'Ordenar · ciclo del agua',ren('ordering'),
  mkPayload('Ordenar', [ordering('Organiza el ciclo del agua',[
    'Evaporación','Condensación','Precipitación','Acumulación',
  ])]),'ordering');
addActivity(unitGames,'Clasificar · ciencias',ren('classification'),
  mkPayload('Clasificar',[classificationQuestion()]),'classification');
addActivity(unitGames,'Verdadero y falso · astronomía',ren('true-false'),
  mkPayload('Verdadero y falso',[tf('La Luna refleja la luz solar.',true),tf('El Sol es un planeta.',false),tf('Marte tiene dos satélites naturales.',true)]),'true-false');
addActivity(unitGames,'Completar huecos · arrastrar palabras',ren('fill-blanks'),
  mkPayload('Completar huecos',[blanks('Arrastra cada término a su hueco.',
    'El {{b1}} es una estrella y la {{b2}} es un planeta.',[['b1','Sol'],['b2','Tierra']],'drag')]),'fill-blanks');
addActivity(unitGames,'Sopa de letras · universo',ren('word-search'),
  lexical('Sopa de letras',wordSearchWords),'word-search');
addActivity(unitGames,'Crucigrama · ciencias naturales',ren('crossword'),
  lexical('Crucigrama',crossWords),'crossword');
const roscoPayload=mkPayload('Rosco de ciencias · 16 letras',RoscoItems.map(row=>roscoQuestion(...row)));
const rosco=buildQuestionnaireGame(roscoPayload,ren('rosco'));
assert(rosco.compatible,'Rosco no compatible: '+rosco.reasons.join('; '));
assert(rosco.data.elements.length===16,'El rosco no contiene las dieciséis preguntas');
assert(rosco.data.elements.filter(e=>e.mode==='contains').length===4,'Faltan las cuatro preguntas Contiene');
for(const entry of rosco.data.elements){
  const authored=RoscoItems.find(row=>row[0]===entry.letter);
  assert(authored&&entry.mode===authored[1],
    'El rosco ha modificado la letra o el modo del profesor: '+entry.letter);
}
addActivity(unitGames,'Rosco · 16 letras con empieza/contiene',ren('rosco'),roscoPayload,'rosco');

const threeGames=[
  ['3d','3D · ordenar etapas del ciclo del agua'],
  ['3d-matching','3D · relacionar países y capitales'],
  ['3d-classification','3D · clasificar objetos'],
  ['assembly-3d','3D · ensamblar piezas y destinos'],
];
for(const [kind,title] of threeGames){
  const activity=doc.addGame(unit3d.id,{kind,title});
  const record=await doc.readQuestionnaire(activity.id);
  assert(record?.payload,'La actividad '+kind+' no tiene cuestionario');
  if(kind==='3d')record.payload.questions[0]=ordering('Ordena las etapas del ciclo del agua',[
    'Evaporación','Condensación','Precipitación','Acumulación']);
  else if(kind==='3d-matching')record.payload.questions[0]=matching('Relaciona país y capital',worldPairs);
  else if(kind==='3d-classification')record.payload.questions[0]=classificationQuestion();
  else {
    const scene=defaultAssembly();
    record.payload.questions[0]={
      id:'q-assembly',type:'classification',
      prompt:'Coloca las piezas en sus cajas para completar el mecanismo.',
      points:scene.pieces.length,
      items:scene.pieces.map(p=>({id:p.id,text:p.text})),
      categories:scene.targets.map(t=>({id:t.id,text:t.text})),
      solution:{assignments:scene.links.map(l=>({item:l.pieceId,category:l.targetId}))},
      assembly3d:scene,
    };
  }
  doc.setQuestionnaire(activity.id,record.payload);
  const next=await doc.readQuestionnaire(activity.id);
  validateQuestionnaire(next.payload);
  const built=buildQuestionnaireGame(next.payload,ren('3d-order-match'));
  assert(built.compatible,kind+' juego 3D no compatible: '+built.reasons.join('; '));
  activityList.push({id:activity.id,title,renderer:ren('3d-order-match'),questions:next.payload.questions.length,kind});
}
await mkdir(OUT,{recursive:true});
const filename='laboratorio-cuestionarios-y-juegos.p2lrn';
const exported=await exportP2LRNPackage(doc);
const bytes=exported.bytes;
assert(bytes&&bytes.length>2000,'Exportación P2LRN vacía');
const opened=await openP2LRNPackageBytes(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
assert(opened.manifest?.entrypoints?.length&&opened.graph?.entities?.length,'No se puede reabrir el paquete exportado');
const digest=createHash('sha256').update(bytes).digest('hex');
const filePath=join(OUT,filename);
await writeFile(filePath,bytes);
const report={
  ok:true,title:doc.title(doc.rootId),file:filename,sha256:digest,byteSize:bytes.length,
  units:doc.children(doc.rootId).map(u=>({title:doc.title(u.id),activities:doc.children(u.id).length})),
  questionnaireTypes:[...new Set(standard.questions.map(q=>q.type))],
  questionVariants:{trueFalseSingle:true,trueFalseMultiple:true,fillBlanksText:true,fillBlanksDrag:true,
    multipleSelection:true,partialScoring:true,penalty:true,attempts:true},
  games:activityList.filter(a=>a.kind!=='standard').map(a=>({title:a.title,kind:a.kind,questions:a.questions})),
  totalActivities:activityList.length,totalQuestions:activityList.reduce((s,a)=>s+a.questions,0),
  rosco:rosco.data.elements.map(e=>({letter:e.letter,mode:e.mode,clue:e.clue,word:e.word})),
  studentRendererCompatibility:true,packageReopened:true,
};
await writeFile(join(OUT,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log('P2LRN_COMPLETE_COURSE='+JSON.stringify(report));
console.log('P2LRN_COMPLETE_FILE='+filePath);
