import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=resolve(process.cwd());
const docs=resolve(root,'deploy','netlify','site','docs','questionnaires');
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
  const headings=[...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map((m)=>m[1].replace(/<[^>]+>/g,'').trim());
  const required=['Qué hace y qué ve el alumno','Crear en Studio','Requisitos del contenido','Ejemplo de datos válido','Crear por CLI — alternativa avanzada','Identificador técnico de la presentación','Interacción y accesibilidad','Finalización y puntuación','Probar el ejemplo'];
  for(const heading of required)if(!headings.includes(heading))failures.push(name+': missing section '+heading);
  const studioIndex=html.indexOf('Crear en Studio');
  const dataIndex=html.indexOf('Ejemplo de datos válido');
  const cliIndex=html.indexOf('Crear por CLI');
  if(!(studioIndex>=0&&dataIndex>studioIndex&&cliIndex>dataIndex))failures.push(name+': visual authoring must precede data and CLI reference');

  const jsonBlock=/<div class="codebox">[\s\S]*?<span>quiz\.json<\/span>[\s\S]*?<pre><code>([\s\S]*?)<\/code><\/pre>/i.exec(html)?.[1];
  if(!jsonBlock){failures.push(name+': missing quiz.json code block');continue;}
  let payload;
  try{payload=JSON.parse(decode(jsonBlock));}
  catch(error){failures.push(name+': quiz.json is not valid JSON: '+error.message);continue;}
  try{core.validateQuestionnaire(payload);}
  catch(error){failures.push(name+': questionnaire validation failed: '+error.message);continue;}
  if(name!=='standard'){
    try{
      const built=games.buildQuestionnaireGame(payload,rendererId);
      if(!built.compatible)failures.push(name+': documented example is not compatible: '+(built.reasons??[]).join('; '));
    }catch(error){failures.push(name+': compatibility check failed: '+error.message);}
  }
  if(!html.includes('--renderer &quot;'+rendererId+'&quot;'))failures.push(name+': CLI example does not use the exact renderer id');
  if(html.includes('--renderizador')||html.includes('/renderizador/'))failures.push(name+': translated technical identifier remains');
  if(html.includes('Modelo mínimo'))failures.push(name+': vague minimum-example heading remains');
}
if(failures.length)throw new Error('Questionnaire documentation examples failed:\n'+failures.join('\n'));
console.log(JSON.stringify({ok:true,pages:Object.keys(renderers).length,examplesValid:true,runtimeCompatible:true,studioFirst:true,technicalIdsExact:true},null,2));
