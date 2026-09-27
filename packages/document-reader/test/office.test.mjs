import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {DefaultP2LRNDocumentReader,createDefaultDocumentExtractorRegistry,resolveDocumentOutline,readZipEntries} from '../dist/index.js';

async function bytes(zip){return new Uint8Array(await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}));}
function reader(){return new DefaultP2LRNDocumentReader({registry:createDefaultDocumentExtractorRegistry()});}

test('DOCX preserves body order across text, image, table and following text',async()=>{
  const zip=new JSZip();
  zip.file('word/styles.xml',`<w:styles xmlns:w="w"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style></w:styles>`);
  zip.file('word/_rels/document.xml.rels',`<Relationships><Relationship Id="rId1" Type="image" Target="media/image1.png"/></Relationships>`);
  zip.file('word/document.xml',`<w:document xmlns:w="w" xmlns:r="r" xmlns:a="a" xmlns:wp="wp"><w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>1 Módulo</w:t></w:r></w:p>
    <w:p><w:r><w:t>Texto antes</w:t></w:r></w:p>
    <w:p><w:r><w:drawing><wp:inline><wp:extent cx="952500" cy="476250"/><a:blip r:embed="rId1"/></wp:inline></w:drawing></w:r></w:p>
    <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Clave</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Valor</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
    <w:p><w:r><w:t>Texto después</w:t></w:r></w:p>
  </w:body></w:document>`);
  zip.file('word/media/image1.png',new Uint8Array([137,80,78,71,1,2,3]));
  zip.file('docProps/core.xml','<cp:coreProperties xmlns:cp="cp" xmlns:dc="dc"><dc:title>Curso DOCX</dc:title><dc:creator>Autor</dc:creator></cp:coreProperties>');
  const result=await reader().read({name:'curso.docx',bytes:await bytes(zip)});
  assert.deepEqual(result.document.blocks.map(b=>b.type),['TITLE','PARAGRAPH','IMAGE','TABLE','PARAGRAPH']);
  assert.equal(result.document.blocks[2].asset?.name,'image1.png');
  assert.equal(result.document.blocks[2].bbox?.width,100);
  assert.equal(result.assets.length,1);
  assert.equal(result.document.tables[0].rows[0].Valor,'1');
  assert.equal(result.document.metadata.title,'Curso DOCX');
  const outline=resolveDocumentOutline(result.document);
  assert.equal(outline.modules[0].title,'1 Módulo');
  assert.ok(outline.modules[0].lessons[0].content.some(x=>x.kind==='IMAGE'));
  assert.ok(outline.modules[0].lessons[0].content.some(x=>x.kind==='TABLE'));
});

test('PPTX preserves slide and shape order and resolves slides as lessons',async()=>{
  const zip=new JSZip();
  zip.file('ppt/presentation.xml','<p:presentation xmlns:p="p"><p:sldSz cx="9144000" cy="6858000"/></p:presentation>');
  zip.file('docProps/core.xml','<cp:coreProperties xmlns:cp="cp" xmlns:dc="dc"><dc:title>Presentación</dc:title></cp:coreProperties>');
  zip.file('ppt/slides/_rels/slide1.xml.rels','<Relationships><Relationship Id="rId1" Type="image" Target="../media/image1.png"/></Relationships>');
  zip.file('ppt/slides/slide1.xml',`<p:sld xmlns:p="p" xmlns:a="a" xmlns:r="r"><p:cSld><p:spTree>
    <p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Diapositiva Uno</a:t></a:r></a:p></p:txBody></p:sp>
    <p:sp><p:txBody><a:p><a:r><a:t>Texto uno</a:t></a:r></a:p></p:txBody></p:sp>
    <p:pic><p:blipFill><a:blip r:embed="rId1"/></p:blipFill><p:spPr><a:xfrm><a:off x="952500" y="952500"/><a:ext cx="1905000" cy="952500"/></a:xfrm></p:spPr></p:pic>
    <p:graphicFrame><a:tbl><a:tr><a:tc><a:p><a:r><a:t>H</a:t></a:r></a:p></a:tc><a:tc><a:p><a:r><a:t>V</a:t></a:r></a:p></a:tc></a:tr><a:tr><a:tc><a:p><a:r><a:t>X</a:t></a:r></a:p></a:tc><a:tc><a:p><a:r><a:t>2</a:t></a:r></a:p></a:tc></a:tr></a:tbl></p:graphicFrame>
  </p:spTree></p:cSld></p:sld>`);
  zip.file('ppt/slides/slide2.xml',`<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree>
    <p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Diapositiva Dos</a:t></a:r></a:p></p:txBody></p:sp>
    <p:sp><p:txBody><a:p><a:r><a:t>Texto dos</a:t></a:r></a:p></p:txBody></p:sp>
  </p:spTree></p:cSld></p:sld>`);
  zip.file('ppt/media/image1.png',new Uint8Array([137,80,78,71,8,9]));
  const result=await reader().read({name:'presentacion.pptx',bytes:await bytes(zip)});
  const visible=result.document.blocks.map(b=>[b.slide,b.type,b.text]);
  assert.deepEqual(visible.slice(0,4),[[1,'TITLE','Diapositiva Uno'],[1,'PARAGRAPH','Texto uno'],[1,'IMAGE','image1.png'],[1,'TABLE','Tabla diapositiva 1']]);
  assert.deepEqual(visible.slice(4),[[2,'TITLE','Diapositiva Dos'],[2,'PARAGRAPH','Texto dos']]);
  assert.equal(result.document.blocks[2].bbox?.x,100);
  assert.equal(result.document.blocks[2].bbox?.width,200);
  assert.equal(result.document.tables[0].rows[0].V,'2');
  const outline=resolveDocumentOutline(result.document);
  assert.equal(outline.modules.length,1);
  assert.deepEqual(outline.modules[0].lessons.map(x=>x.title),['Diapositiva Uno','Diapositiva Dos']);
});

test('ZIP reader rejects case-insensitive duplicate paths',async()=>{
  const zip=new JSZip();zip.file('word/media/Image.png','a');zip.file('word/media/image.png','b');
  await assert.rejects(()=>readZipEntries(await bytes(zip)),/duplicate internal path/i);
});
