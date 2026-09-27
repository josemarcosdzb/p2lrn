import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {DefaultP2LRNDocumentReader,resolveDocumentOutline} from '../dist/index.js';

async function zipBytes(zip){return new Uint8Array(await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}));}
const reader=()=>new DefaultP2LRNDocumentReader();

test('ODT preserves heading, paragraph, embedded image, table and list order',async()=>{
  const zip=new JSZip();
  zip.file('mimetype','application/vnd.oasis.opendocument.text',{compression:'STORE'});
  zip.file('meta.xml','<office:document-meta xmlns:office="office" xmlns:dc="dc" xmlns:meta="meta"><office:meta><dc:title>Curso ODT</dc:title><meta:initial-creator>Autor</meta:initial-creator><dc:language>es</dc:language></office:meta></office:document-meta>');
  zip.file('content.xml',`<office:document-content xmlns:office="office" xmlns:text="text" xmlns:table="table" xmlns:draw="draw" xmlns:xlink="xlink"><office:body><office:text>
    <text:h text:outline-level="1">1 Módulo ODT</text:h>
    <text:p>Texto antes <draw:frame><draw:image xlink:href="Pictures/pic.png"/></draw:frame></text:p>
    <table:table><table:table-row><table:table-cell><text:p>Clave</text:p></table:table-cell><table:table-cell><text:p>Valor</text:p></table:table-cell></table:table-row><table:table-row><table:table-cell><text:p>A</text:p></table:table-cell><table:table-cell><text:p>1</text:p></table:table-cell></table:table-row></table:table>
    <text:list><text:list-item><text:p>Uno</text:p></text:list-item><text:list-item><text:p>Dos</text:p></text:list-item></text:list>
  </office:text></office:body></office:document-content>`);
  zip.file('Pictures/pic.png',new Uint8Array([137,80,78,71,1,2,3]));
  const result=await reader().read({name:'curso.odt',bytes:await zipBytes(zip)});
  assert.equal(result.document.metadata.title,'Curso ODT');
  assert.equal(result.document.metadata.author,'Autor');
  assert.equal(result.document.metadata.language,'es');
  assert.deepEqual(result.document.blocks.map(x=>x.type),['TITLE','PARAGRAPH','IMAGE','TABLE','LIST','LIST']);
  assert.equal(result.assets.length,1);
  assert.equal(result.document.blocks[2].asset.sourcePath,'Pictures/pic.png');
  assert.equal(result.document.tables[0].rows[0].Valor,'1');
  assert.deepEqual(result.document.blocks.filter(x=>x.type==='LIST').map(x=>x.text),['Uno','Dos']);
  const outline=resolveDocumentOutline(result.document);
  assert.equal(outline.modules[0].title,'1 Módulo ODT');
});

test('EPUB follows OPF spine order and materializes chapter-relative images',async()=>{
  const zip=new JSZip();
  zip.file('mimetype','application/epub+zip',{compression:'STORE'});
  zip.file('META-INF/container.xml','<container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  zip.file('OEBPS/content.opf',`<package xmlns:dc="dc"><metadata><dc:title>Libro EPUB</dc:title><dc:creator>Autora</dc:creator><dc:language>es</dc:language></metadata><manifest>
    <item id="c1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/>
    <item id="pic" href="images/pic.png" media-type="image/png"/>
  </manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>`);
  zip.file('OEBPS/text/ch1.xhtml','<html lang="es"><body><h1>Capítulo Uno</h1><p>Primero</p><img alt="Figura" src="../images/pic.png"/></body></html>');
  zip.file('OEBPS/text/ch2.xhtml','<html lang="es"><body><h1>Capítulo Dos</h1><p>Segundo</p></body></html>');
  zip.file('OEBPS/images/pic.png',new Uint8Array([137,80,78,71,8,9]));
  const result=await reader().read({name:'libro.epub',bytes:await zipBytes(zip)});
  assert.equal(result.document.metadata.title,'Libro EPUB');
  assert.equal(result.document.metadata.author,'Autora');
  assert.deepEqual(result.document.blocks.map(x=>[x.type,x.text]),[
    ['TITLE','Capítulo Uno'],['PARAGRAPH','Primero'],['IMAGE','Figura'],['TITLE','Capítulo Dos'],['PARAGRAPH','Segundo']
  ]);
  assert.equal(result.assets.length,1);
  assert.equal(result.document.blocks[2].asset.sourcePath,'OEBPS/images/pic.png');
  assert.equal(result.document.blocks[0].source.raw.internalFile,'OEBPS/text/ch1.xhtml');
  assert.equal(result.document.blocks[3].source.raw.internalFile,'OEBPS/text/ch2.xhtml');
});

test('EPUB rejects archive-root traversal in manifest href',async()=>{
  const zip=new JSZip();
  zip.file('META-INF/container.xml','<container><rootfiles><rootfile full-path="content.opf"/></rootfiles></container>');
  zip.file('content.opf','<package><manifest><item id="bad" href="../../outside.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="bad"/></spine></package>');
  await assert.rejects(()=>reader().read({name:'bad.epub',bytes:await zipBytes(zip)}),/escapes archive root/);
});

test('ODT reports a missing referenced image instead of inventing a URL',async()=>{
  const zip=new JSZip();
  zip.file('content.xml','<office:document-content xmlns:office="office" xmlns:text="text" xmlns:draw="draw" xmlns:xlink="xlink"><office:body><office:text><text:p>Texto<draw:frame><draw:image xlink:href="Pictures/missing.png"/></draw:frame></text:p></office:text></office:body></office:document-content>');
  const result=await reader().read({name:'missing.odt',bytes:await zipBytes(zip)});
  assert.equal(result.assets.length,0);
  assert.ok(result.document.warnings.some(x=>/missing from archive/.test(x.message)));
});
