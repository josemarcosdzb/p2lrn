import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir, readFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

import {writeZip} from '../dist/core/zip.js';
import {readDocument} from '../dist/document-reader/index.js';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const enc=new TextEncoder();

function zip(entries){
  return writeZip(entries.map(([path,text,mediaType='application/xml'])=>({
    path,
    data:typeof text==='string'?enc.encode(text):text,
    mediaType,
    method:mediaType.startsWith('image/')?0:8,
  })));
}

test('lightweight DOCX reader preserves text-image-text-table order without external services',async()=>{
  const image=new Uint8Array([137,80,78,71,13,10,26,10,1,2,3,4]);
  const bytes=zip([
    ['word/document.xml',`<?xml version="1.0"?>
<w:document xmlns:w="w" xmlns:r="r" xmlns:a="a" xmlns:wp="wp">
<w:body>
  <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Introducción</w:t></w:r></w:p>
  <w:p>
    <w:r><w:t>Antes de la imagen</w:t></w:r>
    <w:r><w:drawing><wp:inline><wp:extent cx="95250" cy="47625"/><a:blip r:embed="rId1"/></wp:inline></w:drawing></w:r>
    <w:r><w:t>¿Después de la imagen?</w:t></w:r>
  </w:p>
  <w:tbl>
    <w:tr><w:tc><w:p><w:r><w:t>Nombre</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Valor</w:t></w:r></w:p></w:tc></w:tr>
    <w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc></w:tr>
  </w:tbl>
</w:body></w:document>`],
    ['word/_rels/document.xml.rels',`<Relationships><Relationship Id="rId1" Type="image" Target="media/image1.png"/></Relationships>`],
    ['word/media/image1.png',image,'image/png'],
  ]);

  const doc=await readDocument({name:'sample.docx',bytes});
  assert.equal(doc.source.detectedType,'DOCX');
  assert.equal(doc.assets.length,1);
  assert.deepEqual([...doc.assets[0].bytes], [...image]);
  assert.deepEqual(
    doc.blocks.map(block=>[block.type,block.text]),
    [
      ['TITLE','Introducción'],
      ['PARAGRAPH','Antes de la imagen'],
      ['IMAGE','image1.png'],
      ['QUESTION','¿Después de la imagen?'],
      ['TABLE','Table 1'],
    ],
  );
  assert.equal(doc.blocks[2].position.width,10);
  assert.equal(doc.blocks[2].position.height,5);
  assert.equal(doc.tables[0].rows[0].Nombre,'A');
  assert.equal(doc.tables[0].rows[0].Valor,'1');
});

test('lightweight PPTX reader orders title image and text by slide coordinates',async()=>{
  const image=new Uint8Array([137,80,78,71,13,10,26,10,5,6,7,8]);
  const bytes=zip([
    ['ppt/presentation.xml',`<p:presentation xmlns:p="p"><p:sldSz cx="9144000" cy="6858000"/></p:presentation>`],
    ['ppt/slides/slide1.xml',`<p:sld xmlns:p="p" xmlns:a="a" xmlns:r="r"><p:cSld><p:spTree>
      <p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2000000" cy="400000"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t>Título</a:t></a:r></a:p></p:txBody></p:sp>
      <p:pic><p:blipFill><a:blip r:embed="rIdImg"/></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="952500"/><a:ext cx="952500" cy="476250"/></a:xfrm></p:spPr></p:pic>
      <p:sp><p:spPr><a:xfrm><a:off x="0" y="1905000"/><a:ext cx="3000000" cy="500000"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t>Texto inferior</a:t></a:r></a:p></p:txBody></p:sp>
    </p:spTree></p:cSld></p:sld>`],
    ['ppt/slides/_rels/slide1.xml.rels',`<Relationships><Relationship Id="rIdImg" Type="image" Target="../media/image1.png"/></Relationships>`],
    ['ppt/media/image1.png',image,'image/png'],
  ]);

  const doc=await readDocument({name:'slides.pptx',bytes});
  assert.equal(doc.source.detectedType,'PPTX');
  assert.deepEqual(
    doc.blocks.map(block=>[block.type,block.text]),
    [
      ['TITLE','Título'],
      ['IMAGE','image1.png'],
      ['PARAGRAPH','Texto inferior'],
    ],
  );
  assert.equal(doc.assets.length,1);
  assert.equal(doc.blocks[1].position.y,100);
  assert.equal(doc.blocks[1].position.width,100);
  assert.deepEqual(doc.metadata.sheets,['Slide 1']);
});

test('lightweight structured text reader identifies headings questions options and solutions',async()=>{
  const text=`# Evaluación

¿Qué es P2LRN?
A) Un formato de aprendizaje
B) Un navegador
Respuesta: Un formato de aprendizaje
`;
  const doc=await readDocument({name:'questions.md',bytes:enc.encode(text)});
  assert.deepEqual(doc.blocks.map(block=>block.type),['TITLE','QUESTION','OPTION','OPTION','SOLUTION']);
});

test('document-reader source has no OCR, Docling, NestJS or AulaP2P runtime dependencies',async()=>{
  const dir=join(root,'src','document-reader');
  const names=(await readdir(dir)).filter(name=>name.endsWith('.ts'));
  const combined=(await Promise.all(names.map(name=>readFile(join(dir,name),'utf8')))).join('\n').toLowerCase();
  for(const forbidden of ['@nestjs','docling','ingestion-assets','extractor-pdf-ocr','detector-necesidad-ocr']){
    assert.equal(combined.includes(forbidden),false,'forbidden dependency leaked into lightweight reader: '+forbidden);
  }
});
