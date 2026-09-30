import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import JSZip from 'jszip';
import {P2LRNDocumentReader, DocumentReaderError} from '../dist/index.js';

async function zip(entries){
  const archive=new JSZip();
  for(const [name,value] of entries) archive.file(name,value);
  return archive.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}

test('TXT reader preserves useful line order', async()=>{
  const reader=new P2LRNDocumentReader();
  const result=await reader.read({name:'notes.txt',mimeType:'text/plain',buffer:Buffer.from('Uno\n\nDos\nTres')});
  assert.equal(result.origin.detectedType,'TXT');
  assert.deepEqual(result.blocks.map(x=>x.text),['Uno','Dos','Tres']);
  assert.equal(result.blocks[1].source?.raw?.blankLinesBefore,1);
});

test('DOCX reader is independent and preserves paragraphs and tables', async()=>{
  const buffer=await zip([
    ['word/document.xml',`<?xml version="1.0"?>
<w:document xmlns:w="urn:w">
<w:body>
<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>Curso DOCX</w:t></w:r></w:p>
<w:p><w:r><w:t>Primer párrafo</w:t></w:r></w:p>
<w:tbl>
<w:tr><w:tc><w:p><w:r><w:t>Nombre</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Valor</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc></w:tr>
</w:tbl>
</w:body></w:document>`],
    ['docProps/core.xml','<cp:coreProperties xmlns:cp="x" xmlns:dc="y"><dc:title>Curso DOCX</dc:title><dc:creator>Ana</dc:creator></cp:coreProperties>'],
  ]);
  const result=await new P2LRNDocumentReader().read({
    name:'curso.docx',
    mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer,
  });
  assert.equal(result.origin.detectedType,'DOCX');
  assert.equal(result.metadata.detectedTitle,'Curso DOCX');
  assert.equal(result.metadata.author,'Ana');
  assert.equal(result.blocks[0].text,'Curso DOCX');
  assert.equal(result.tables.length,1);
  assert.deepEqual(result.tables[0].rows,[{Nombre:'A',Valor:'1'}]);
});

