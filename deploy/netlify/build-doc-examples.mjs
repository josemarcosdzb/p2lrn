import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {writeZip} from '../../packages/toolkit/dist/core/zip.js';
import {convertExternalPackage} from '../../packages/toolkit/dist/creator/external.js';
import {computeContentRoot, contentDigest, sha256} from '../../packages/toolkit/dist/core/integrity.js';
import {openP2LRNPackageBytes} from '../../packages/toolkit/web/p2lrn-player.js';
import {createMultipartPayload, MULTIPART_MEDIA_TYPE, MULTIPART_PROFILE} from '../../packages/toolkit/web/multipart.js';
import {
  NATIVE_QUESTIONNAIRE_MEDIA_TYPE,
  NATIVE_QUESTIONNAIRE_PROFILE,
  NATIVE_QUESTIONNAIRE_SCHEMA,
  validateQuestionnaire,
} from '../../packages/toolkit/web/questionnaire-core.js';
import {buildQuestionnaireGame} from '../../packages/toolkit/web/questionnaire-games-core.js';
import {
  RENDERER_HINT_EXTENSION,
  STANDARD_QUESTIONNAIRE_RENDERER,
  MEMORY_RENDERER,
  MATCHING_RENDERER,
  ORDERING_RENDERER,
  CLASSIFICATION_RENDERER,
  TRUE_FALSE_RENDERER,
  WORD_SEARCH_RENDERER,
  CROSSWORD_RENDERER,
  ROSCO_RENDERER,
  THREE_D_RENDERER,
} from '../../packages/toolkit/web/renderer-registry.js';

const enc = new TextEncoder();
const COURSE_PROFILE = 'https://p2lrn.org/profile/course';
const FORMAT_VERSION = '0.4.0';
const pretty = (value) => enc.encode(JSON.stringify(value, null, 2) + '\n');
const toArrayBuffer = (bytes) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const descriptor = (path, data, mediaType) => ({
  path,
  mediaType,
  size: data.byteLength,
  byteDigest: sha256(data),
  contentDigest: contentDigest(data, mediaType, path),
});
const q = (id, type, prompt, points, extra = {}) => ({id, type, prompt, points, required: true, ...extra});
const questionnaire = (title, questions, extra = {}) => ({
  schema: NATIVE_QUESTIONNAIRE_SCHEMA,
  version: '0.4.0',
  title,
  language: 'es',
  grading: {mode: 'embedded-key'},
  presentation: {questionMode: 'all', shuffleQuestions: false, showFeedback: 'after-submit'},
  questions,
  ...extra,
});

