import test from 'node:test';
import assert from 'node:assert/strict';

import {writeZip} from '../dist/core/zip.js';
import {LightweightDocumentReader, detectDocumentType} from '../dist/document-reader/index.js';

const enc=new TextEncoder();

function zip(entries){
  return writeZip(entries.map(([path,text,mediaType])=>({
    path,
    data:typeof text==='string'?enc.encode(text):text,
    mediaType,
    method:mediaType?.includes('zip')?0:8,
  })));
}

test('lightweight document reader parses DOCX structure and image placement without AulaP2P services',async()=>{
  const data=zip([
    ['word/document.xml',`<?xml version="1.0"?>
<w:document xmlns:w="w" xmlns:a="a" xmlns:r="r"><w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Curso de ejemplo</w:t></w:r></w:p>
<w:p><w:r><w:t>Texto antes</w:t></w:r><w:r><w:drawing><a:blip r:embed="rId1"/></w:drawing></w:r><w:r><w:t>Texto despues</w:t></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Columna A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Columna B</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>2</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
</w:body></w:document>`,'application/xml'],
    ['word/_rels/document.xml.rels',`<Relationships><Relationship Id="rId1" Target="media/image1.png"/></Relationships>`,'application/xml'],
    ['word/media/image1.png',new Uint8Array([1,2,3]),'image/png'],
  ]);
  const reader=new LightweightDocumentReader();
  assert.equal(detectDocumentType({name:'curso.docx',data}),'DOCX');
  const doc=await reader.read({name:'curso.docx',data});
  assert.equal(doc.source.detectedType,'DOCX');
  assert.equal(doc.metadata.detectedTitle,'Curso de ejemplo');
  assert.ok(doc.blocks.some(b=>b.type==='IMAGE_REFERENCE'&&b.asset?.path==='word/media/image1.png'));
  assert.ok(doc.blocks.findIndex(b=>b.text==='Texto antes') < doc.blocks.findIndex(b=>b.type==='IMAGE_REFERENCE'));
  assert.ok(doc.blocks.findIndex(b=>b.type==='IMAGE_REFERENCE') < doc.blocks.findIndex(b=>b.text==='Texto despues'));
  assert.equal(doc.tables.length,1);
  assert.deepEqual(doc.tables[0].columns,['Columna A','Columna B']);
  assert.equal(doc.tables[0].rows[0]['Columna A'],'1');
});

test('lightweight document reader preserves PPTX slide order and image references',async()=>{
  const data=zip([
    ['ppt/slides/slide1.xml',`<p:sld xmlns:p="p" xmlns:a="a" xmlns:r="r"><p:cSld><p:sp><p:txBody><a:p><a:r><a:t>Titulo slide 1</a:t></a:r></a:p></p:txBody></p:sp><p:pic><p:blipFill><a:blip r:embed="rId5"/></p:blipFill></p:pic></p:cSld></p:sld>`,'application/xml'],
    ['ppt/slides/_rels/slide1.xml.rels',`<Relationships><Relationship Id="rId5" Target="../media/image1.png"/></Relationships>`,'application/xml'],
    ['ppt/media/image1.png',new Uint8Array([1,2,3]),'image/png'],
    ['ppt/slides/slide2.xml',`<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:sp><p:txBody><a:p><a:r><a:t>Titulo slide 2</a:t></a:r></a:p></p:txBody></p:sp></p:cSld></p:sld>`,'application/xml'],
  ]);
  const doc=await new LightweightDocumentReader().read({name:'slides.pptx',data});
  assert.equal(doc.source.detectedType,'PPTX');
  assert.deepEqual(doc.metadata.sheets,['Slide 1','Slide 2']);
  assert.equal(doc.blocks[0].text,'Titulo slide 1');
  assert.ok(doc.blocks.some(b=>b.sheet==='Slide 1'&&b.type==='IMAGE_REFERENCE'&&b.asset?.path==='ppt/media/image1.png'));
  assert.ok(doc.blocks.some(b=>b.sheet==='Slide 2'&&b.text==='Titulo slide 2'));
});

test('lightweight document reader reads ODT and EPUB without external converters',async()=>{
  const odt=zip([
    ['mimetype','application/vnd.oasis.opendocument.text','text/plain'],
    ['content.xml','<office:document><text:h>Titulo ODT</text:h><text:p>Parrafo ODT</text:p></office:document>','application/xml'],
  ]);
  const odtDoc=await new LightweightDocumentReader().read({name:'texto.odt',data:odt});
  assert.equal(odtDoc.source.detectedType,'ODT');
  assert.ok(odtDoc.blocks.some(b=>b.text.includes('Titulo ODT')));

  const epub=zip([
    ['mimetype','application/epub+zip','text/plain'],
    ['META-INF/container.xml','<container/>','application/xml'],
    ['OEBPS/content.opf',`<package><manifest><item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>`,'application/xml'],
    ['OEBPS/chapter1.xhtml','<html><body><h1>Titulo EPUB</h1><p>Parrafo EPUB</p></body></html>','application/xhtml+xml'],
  ]);
  const epubDoc=await new LightweightDocumentReader().read({name:'book.epub',data:epub});
  assert.equal(epubDoc.source.detectedType,'EPUB');
  assert.ok(epubDoc.blocks.some(b=>b.text.includes('Titulo EPUB')));
});

test('lightweight document reader handles Markdown and never silently invokes OCR',async()=>{
  const markdown=enc.encode('# Titulo\n\n- elemento\n\nParrafo.');
  const doc=await new LightweightDocumentReader().read({name:'readme.md',data:markdown});
  assert.equal(doc.blocks[0].type,'TITLE');
  assert.equal(doc.blocks[1].type,'LIST');

  const pdf=enc.encode('%PDF-1.7\n');
  await assert.rejects(
    ()=>new LightweightDocumentReader({pdfTextAdapter:'disabled'}).read({name:'scan.pdf',data:pdf}),
    /PDF extraction is disabled/,
  );
});


test('lightweight document reader fails closed on ZIPs that exceed configured detection limits',()=>{
  const data=zip([
    ['word/document.xml','<w:document/>','application/xml'],
    ['word/a.xml','<a/>','application/xml'],
    ['word/b.xml','<b/>','application/xml'],
  ]);
  assert.throws(
    ()=>detectDocumentType({name:'oversized.docx',data},{archiveEntries:2}),
    /more than 2 entries/i,
  );
});

test('lightweight document reader rejects archive relationships that traverse above the archive root',async()=>{
  const data=zip([
    ['ppt/slides/slide1.xml',`<p:sld xmlns:p="p" xmlns:a="a" xmlns:r="r"><p:cSld><p:pic><p:blipFill><a:blip r:embed="rId1"/></p:blipFill></p:pic></p:cSld></p:sld>`,'application/xml'],
    ['ppt/slides/_rels/slide1.xml.rels','<Relationships><Relationship Id="rId1" Target="../../../outside.png"/></Relationships>','application/xml'],
    ['outside.png',new Uint8Array([1]),'image/png'],
  ]);
  await assert.rejects(
    ()=>new LightweightDocumentReader().read({name:'escape.pptx',data}),
    /archive relationship escapes root/i,
  );
});