test('PPTX reader preserves slide order', async()=>{
  const buffer=await zip([
    ['ppt/slides/slide2.xml','<p:sld xmlns:p="p" xmlns:a="a"><a:p><a:r><a:t>Diapositiva dos</a:t></a:r></a:p></p:sld>'],
    ['ppt/slides/slide1.xml','<p:sld xmlns:p="p" xmlns:a="a"><a:p><a:r><a:t>Diapositiva uno</a:t></a:r></a:p><a:p><a:r><a:t>Contenido uno</a:t></a:r></a:p></p:sld>'],
  ]);
  const result=await new P2LRNDocumentReader().read({name:'deck.pptx',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',buffer});
  assert.equal(result.origin.detectedType,'PPTX');
  assert.deepEqual(result.blocks.map(x=>x.text),['Diapositiva uno','Contenido uno','Diapositiva dos']);
  assert.deepEqual(result.blocks.map(x=>x.page),[1,1,2]);
});

test('H5P reader reads metadata without executing H5P', async()=>{
  const buffer=await zip([
    ['h5p.json',JSON.stringify({title:'Actividad H5P',mainLibrary:'H5P.Test',language:'es',preloadedDependencies:[{machineName:'H5P.Test',majorVersion:1,minorVersion:0}]})],
    ['content/content.json',JSON.stringify({question:'Hola'})],
  ]);
  const result=await new P2LRNDocumentReader().read({name:'actividad.h5p',mimeType:'application/zip',buffer});
  assert.equal(result.origin.detectedType,'H5P');
  assert.equal(result.metadata.detectedTitle,'Actividad H5P');
  assert.equal(result.blocks[1].text,'H5P.Test 1.0');
});

test('SCORM reader projects manifest organization', async()=>{
  const buffer=await zip([
    ['imsmanifest.xml',`<?xml version="1.0"?>
<manifest identifier="m1">
 <organizations><organization identifier="o1"><title>Curso SCORM</title><item identifier="i1" identifierref="r1"><title>Lección 1</title></item></organization></organizations>
 <resources><resource identifier="r1" type="webcontent" href="index.html"><file href="index.html"/></resource></resources>
</manifest>`],
    ['index.html','<!doctype html><title>SCORM</title>'],
  ]);
  const result=await new P2LRNDocumentReader().read({name:'curso.scorm',mimeType:'application/zip',buffer});
  assert.equal(result.origin.detectedType,'SCORM');
  assert.equal(result.blocks[0].text,'Lección 1');
  assert.equal(result.blocks[0].source?.raw?.href,'index.html');
});

test('PDF can be disabled without loading a PDF runtime', async()=>{
  const reader=new P2LRNDocumentReader({pdf:false});
  await assert.rejects(
    ()=>reader.read({name:'x.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\n')}),
    error=>error instanceof DocumentReaderError&&error.code==='P2LRN_READER_PDF_DISABLED',
  );
});

test('package stays detached from AulaP2P heavy services', async()=>{
  const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  const serialized=JSON.stringify(pkg).toLowerCase();
  for(const forbidden of ['@nestjs/common','ocr','docling','docker','puppeteer','libreoffice','pandoc']){
    assert.equal(serialized.includes(forbidden),false,`package must not depend on ${forbidden}`);
  }
  assert.equal(pkg.peerDependencies['pdfjs-dist'],'5.4.296');
  assert.equal(pkg.peerDependenciesMeta['pdfjs-dist'].optional,true);
});


test('DOCX keeps image between surrounding text and table in document order', async()=>{
  const image=Buffer.from([137,80,78,71,13,10,26,10,1,2,3,4]);
  const buffer=await zip([
    ['word/document.xml',`<?xml version="1.0"?>
<w:document xmlns:w="w" xmlns:r="r" xmlns:a="a" xmlns:wp="wp">
<w:body>
  <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Introducción</w:t></w:r></w:p>
  <w:p>
    <w:r><w:t>Antes</w:t></w:r>
    <w:r><w:drawing><wp:inline><wp:extent cx="95250" cy="47625"/><a:blip r:embed="rId1"/></wp:inline></w:drawing></w:r>
    <w:r><w:t>Después</w:t></w:r>
  </w:p>
  <w:tbl>
    <w:tr><w:tc><w:p><w:r><w:t>Nombre</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Valor</w:t></w:r></w:p></w:tc></w:tr>
    <w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc></w:tr>
  </w:tbl>
</w:body></w:document>`],
    ['word/_rels/document.xml.rels','<Relationships><Relationship Id="rId1" Type="image" Target="media/image1.png"/></Relationships>'],
    ['word/media/image1.png',image],
  ]);
  const result=await new P2LRNDocumentReader({includeAssetBytes:true}).read({
    name:'ordered.docx',
    mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer,
  });
  assert.deepEqual(result.blocks.map(x=>[x.type,x.text]),[
    ['TITLE','Introducción'],
    ['PARAGRAPH','Antes'],
    ['IMAGE_REFERENCE','image1.png'],
    ['PARAGRAPH','Después'],
    ['TABLE','Table 1'],
  ]);
  assert.equal(result.assets.length,1);
  assert.deepEqual([...result.assets[0].buffer],[...image]);
  assert.equal(result.blocks[2].position.width,10);
  assert.equal(result.blocks[2].position.height,5);
  assert.deepEqual(result.tables[0].rows,[{Nombre:'A',Valor:'1'}]);
});

test('PPTX mixes title image and text by slide coordinates instead of appending images', async()=>{
  const image=Buffer.from([137,80,78,71,13,10,26,10,5,6,7,8]);
  const buffer=await zip([
    ['ppt/slides/slide1.xml',`<p:sld xmlns:p="p" xmlns:a="a" xmlns:r="r"><p:cSld><p:spTree>
      <p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2000000" cy="400000"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t>Título</a:t></a:r></a:p></p:txBody></p:sp>
      <p:pic><p:blipFill><a:blip r:embed="rIdImg"/></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="952500"/><a:ext cx="952500" cy="476250"/></a:xfrm></p:spPr></p:pic>
      <p:sp><p:spPr><a:xfrm><a:off x="0" y="1905000"/><a:ext cx="3000000" cy="500000"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t>Texto inferior</a:t></a:r></a:p></p:txBody></p:sp>
    </p:spTree></p:cSld></p:sld>`],
    ['ppt/slides/_rels/slide1.xml.rels','<Relationships><Relationship Id="rIdImg" Type="image" Target="../media/image1.png"/></Relationships>'],
    ['ppt/media/image1.png',image],
  ]);
  const result=await new P2LRNDocumentReader({includeAssetBytes:true}).read({
    name:'ordered.pptx',
    mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    buffer,
  });
  assert.deepEqual(result.blocks.map(x=>[x.type,x.text]),[
    ['TITLE','Título'],
    ['IMAGE_REFERENCE','image1.png'],
    ['PARAGRAPH','Texto inferior'],
  ]);
  assert.equal(result.blocks[1].position.y,100);
  assert.equal(result.blocks[1].position.width,100);
  assert.deepEqual([...result.assets[0].buffer],[...image]);
});

test('source tree contains no OCR Docling NestJS or external conversion runtime imports', async()=>{
  const {readdir,readFile}=await import('node:fs/promises');
  const src=new URL('../src/',import.meta.url);
  const names=(await readdir(src)).filter(name=>name.endsWith('.ts'));
  const text=(await Promise.all(names.map(name=>readFile(new URL(name,src),'utf8')))).join('\n').toLowerCase();
  for(const forbidden of ['@nestjs','docling','extractor-pdf-ocr','detector-necesidad-ocr','ingestion-assets','libreoffice','pandoc','puppeteer']){
    assert.equal(text.includes(forbidden),false,'forbidden dependency leaked into standalone reader: '+forbidden);
  }
});
