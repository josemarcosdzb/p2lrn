import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BasicDocumentFormatDetector,
  CANONICAL_DOCUMENT_SCHEMA,
  CANONICAL_DOCUMENT_VERSION,
  DefaultP2LRNDocumentReader,
  DocumentExtractorRegistry,
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