const payloads = {
  standard: questionnaire('Questionnaire estándar', [
    q('single', 'single-choice', 'Capital de Portugal', 1, {
      choices: [{id:'lisboa', text:'Lisboa'}, {id:'madrid', text:'Madrid'}],
      solution: {choiceIds:['lisboa']},
    }),
    q('multi', 'multiple-choice', 'Selecciona números pares', 2, {
      choices: [{id:'dos', text:'2'}, {id:'tres', text:'3'}, {id:'cuatro', text:'4'}],
      solution: {choiceIds:['dos','cuatro']},
    }),
    q('tf', 'true-false', 'La Tierra orbita alrededor del Sol', 1, {
      choices: [{id:'t', text:'Verdadero'}, {id:'f', text:'Falso'}],
      solution: {choiceIds:['t']},
    }),
    q('text', 'text', 'Planeta rojo', 1, {solution:{acceptedAnswers:['Marte']}}),
    q('blank', 'fill-blanks', 'Completa la frase', 1, {
      body: 'El agua hierve a ___ °C.',
      blanks: [{id:'temp', label:'temperatura'}],
      solution: {answers:{temp:['100']}},
    }),
    q('order', 'ordering', 'Ordena el proceso', 3, {
      items: [{id:'a', text:'Inicio'}, {id:'b', text:'Proceso'}, {id:'c', text:'Final'}],
      solution: {order:['a','b','c']},
    }),
    q('match', 'matching', 'Relaciona', 3, {
      left: [{id:'sol', text:'Sol'}, {id:'luna', text:'Luna'}],
      right: [{id:'estrella', text:'Estrella'}, {id:'satelite', text:'Satélite'}],
      solution: {pairs:[{left:'sol', right:'estrella'}, {left:'luna', right:'satelite'}]},
    }),
    q('class', 'classification', 'Clasifica', 4, {
      items: [{id:'perro', text:'Perro'}, {id:'pino', text:'Pino'}],
      categories: [{id:'animal', text:'Animal'}, {id:'planta', text:'Planta'}],
      solution: {assignments:[{item:'perro', category:'animal'}, {item:'pino', category:'planta'}]},
    }),
  ], {attemptPolicy:{maxAttempts:3}}),
  pairs: questionnaire('Parejas inequívocas', [
    q('capital', 'single-choice', 'Capital de Portugal', 1, {
      choices:[{id:'lisboa',text:'Lisboa'},{id:'madrid',text:'Madrid'}],
      solution:{choiceIds:['lisboa']},
    }),
    q('rojo', 'single-choice', 'Planeta rojo', 1, {
      choices:[{id:'marte',text:'Marte'},{id:'tierra',text:'Tierra'}],
      solution:{choiceIds:['marte']},
    }),
    q('gas', 'single-choice', 'Gas principal de la atmósfera terrestre', 1, {
      choices:[{id:'nitrogeno',text:'Nitrógeno'},{id:'oxigeno',text:'Oxígeno'}],
      solution:{choiceIds:['nitrogeno']},
    }),
  ]),
  ordering: questionnaire('Ordenar secuencias', [
    q('agua','ordering','Ordena el ciclo simplificado del agua',3,{
      items:[{id:'ev',text:'Evaporación'},{id:'co',text:'Condensación'},{id:'pr',text:'Precipitación'}],
      solution:{order:['ev','co','pr']},
    }),
    q('proyecto','ordering','Ordena un flujo de trabajo',3,{
      items:[{id:'plan',text:'Planificar'},{id:'do',text:'Ejecutar'},{id:'review',text:'Revisar'}],
      solution:{order:['plan','do','review']},
    }),
  ]),
  classification: questionnaire('Clasificación 2D', [
    q('class1','classification','Clasifica los seres vivos',4,{
      items:[{id:'perro',text:'Perro'},{id:'roble',text:'Roble'},{id:'gato',text:'Gato'},{id:'pino',text:'Pino'}],
      categories:[{id:'animal',text:'Animal'},{id:'planta',text:'Planta'}],
      solution:{assignments:[{item:'perro',category:'animal'},{item:'gato',category:'animal'},{item:'roble',category:'planta'},{item:'pino',category:'planta'}]},
    }),
    q('class2','classification','Clasifica los materiales',3,{
      items:[{id:'hierro',text:'Hierro'},{id:'madera',text:'Madera'},{id:'cobre',text:'Cobre'}],
      categories:[{id:'metal',text:'Metal'},{id:'organico',text:'Orgánico'}],
      solution:{assignments:[{item:'hierro',category:'metal'},{item:'cobre',category:'metal'},{item:'madera',category:'organico'}]},
    }),
  ]),
  trueFalse: questionnaire('Verdadero o falso', [
    q('vf1','true-false','La Tierra orbita alrededor del Sol',1,{
      choices:[{id:'t1',text:'Verdadero'},{id:'f1',text:'Falso'}], solution:{choiceIds:['t1']},
    }),
    q('vf2','true-false','El agua pura hierve a 100 °C a nivel del mar',1,{
      choices:[{id:'t2',text:'Verdadero'},{id:'f2',text:'Falso'}], solution:{choiceIds:['t2']},
    }),
    q('vf3','true-false','Marte es una estrella',1,{
      choices:[{id:'t3',text:'Verdadero'},{id:'f3',text:'Falso'}], solution:{choiceIds:['f3']},
    }),
  ]),
  words: questionnaire('Respuestas textuales', [
    q('w1','text','Planeta más cercano al Sol',1,{solution:{acceptedAnswers:['MERCURIO']}}),
    q('w2','text','Segundo planeta del Sistema Solar',1,{solution:{acceptedAnswers:['VENUS']}}),
    q('w3','text','Nuestro planeta',1,{solution:{acceptedAnswers:['TIERRA']}}),
    q('w4','text','Planeta rojo',1,{solution:{acceptedAnswers:['MARTE']}}),
  ]),
  crossword: questionnaire('Crucigrama conectado', [
    q('c1','text','Lugar donde se vive',1,{solution:{acceptedAnswers:['CASA']}}),
    q('c2','text','Anfibio que salta',1,{solution:{acceptedAnswers:['SAPO']}}),
    q('c3','text','Ave acuática',1,{solution:{acceptedAnswers:['PATO']}}),
    q('c4','text','Recipiente con asa',1,{solution:{acceptedAnswers:['TAZA']}}),
  ]),
  rosco: questionnaire('Rosco de vocabulario', [
    q('r1','text','Vivienda',1,{solution:{acceptedAnswers:['CASA']}}),
    q('r2','text','Animal doméstico que ladra',1,{solution:{acceptedAnswers:['PERRO']}}),
    q('r3','text','Mueble para comer o trabajar',1,{solution:{acceptedAnswers:['MESA']}}),
    q('r4','text','Satélite natural de la Tierra',1,{solution:{acceptedAnswers:['LUNA']}}),
    q('r5','text','Felino doméstico',1,{solution:{acceptedAnswers:['GATO']}}),
    q('r6','text','Embarcación pequeña',1,{solution:{acceptedAnswers:['BARCO']}}),
  ]),
  threeD: questionnaire('Laboratorio 3D', [
    q('orden3d','ordering','Ordena las fases del ciclo del agua',3,{
      items:[{id:'evaporacion',text:'Evaporación'},{id:'condensacion',text:'Condensación'},{id:'precipitacion',text:'Precipitación'}],
      solution:{order:['evaporacion','condensacion','precipitacion']},
    }),
    q('match3d','matching','Relaciona cada estado con su descripción',3,{
      left:[{id:'solido',text:'Sólido'},{id:'liquido',text:'Líquido'},{id:'gas',text:'Gas'}],
      right:[{id:'forma',text:'Forma propia'},{id:'recipiente',text:'Adopta el recipiente'},{id:'expande',text:'Se expande'}],
      solution:{pairs:[{left:'solido',right:'forma'},{left:'liquido',right:'recipiente'},{left:'gas',right:'expande'}]},
    }),
    q('class3d','classification','Clasifica los seres vivos',4,{
      items:[{id:'perro',text:'Perro'},{id:'roble',text:'Roble'},{id:'gato',text:'Gato'},{id:'pino',text:'Pino'}],
      categories:[{id:'animal',text:'Animal'},{id:'planta',text:'Planta'}],
      solution:{assignments:[{item:'perro',category:'animal'},{item:'gato',category:'animal'},{item:'roble',category:'planta'},{item:'pino',category:'planta'}]},
    }),
  ]),
};

