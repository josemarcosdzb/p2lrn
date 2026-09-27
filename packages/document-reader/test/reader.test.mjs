import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BasicDocumentFormatDetector,
  CANONICAL_DOCUMENT_SCHEMA,
  CANONICAL_DOCUMENT_VERSION,
  DefaultP2LRNDocumentReader,
  DocumentExtractorRegistry,
  createDefaultDocumentExtractorRegistry,
  DOCUMENT_INVENTORY_SCHEMA,
  DOCUMENT_PROVENANCE_SCHEMA,
} from '../dist/index.js';

test('basic detector recognizes common authoring files without platform knowledge',()=>{
  const detector=new BasicDocumentFormatDetector();
  assert.equal(detector.detect({name:'curso.docx',bytes:new Uint8Array()}).format,'DOCX');
  assert.equal(detector.detect({name:'presentacion.pptx',bytes:new Uint8Array()}).format,'PPTX');
  assert.equal(detector.detect({name:'libro.epub',bytes:new Uint8Array()}).format,'EPUB');
  assert.equal(detector.detect({name:'desconocido.bin',bytes:new Uint8Array()}).format,'UNKNOWN');
});

test('reader dispatches through neutral extractor registry',async()=>{
  const registry=new DocumentExtractorRegistry();
  registry.register({
    id:'fixture-docx',
    formats:['DOCX'],
    async extract(input,detection){
      return{
        document:{
          schema:CANONICAL_DOCUMENT_SCHEMA,
          version:CANONICAL_DOCUMENT_VERSION,
          source:{name:input.name,format:detection.format,strategy:'DOCX_XML'},
          metadata:{title:'Fixture'},
          blocks:[{id:'b1',type:'PARAGRAPH',text:'Hola',order:1}],
          tables:[],
          sequence:{nodes:[{id:'b1',type:'PARAGRAPH',order:1,text:'Hola',provenance:{engine:'NATIVE'}}]},
          provenance:{schema:DOCUMENT_PROVENANCE_SCHEMA,authoritativeEngine:'NATIVE'},
          inventory:{schema:DOCUMENT_INVENTORY_SCHEMA,documentId:'doc-1',documentHash:'sha256:fixture',totalBlocks:1,totalTables:0,totalCharacters:4,nodes:[],tables:[]},
          warnings:[],
        },
        assets:[],
      };
    }
  });
  const reader=new DefaultP2LRNDocumentReader({registry});
  const result=await reader.read({name:'curso.docx',bytes:new Uint8Array([1,2,3])});
  assert.equal(result.document.source.format,'DOCX');
  assert.equal(result.document.blocks[0].text,'Hola');
});

test('reader rejects formats without registered extractor',async()=>{
  const reader=new DefaultP2LRNDocumentReader();
  await assert.rejects(()=>reader.read({name:'curso.docx',bytes:new Uint8Array([1])}),/No document extractor registered for DOCX/);
});


test('plain text groups wrapped lines into paragraphs instead of one-line-per-block',async()=>{
  const reader=new DefaultP2LRNDocumentReader({registry:createDefaultDocumentExtractorRegistry()});
  const text='Primera línea del mismo párrafo\ncontinúa aquí.\n\nSegundo párrafo.\n';
  const result=await reader.read({name:'curso.txt',bytes:new TextEncoder().encode(text)});
  assert.equal(result.document.blocks.length,2);
  assert.equal(result.document.blocks[0].text,'Primera línea del mismo párrafo continúa aquí.');
  assert.equal(result.document.blocks[1].text,'Segundo párrafo.');
  assert.equal(result.document.sequence.nodes.length,2);
  assert.match(result.document.inventory.documentHash,/^[0-9a-f]{64}$/);
});

test('Markdown preserves hierarchy, lists, tables and code without inventing course semantics',async()=>{
  const reader=new DefaultP2LRNDocumentReader({registry:createDefaultDocumentExtractorRegistry()});
  const markdown=[
    '# Módulo 1',
    '',
    'Texto que ocupa',
    'dos líneas del mismo párrafo.',
    '',
    '## Lección 1.1',
    '',
    '- Elemento uno',
    '- Elemento dos',
    '',
    '| Columna | Valor |',
    '| --- | --- |',
    '| A | 1 |',
    '| B | 2 |',
    '',
    '~~~js',
    'const answer = 42;',
    '~~~',
  ].join('\n');
  const result=await reader.read({name:'curso.md',bytes:new TextEncoder().encode(markdown)});
  const blocks=result.document.blocks;
  assert.equal(blocks.find(x=>x.type==='TITLE'&&x.level===1)?.text,'Módulo 1');
  assert.equal(blocks.find(x=>x.type==='TITLE'&&x.level===2)?.text,'Lección 1.1');
  assert.ok(blocks.some(x=>x.type==='PARAGRAPH'&&x.text==='Texto que ocupa dos líneas del mismo párrafo.'));
  assert.equal(blocks.filter(x=>x.type==='LIST').length,2);
  assert.equal(result.document.tables.length,1);
  assert.deepEqual(result.document.tables[0].columns,['Columna','Valor']);
  assert.equal(result.document.tables[0].rows[1].Valor,'2');
  assert.ok(blocks.some(x=>x.source?.raw?.role==='CODE_BLOCK'&&x.text==='const answer = 42;'));
  assert.equal(result.document.metadata.title,'Módulo 1');
});
