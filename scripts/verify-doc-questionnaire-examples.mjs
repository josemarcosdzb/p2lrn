import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=resolve(process.cwd());
const docs=resolve(root,'deploy','netlify','site','docs','questionnaires');
const developerReference=await readFile(resolve(root,'deploy','netlify','site','docs','desarrolladores','actividades','index.html'),'utf8');
const core=await import(pathToFileURL(resolve(root,'packages','toolkit','web','questionnaire-core.js')).href);
const games=await import(pathToFileURL(resolve(root,'packages','toolkit','web','questionnaire-games-core.js')).href);

const renderers={
  standard:'https://p2lrn.org/renderer/questionnaire/standard',
  memory:'https://p2lrn.org/renderer/questionnaire/memory',
  matching:'https://p2lrn.org/renderer/questionnaire/matching',
  ordering:'https://p2lrn.org/renderer/questionnaire/ordering',
  classification:'https://p2lrn.org/renderer/questionnaire/classification',
  'true-false':'https://p2lrn.org/renderer/questionnaire/true-false',
  'word-search':'https://p2lrn.org/renderer/questionnaire/word-search',
  crossword:'https://p2lrn.org/renderer/questionnaire/crossword',
  rosco:'https://p2lrn.org/renderer/questionnaire/rosco',
  '3d':'https://p2lrn.org/renderer/questionnaire/3d-order-match',
};

const decode=(value)=>value
  .replaceAll('&quot;','"')
  .replaceAll('&#39;',"'")
  .replaceAll('&lt;','<')
  .replaceAll('&gt;','>')
  .replaceAll('&amp;','&');

const failures=[];
for(const [name,rendererId] of Object.entries(renderers)){
  const html=await readFile(resolve(docs,name,'index.html'),'utf8');
  const headings=[...html.matchAll(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/giu)]
    .map(match=>match[1].replace(/<[^>]+>/g,'').trim());
  // Teacher documentation: assess actual Studio + learner workflow, screenshots,
  // controls, accessibility and export. Don't put implementation JSON back here.
  for(const needle of ['Studio','Vista alumno','Interacción y accesibilidad',
    'Finalización y puntuación','Prueba del archivo exportado','Configuración del ejercicio']){
    if(!html.includes(needle))failures.push(name+': teacher guide missing '+needle);
  }
  if(!headings.some(x=>x==='Referencia para desarrolladores'))
    failures.push(name+': teacher guide missing separate technical reference');
  if(!html.includes('href="/docs/desarrolladores/actividades/#'+name+'"'))
    failures.push(name+': teacher guide does not link to its own developer reference');
  if(html.includes('<span>quiz.json</span>')||html.includes('p2lrn-create add-questionnaire'))
    failures.push(name+': teacher guide leaks implementation details');
  const images=[...html.matchAll(/<img\b[^>]*>/giu)].map(x=>x[0]);
  if(images.length<2)failures.push(name+': missing editor and learner screenshots');
  for(const tag of images){
    if(!/\balt="[^"]+"/iu.test(tag))failures.push(name+': screenshot missing descriptive alt');
    if(!/\bwidth="\d+"/iu.test(tag)||!/\bheight="\d+"/iu.test(tag))
      failures.push(name+': screenshot missing stable dimensions');
  }

  // Developer reference retains executable JSON/CLI examples for each
  // renderer. Extract the actual section instead of checking the teacher page.
  const startMarker='<section class="doc-section" id="'+name+'">';
  const start=developerReference.indexOf(startMarker);
  if(start<0){failures.push(name+': developer reference section missing');continue;}
  const next=developerReference.indexOf('<section class="doc-section" id="',start+startMarker.length);
  const dev=developerReference.slice(start,next<0?developerReference.length:next);
  const devHeading=['Requisitos del contenido','Ejemplo de datos válido',
    'Crear por CLI — alternativa avanzada','Identificador técnico de la presentación'];
  for(const heading of devHeading)if(!dev.includes(heading))
    failures.push(name+': developer reference missing '+heading);
  const dataIndex=dev.indexOf('Ejemplo de datos válido'),cliIndex=dev.indexOf('Crear por CLI');
  if(!(dataIndex>=0&&cliIndex>dataIndex))
    failures.push(name+': developer example must precede CLI instructions');
  const jsonBlock=/<div class="codebox">[\s\S]*?<span>quiz\.json<\/span>[\s\S]*?<pre><code>([\s\S]*?)<\/code><\/pre>/i.exec(dev)?.[1];
  if(!jsonBlock){failures.push(name+': developer reference missing quiz.json code block');continue;}
  let payload;
  try{payload=JSON.parse(decode(jsonBlock));}
  catch(error){failures.push(name+': developer quiz.json invalid JSON: '+error.message);continue;}
  try{core.validateQuestionnaire(payload);}
  catch(error){failures.push(name+': documented questionnaire invalid: '+error.message);continue;}
  if(name!=='standard'){
    try{
      const built=games.buildQuestionnaireGame(payload,rendererId);
      if(!built.compatible)failures.push(name+': example incompatible: '+(built.reasons??[]).join('; '));
    }catch(error){failures.push(name+': example compatibility failure: '+error.message);}
  }
  if(!dev.includes('--renderer "'+rendererId+'"'))
    failures.push(name+': CLI example has incorrect renderer id');
  for(const forbidden of ['--renderizador','/renderizador/','Modelo mínimo'])
    if(dev.includes(forbidden))failures.push(name+': stale technical term '+forbidden);
}
if(failures.length)throw new Error('Questionnaire teacher/developer documentation audit failed:\n'+failures.join('\n'));
console.log(JSON.stringify({ok:true,pages:Object.keys(renderers).length,teacherGuides:true,developerExamplesValid:true,runtimeCompatible:true,developerReferencesSeparate:true,technicalIdsExact:true},null,2));