const specs = [
  {slug:'standard', title:'Questionnaire estándar', renderer:STANDARD_QUESTIONNAIRE_RENDERER, payload:payloads.standard},
  {slug:'memory', title:'Memoria', renderer:MEMORY_RENDERER, payload:payloads.pairs},
  {slug:'matching', title:'Emparejar', renderer:MATCHING_RENDERER, payload:payloads.pairs},
  {slug:'ordering', title:'Ordenar', renderer:ORDERING_RENDERER, payload:payloads.ordering},
  {slug:'classification', title:'Clasificar', renderer:CLASSIFICATION_RENDERER, payload:payloads.classification},
  {slug:'true-false', title:'Verdadero/Falso', renderer:TRUE_FALSE_RENDERER, payload:payloads.trueFalse},
  {slug:'word-search', title:'Sopa de letras', renderer:WORD_SEARCH_RENDERER, payload:payloads.words},
  {slug:'crossword', title:'Crucigrama', renderer:CROSSWORD_RENDERER, payload:payloads.crossword},
  {slug:'rosco', title:'Rosco', renderer:ROSCO_RENDERER, payload:payloads.rosco},
  {slug:'3d', title:'3D ordenar/relacionar/clasificar', renderer:THREE_D_RENDERER, payload:payloads.threeD},
];

