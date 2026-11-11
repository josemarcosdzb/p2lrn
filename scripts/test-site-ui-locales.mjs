import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {studioLanguage,studioUiText,studioNewDefaults,STUDIO_UI_TRANSLATION_COUNT} from '../packages/toolkit/web/studio/studio-ui-i18n.js';
import {analyticsUiText,ANALYTICS_UI_TRANSLATION_COUNT} from '../packages/analytics/src/locale.js';

const en={documentElement:{lang:'en'}},es={documentElement:{lang:'es'}};

test('Studio keeps Spanish intact and renders reviewed UI in English',()=>{
  assert.equal(studioLanguage(es),'es');
  assert.equal(studioLanguage(en),'en');
  assert.equal(studioUiText('El cuestionario necesita al menos una pregunta',es),'El cuestionario necesita al menos una pregunta');
  assert.equal(studioUiText('Cuestionario',en),'Questionnaire');
  assert.equal(studioUiText('Pregunta 2',en),'Question 2');
  assert.equal(studioUiText('Afirmación 3',en),'Statement 3');
  assert.equal(studioUiText('Opción 4',en),'Option 4');
  assert.equal(studioUiText('Pareja B',en),'Pair B');
  assert.equal(studioUiText('2 cambios',en),'2 changes');
  assert.equal(studioUiText('1 cambio',en),'1 change');
  assert.equal(studioUiText('JSON avanzado no válido: unexpected end',en),'Invalid advanced JSON: unexpected end');
  assert.ok(STUDIO_UI_TRANSLATION_COUNT>=230);
});
test('Studio creates localized defaults without rewriting learner-authored strings',()=>{
  const raw={type:'fill-blanks',prompt:'Completa los huecos',body:'Escribe aquí el texto y selecciona la palabra que quieras ocultar. {{q1}}',solution:{answers:{q1:['Respuesta']}},userInput:'Mi curso privado'};
  const localized=studioNewDefaults(raw,en);
  assert.equal(localized.prompt,'Fill in the blanks');
  assert.equal(localized.body,'Write the text here and select the word you want to hide. {{q1}}');
  assert.deepEqual(localized.solution.answers.q1,['Answer']);
  assert.equal(localized.userInput,'Mi curso privado');
  assert.deepEqual(studioNewDefaults(raw,es),raw);
  assert.equal(raw.prompt,'Completa los huecos');
});
test('Analytics keeps Spanish locale and correctly translates interactive UI',()=>{
  assert.equal(analyticsUiText('Resumen','es-ES'),'Resumen');
  assert.equal(analyticsUiText('Resumen','en-US'),'Overview');
  assert.equal(analyticsUiText('Mostrando 1–10 de 40','en-US'),'Showing 1–10 of 40');
  assert.equal(analyticsUiText('Página 2 / 4','en-US'),'Page 2 / 4');
  assert.equal(analyticsUiText('3 activos (30 días)','en-US'),'3 active (30 days)');
  assert.equal(analyticsUiText('Mis matemáticas','en-US'),'Mis matemáticas');
  assert.ok(ANALYTICS_UI_TRANSLATION_COUNT>=110);
});
test('English runtime has stable absolute Studio imports, no extra private runtime tree',async()=>{
  const [esJs,enJs,demoJs,studio]=await Promise.all([
    readFile('deploy/netlify/site/p2lrn.js','utf8'),
    readFile('deploy/netlify/site/en/p2lrn.js','utf8'),
    readFile('deploy/netlify/site/en/demo/viewer.js','utf8'),
    readFile('deploy/netlify/site/en/studio/studio.js','utf8')
  ]);
  assert.match(esJs,/const siteHref=/);
  assert.match(enJs,/const siteHref=/);
  assert.match(enJs,/pathname\.endsWith\(['"]\/['"]\)/);
  assert.match(enJs,/siteHref\(entry\.href\)/);
  assert.doesNotMatch(enJs,/pathname\.endsWith\(['"]\/en\/['"]\)/);
  assert.doesNotMatch(demoJs,/Introduce una URL de paquete|CARGANDO|MOSTRANDO/);
  assert.match(studio,/from ['"]\/studio\/runtime\/studio-ui-i18n\.js['"]/);
  assert.doesNotMatch(studio,/from ['"]\.\/runtime\//);
  const esStudio=await readFile('deploy/netlify/site/studio/studio.js','utf8');
  assert.match(esStudio,/mountStudioCommandBar\(/,'Spanish Studio must mount the shared toolbar');
  assert.match(studio,/mountStudioCommandBar\(/,'English Studio must mount the shared toolbar');
  assert.match(esStudio,/samePageInsertionParent\(/,'Spanish Studio must support same-page insertion');
  assert.match(studio,/samePageInsertionParent\(/,'English Studio must support same-page insertion');
  assert.match(studio,/assembly-3d/,'English Studio must expose 3D assembly');
});

test('reviewed glossary distinguishes educational semantics',async()=>{
  const terms=JSON.parse(await readFile('scripts/site-en-translations.json','utf8'));
  const errors=[];
  for(const [spanish,english] of Object.entries(terms)){
    if(/intentos?/i.test(spanish)&&/\bintents?\b/i.test(english))errors.push('attempt: '+spanish);
    if(/calificaci[oó]n/i.test(spanish)&&/\bratings?\b/i.test(english))errors.push('grade: '+spanish);
    if(/nota oficial/i.test(spanish)&&/\bofficial note\b/i.test(english))errors.push('official grade: '+spanish);
    if(/clasificaci[oó]n/i.test(spanish)&&/\brating question\b/i.test(english))errors.push('classification: '+spanish);
    if(/permisos/i.test(spanish)&&/\bpermits?\b/i.test(english))errors.push('permissions: '+spanish);
  }
  assert.deepEqual(errors,[],'Unreviewed false-friend translation in the English site');
  assert.equal(terms['apuntando a'],'pointing to');
});
