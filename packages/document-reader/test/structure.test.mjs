import test from 'node:test';
import assert from 'node:assert/strict';
import {finalizeCanonicalDocument,resolveDocumentOutline} from '../dist/index.js';

function doc(blocks,metadata={title:'Curso de prueba'}){
  return finalizeCanonicalDocument({
    source:{name:'jerarquia.docx',bytes:new Uint8Array([1])},format:'DOCX',strategy:'DOCX_XML',metadata,
    blocks:blocks.map((b,i)=>({id:b.id,type:b.type??'TITLE',text:b.text,order:i+1,level:b.level,source:{format:'DOCX',raw:{}}}))
  });
}
const h=(id,text,level)=>({id,text,level,type:'TITLE'});
const p=(id,text)=>({id,text,type:'PARAGRAPH'});

test('A -> A.A -> A.A.A resolves as module -> lesson -> content',()=>{
  const outline=resolveDocumentOutline(doc([
    h('a','A Fundamentos',1),h('aa','A.A Introducción',2),h('aaa','A.A.A Conceptos básicos',3),p('p1','Contenido real.'),
    h('ab','A.B Arquitectura',2),h('aba','A.B.A Componentes',3),p('p2','Más contenido.'),
    h('b','B Datos',1),h('ba','B.A Modelo lógico',2),h('baa','B.A.A Entidades',3)
  ]));
  assert.deepEqual(outline.modules.map(x=>x.title),['A Fundamentos','B Datos']);
  assert.deepEqual(outline.modules[0].lessons.map(x=>x.title),['A.A Introducción','A.B Arquitectura']);
  assert.equal(outline.modules[0].lessons[0].content[0].title,'A.A.A Conceptos básicos');
});

test('decimal numbering uses the same three-level hierarchy',()=>{
  const outline=resolveDocumentOutline(doc([
    h('m1','1 Diseño',1),h('l11','1.1 Enfoques',2),h('b111','1.1.1 Diseño descendente',3),
    h('l12','1.2 Metodología',2),h('m2','2 Implementación',1),h('l21','2.1 Modelo físico',2)
  ]));
  assert.deepEqual(outline.modules.map(x=>x.title),['1 Diseño','2 Implementación']);
  assert.deepEqual(outline.modules[0].lessons.map(x=>x.title),['1.1 Enfoques','1.2 Metodología']);
});

test('native heading levels do not invent a course node',()=>{
  const outline=resolveDocumentOutline(doc([
    h('h1','Arquitectura',1),h('h2','Procesadores',2),h('h3','Canalización',3),p('p','Contenido.')
  ],{title:'Curso profesional de Rust'}));
  assert.equal(outline.title,'Curso profesional de Rust');
  assert.equal(outline.modules.length,1);
  assert.equal(outline.modules[0].title,'Arquitectura');
  assert.equal(outline.modules[0].lessons[0].title,'Procesadores');
  assert.equal(outline.modules[0].lessons[0].content[0].title,'Canalización');
});

test('numbered quiz paragraphs do not become modules or lessons',()=>{
  const outline=resolveDocumentOutline(doc([
    h('m','Módulo A',1),h('l','A.A Contenido real',2),h('qz','Cuestionario del módulo A',2),
    p('q1','1. ¿Qué representa una relación?'),p('q2','2. Explica la integridad referencial.')
  ]));
  assert.equal(outline.modules.length,1);
  assert.deepEqual(outline.modules[0].lessons.filter(x=>!x.inferred).map(x=>x.title),['A.A Contenido real']);
});

test('explicit QUESTION blocks remain semantically separate even when there is one',()=>{
  const outline=resolveDocumentOutline(doc([
    h('m','1 Módulo',1),h('l','1.1 Lección',2),{id:'q',type:'QUESTION',text:'¿Pregunta única?'}
  ]));
  const item=outline.modules[0].lessons[0].content.find(x=>x.sourceBlockId==='q');
  assert.equal(item?.kind,'QUESTION');
});