async function verifyOuter(bytes) {
  return openP2LRNPackageBytes(toArrayBuffer(bytes));
}

async function buildQuestionnairePackage(dir, spec) {
  validateQuestionnaire(spec.payload);
  if (spec.renderer !== STANDARD_QUESTIONNAIRE_RENDERER) {
    const game = buildQuestionnaireGame(spec.payload, spec.renderer, {seedSource:'p2lrn-docs'});
    if (!game.compatible) throw new Error(spec.slug + ' example is not compatible: ' + game.reasons.join('; '));
  }
  const payloadBytes = pretty(spec.payload);
  const payloadPath = 'assets/questionnaires/' + spec.slug + '.json';
  const course = 'urn:p2lrn:docs:' + spec.slug + ':course';
  const activity = 'urn:p2lrn:docs:' + spec.slug + ':activity';
  const resource = 'urn:p2lrn:docs:' + spec.slug + ':resource';
  const representation = 'urn:p2lrn:docs:' + spec.slug + ':representation';
  const graph = {
    graphVersion: FORMAT_VERSION,
    entities: [
      {id:course,type:'course',revision:1,title:{es:spec.title},languages:['es'],children:[activity]},
      {id:activity,type:'activity',activityType:'https://p2lrn.org/type/questionnaire',title:{es:spec.title},resource,
        extensions:{[RENDERER_HINT_EXTENSION]:{preferred:spec.renderer,version:'1',required:true}}},
      {id:resource,type:'resource',title:{es:spec.title},representations:[
        {id:representation,role:'primary',profile:NATIVE_QUESTIONNAIRE_PROFILE,mediaType:NATIVE_QUESTIONNAIRE_MEDIA_TYPE,
          location:{type:'embedded',path:payloadPath}},
      ]},
    ],
    relations: [],
  };
  const graphBytes = pretty(graph);
  const manifest = {
    format:'P2LRN',
    formatVersion:FORMAT_VERSION,
    packageId:'urn:p2lrn:docs:' + spec.slug + ':package',
    entrypoints:[{id:course,type:'course',role:'primary'}],
    graph:{
      path:'content/graph.json',
      schema:'https://p2lrn.org/schema/graph/0.4.0',
      mediaType:'application/json',
      size:graphBytes.byteLength,
      byteDigest:sha256(graphBytes),
      contentDigest:contentDigest(graphBytes,'application/json','content/graph.json'),
    },
    profiles:[
      {id:COURSE_PROFILE,version:FORMAT_VERSION,requirement:'required'},
      {id:NATIVE_QUESTIONNAIRE_PROFILE,version:FORMAT_VERSION,requirement:'required'},
    ],
    files:[descriptor(payloadPath,payloadBytes,NATIVE_QUESTIONNAIRE_MEDIA_TYPE)],
    integrity:{algorithm:'sha256',contentRoot:'sha256:' + '0'.repeat(64)},
  };
  manifest.integrity.contentRoot = computeContentRoot(manifest);
  const bytes = writeZip([
    {path:'META-INF/manifest.json',data:pretty(manifest),mediaType:'application/json',method:8},
    {path:'content/graph.json',data:graphBytes,mediaType:'application/json',method:8},
    {path:payloadPath,data:payloadBytes,mediaType:NATIVE_QUESTIONNAIRE_MEDIA_TYPE,method:8},
  ]);
  await verifyOuter(bytes);
  const file = 'questionnaire-' + spec.slug + '.p2lrn';
  await writeFile(join(dir,file),bytes);
  return {
    title:spec.title,
    category:'generated-questionnaire',
    url:'/examples/generated/' + file,
    source:'deploy/netlify/build-doc-examples.mjs',
    rendererId:spec.renderer,
    profiles:[COURSE_PROFILE,NATIVE_QUESTIONNAIRE_PROFILE],
  };
}

