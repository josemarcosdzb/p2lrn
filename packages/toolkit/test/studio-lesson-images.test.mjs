import test from 'node:test';
import assert from 'node:assert/strict';
import {createP2LRNStudioDocument} from '../web/studio/new-document.js';
import {exportP2LRNPackage} from '../web/studio/package-export.js';
import {openP2LRNPackageBytes} from '../web/p2lrn-player.js';
import {lessonImageData,lessonImageMediaType,MAX_LESSON_IMAGE_BYTES} from '../web/studio/lesson-images.js';

const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==','base64'));
const file=(bytes,name='diagrama.png')=>({name,size:bytes.byteLength,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});

test('raster image stays inside lesson HTML with its position after valid P2LRN export/import',async()=>{
  const image=await lessonImageData(file(png));
  assert.equal(image.mediaType,'image/png');assert.equal(image.alt,'diagrama');
  const document=createP2LRNStudioDocument({title:'Imágenes dentro de lecciones'});
  const lesson=[...document.entities.values()].find(entity=>entity.type==='activity');
  const editable=await document.readEditableText(lesson.id);
  assert.equal(editable.mediaType,'text/html');
  document.setPayloadText(editable.path,'<!doctype html><html lang="es"><body><div data-p2lrn-lesson-canvas="1" style="position:relative;min-height:360px"><h1>Texto intacto</h1><p>Párrafo intacto</p><img data-p2lrn-lesson-image="1" style="position:absolute;left:35%;top:120px;width:280px;max-width:calc(65% - 4px)" src="'+image.src+'" alt="'+image.alt+'"></div></body></html>');
  const exported=await exportP2LRNPackage(document);
  const opened=await openP2LRNPackageBytes(exported.bytes.buffer.slice(exported.bytes.byteOffset,exported.bytes.byteOffset+exported.bytes.byteLength));
  const html=new TextDecoder().decode(await opened.payload(editable.path).read());
  for(const expected of ['Texto intacto','Párrafo intacto','data-p2lrn-lesson-canvas','data-p2lrn-lesson-image','left:35%','top:120px',image.src])
    assert(html.includes(expected),'Lost lesson content: '+expected.slice(0,40));
  assert.match(opened.manifest.integrity.contentRoot,/^sha256:[0-9a-f]{64}$/);
});
test('rejects SVG and untrusted MIME even when renamed, before allocating oversized images',async()=>{
  assert.equal(lessonImageMediaType(png),'image/png');
  const fake=new Uint8Array(Buffer.from('<svg onload="alert(1)">'));
  assert.equal(lessonImageMediaType(fake),null);
  await assert.rejects(lessonImageData(file(fake,'trampa.png')),/No se admite SVG/);
  await assert.rejects(lessonImageData({name:'enorme.png',size:MAX_LESSON_IMAGE_BYTES+1,arrayBuffer:()=>{throw Error('Should not read');}}),/8 MB/);
});
