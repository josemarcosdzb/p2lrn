import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DefaultP2LRNDocumentReader,
  detectedQuestionToNative,
  resolveDocumentOutline,
  splitLessonAuthoringSegments,
} from '../dist/index.js';

const reader=new DefaultP2LRNDocumentReader();

async function outlineFromTxt(text){
  const result=await reader.read({name:'curso.txt',bytes:new TextEncoder().encode(text)});
  return{result,outline:resolveDocumentOutline(result.document)};
}

test('explicit numbered question, options and answer become a native single-choice candidate in source order',async()=>{
  const {result,outline}=await outlineFromTxt([
    '1 Módulo',
    '',
    '1.1 Lección',
    '',
    'Contenido antes.',
    '',
    '1. ¿Qué componente ejecuta instrucciones?',
    '',
    'A) CPU',
    '',
    'B) RAM',
    '',
    'Respuesta: A',
    '',
    'Contenido después.',
  ].join('\n'));
  const blocks=result.document.blocks;
  assert.equal(blocks.find(x=>x.text.includes('Qué componente'))?.type,'QUESTION');
  assert.deepEqual(blocks.filter(x=>x.type==='OPTION').map(x=>x.text),['A) CPU','B) RAM']);
  assert.deepEqual(blocks.filter(x=>x.type==='OPTION').map(x=>x.source?.raw?.semanticText),['CPU','RAM']);
  assert.equal(blocks.find(x=>x.type==='SOLUTION')?.text,'Respuesta: A');
  assert.equal(blocks.find(x=>x.type==='SOLUTION')?.source?.raw?.semanticText,'A');
  for(const block of blocks){
    const inventory=result.document.inventory.nodes.find(x=>x.sourceBlockId===block.id);
    if(!inventory)continue;
    assert.match(inventory.contentHash,/^[0-9a-f]{64}$/);
  }

  const lesson=outline.modules[0].lessons[0];
  const segments=splitLessonAuthoringSegments(result.document,lesson);
  assert.deepEqual(segments.map(x=>x.kind),['content','question','content']);
  const question=segments[1].question;
  assert.equal(question.prompt,'¿Qué componente ejecuta instrucciones?');
  assert.deepEqual(question.options.map(x=>[x.label,x.text]),[['A','CPU'],['B','RAM']]);
  const native=detectedQuestionToNative(question);
  assert.equal(native.grading,'embedded-key');
  assert.equal(native.question.type,'single-choice');
  assert.deepEqual(native.question.solution.choiceIds,['c1']);
});

test('standalone explicit question with written solution remains semantic even outside a quiz heading',async()=>{
  const {result,outline}=await outlineFromTxt([
    '1 Módulo',
    '',
    '1.1 Lección',
    '',
    '¿Cuál es la capital de España?',
    '',
    'Solución: Madrid',
  ].join('\n'));
  const lesson=outline.modules[0].lessons[0];
  const segment=splitLessonAuthoringSegments(result.document,lesson).find(x=>x.kind==='question');
  assert.ok(segment);
  const native=detectedQuestionToNative(segment.question);
  assert.equal(native.grading,'embedded-key');
  assert.equal(native.question.type,'text');
  assert.deepEqual(native.question.solution.acceptedAnswers,['Madrid']);
});

test('question without an unambiguous solution is host-graded instead of inventing an answer',async()=>{
  const {result,outline}=await outlineFromTxt([
    '1 Módulo',
    '',
    '1.1 Lección',
    '',
    'Pregunta 1: Selecciona una arquitectura',
    '',
    'A) Cliente-servidor',
    '',
    'B) P2P',
  ].join('\n'));
  const segment=splitLessonAuthoringSegments(result.document,outline.modules[0].lessons[0]).find(x=>x.kind==='question');
  assert.ok(segment);
  const native=detectedQuestionToNative(segment.question);
  assert.equal(native.grading,'host');
  assert.equal(native.question.type,'single-choice');
  assert.equal('solution' in native.question,false);
});

test('multiple explicit answer labels produce multiple-choice rather than collapsing to one answer',async()=>{
  const {result,outline}=await outlineFromTxt([
    '1 Módulo','','1.1 Lección','',
    '1. ¿Qué opciones son correctas?','','A) Uno','','B) Dos','','C) Tres','','Respuesta: A y C'
  ].join('\n'));
  const segment=splitLessonAuthoringSegments(result.document,outline.modules[0].lessons[0]).find(x=>x.kind==='question');
  const native=detectedQuestionToNative(segment.question);
  assert.equal(native.question.type,'multiple-choice');
  assert.deepEqual(native.question.solution.choiceIds,['c1','c3']);
});


test('TXT keeps wrapped prose together but splits consecutive quiz lines without blank separators',async()=>{
  const text=[
    'Módulo 1: Hardware',
    'Lección 1.1: CPU',
    'Este texto está envuelto',
    'en dos líneas del mismo párrafo.',
    'Cuestionario',
    '1. Explica qué componente ejecuta instrucciones',
    'A) CPU',
    'B) RAM',
    'Respuesta: A',
  ].join('\n');
  const result=await reader.read({name:'curso.txt',bytes:new TextEncoder().encode(text)});
  const outline=resolveDocumentOutline(result.document);
  assert.equal(outline.modules[0].title,'Módulo 1: Hardware');
  assert.equal(outline.modules[0].lessons[0].title,'Lección 1.1: CPU');
  assert.ok(result.document.blocks.some(x=>x.text==='Este texto está envuelto en dos líneas del mismo párrafo.'));
  const segments=splitLessonAuthoringSegments(result.document,outline.modules[0].lessons[0]);
  const question=segments.find(x=>x.kind==='question')?.question;
  assert.ok(question);
  assert.equal(question.prompt,'Explica qué componente ejecuta instrucciones');
  assert.deepEqual(question.options.map(x=>x.text),['CPU','RAM']);
  assert.equal(question.solution,'A');
});

test('Markdown quiz lines stay distinct without blank separators while ordinary ordered lists remain lists',async()=>{
  const text=[
    '# 1 Fundamentos',
    '## 1.1 Repaso',
    '### Cuestionario',
    '1. ¿Qué componente ejecuta instrucciones?',
    'A) CPU',
    'B) RAM',
    'Respuesta: A',
    '',
    '### Pasos',
    '1. Primer paso normal',
    '2. Segundo paso normal',
  ].join('\n');
  const result=await reader.read({name:'curso.md',bytes:new TextEncoder().encode(text)});
  const outline=resolveDocumentOutline(result.document);
  const lesson=outline.modules[0].lessons[0];
  const question=splitLessonAuthoringSegments(result.document,lesson).find(x=>x.kind==='question')?.question;
  assert.ok(question);
  assert.deepEqual(question.options.map(x=>x.text),['CPU','RAM']);
  assert.equal(question.solution,'A');
  assert.equal(result.document.blocks.filter(x=>x.type==='LIST').length,2);
});