async function buildMultipartExample(outputRoot) {
  const dir = join(outputRoot,'multipart-demo');
  await rm(dir,{recursive:true,force:true});
  await mkdir(dir,{recursive:true});
  const line = 'P2LRN multipart documentation fixture · contenido verificable y reconstruible.\n';
  const targetSize = 3 * 1024 * 1024 + 123;
  const lineBytes = enc.encode(line);
  const logical = enc.encode(line.repeat(Math.ceil(targetSize / lineBytes.byteLength) + 1)).slice(0,targetSize);
  const partSize = 1024 * 1024;
  const parts = [];
  const partBytes = new Map();
  for (let offset=0,index=0; offset<logical.byteLength; offset+=partSize,index+=1) {
    const bytes = logical.slice(offset,Math.min(logical.byteLength,offset+partSize));
    const href = 'course.part' + String(index+1).padStart(3,'0');
    parts.push({href,size:bytes.byteLength,byteDigest:sha256(bytes)});
    partBytes.set(href,bytes);
    await writeFile(join(dir,href),bytes);
  }
  const multipart = {version:'1',mediaType:'text/plain',size:logical.byteLength,byteDigest:sha256(logical),parts};
  const multipartBytes = pretty(multipart);
  const multipartPath = 'multipart/docs-large-text.json';
  const course='urn:p2lrn:docs:multipart:course';
  const activity='urn:p2lrn:docs:multipart:activity';
  const resource='urn:p2lrn:docs:multipart:resource';
  const representation='urn:p2lrn:docs:multipart:representation';
  const graph = {
    graphVersion:FORMAT_VERSION,
    entities:[
      {id:course,type:'course',revision:1,title:{es:'Ejemplo Multipart ejecutable'},languages:['es'],children:[activity]},
      {id:activity,type:'activity',activityType:'https://p2lrn.org/type/resource',title:{es:'Texto grande dividido'},resource},
      {id:resource,type:'resource',representations:[
        {id:representation,role:'primary',mediaType:'text/plain',location:{type:'embedded',path:multipartPath},
          extensions:{[MULTIPART_PROFILE]:{version:'1'}}},
      ]},
    ],
    relations:[],
  };
  const graphBytes = pretty(graph);
  const manifest = {
    format:'P2LRN',
    formatVersion:FORMAT_VERSION,
    packageId:'urn:p2lrn:docs:multipart:package',
    entrypoints:[{id:course,type:'course',role:'primary'}],
    graph:{
      path:'content/graph.json',
      schema:'https://p2lrn.org/schema/graph/0.4.0',
      mediaType:'application/json',
      size:graphBytes.byteLength,
      byteDigest:sha256(graphBytes),
      contentDigest:contentDigest(graphBytes,'application/json','content/graph.json'),
    },
    profiles:[
      {id:COURSE_PROFILE,version:FORMAT_VERSION,requirement:'required'},
      {id:MULTIPART_PROFILE,version:FORMAT_VERSION,requirement:'required'},
    ],
    files:[descriptor(multipartPath,multipartBytes,MULTIPART_MEDIA_TYPE)],
    integrity:{algorithm:'sha256',contentRoot:'sha256:' + '0'.repeat(64)},
  };
  manifest.integrity.contentRoot = computeContentRoot(manifest);
  const outer = writeZip([
    {path:'META-INF/manifest.json',data:pretty(manifest),mediaType:'application/json',method:8},
    {path:'content/graph.json',data:graphBytes,mediaType:'application/json',method:8},
    {path:multipartPath,data:multipartBytes,mediaType:MULTIPART_MEDIA_TYPE,method:8},
  ]);
  const opened = await verifyOuter(outer);
  const rep = opened.entities.get(resource).representations[0];
  const runtimePkg = {sourceUrl:'https://docs.example.invalid/examples/multipart-demo/course.p2lrn',payload:opened.payload};
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const name = new URL(String(url)).pathname.split('/').at(-1);
    const bytes = partBytes.get(name);
    return bytes
      ? new Response(bytes,{status:200,headers:{'content-length':String(bytes.byteLength)}})
      : new Response('not found',{status:404});
  };
  try {
    const payload = await createMultipartPayload(runtimePkg,rep);
    const rebuilt = await payload.read();
    if (rebuilt.byteLength !== logical.byteLength || sha256(rebuilt) !== sha256(logical)) {
      throw new Error('multipart documentation fixture did not reconstruct exactly');
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
  await writeFile(join(dir,'course.p2lrn'),outer);
  await writeFile(join(dir,'metadata.json'),JSON.stringify({
    schema:'p2lrn-docs-multipart-example/1',
    logicalBytes:logical.byteLength,
    logicalDigest:sha256(logical),
    partSize,
    parts,
    outerBytes:outer.byteLength,
    package:'/examples/multipart-demo/course.p2lrn',
  },null,2)+'\n');
  return {
    title:'Multipart ejecutable',
    category:'generated-multipart',
    url:'/examples/multipart-demo/course.p2lrn',
    source:'deploy/netlify/build-doc-examples.mjs',
    rendererId:null,
    profiles:[COURSE_PROFILE,MULTIPART_PROFILE],
  };
}


async function buildExternalRuntimeDemos(dir) {
  const fixtureRoot = join(process.cwd(),'deploy','netlify','fixtures');

  async function buildOne({slug,title,fixture,files}) {
    const source = join(dir,slug + '.zip');
    const output = join(dir,slug + '.p2lrn');
    const zipEntries = [];
    for (const [name,mediaType] of files) {
      const data = new Uint8Array(await readFile(join(fixtureRoot,fixture,name)));
      zipEntries.push({path:name,data,mediaType,method:8});
    }
    await writeFile(source,writeZip(zipEntries));
    const report = convertExternalPackage(source,output);
    await rm(source,{force:true});
    await verifyOuter(new Uint8Array(await readFile(output)));
    return {
      title,
      category:'generated-external',
      url:'/examples/generated/' + slug + '.p2lrn',
      source:'deploy/netlify/fixtures/' + fixture,
      rendererId:null,
      profiles:[COURSE_PROFILE,report.profile],
    };
  }

  return [
    await buildOne({
      slug:'scorm12-browser-demo',
      title:'SCORM 1.2 · demo interactiva',
      fixture:'scorm12-demo',
      files:[['imsmanifest.xml','application/xml'],['index.html','text/html']],
    }),
    await buildOne({
      slug:'qti3-interactive-demo',
      title:'QTI 3 · demo interactiva',
      fixture:'qti3-demo',
      files:[['imsmanifest.xml','application/xml'],['item.xml','application/xml']],
    }),
  ];
}

export async function buildDocExamples({outputRoot}) {
  const generated = join(outputRoot,'generated');
  await rm(generated,{recursive:true,force:true});
  await mkdir(generated,{recursive:true});
  const entries = [];
  for (const spec of specs) entries.push(await buildQuestionnairePackage(generated,spec));
  entries.push(...await buildExternalRuntimeDemos(generated));
  entries.push(await buildMultipartExample(outputRoot));
  return entries;
}
