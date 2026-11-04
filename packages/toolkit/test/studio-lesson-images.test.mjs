import test from 'node:test';
import assert from 'node:assert/strict';
import {createP2LRNStudioDocument} from '../web/studio/new-document.js';
import {exportP2LRNPackage} from '../web/studio/package-export.js';
import {openP2LRNPackageBytes} from '../web/p2lrn-player.js';
import {lessonImageData,lessonImageMediaType,lessonImageFlowLayout,MAX_LESSON_IMAGE_BYTES,lessonVideoData,lessonVideoMediaType,MAX_LESSON_VIDEO_BYTES} from '../web/studio/lesson-images.js';

const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==','base64'));
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


test('3D-free lesson image layout wraps text, keeps its upper lines and never overlays another image',()=>{
  const initial=lessonImageFlowLayout({x:12,y:100,width:280,height:160},720);
  assert.equal(initial.style.float,'left');
  assert.equal(initial.style.marginTop,'100px');
  assert.equal(initial.style.shapeOutside,'inset(100px 0px 0px 0px)');
  assert.equal(initial.style.marginLeft,'86px');
  const moved=lessonImageFlowLayout({x:70,y:280,width:280,height:160},720);
  assert.equal(moved.style.float,'right');
  assert.equal(moved.style.marginTop,'280px');
  assert.equal(moved.style.shapeOutside,'inset(280px 0px 0px 0px)');
  assert(moved.nextBottom>initial.nextBottom);
  const second=lessonImageFlowLayout({x:5,y:300,width:240,height:130},720,moved.nextBottom);
  assert.equal(second.style.marginTop,'0px');
  assert(second.nextBottom>moved.nextBottom);
  const mobile=lessonImageFlowLayout({x:80,y:500,width:320,height:210},345);
  assert.equal(mobile.style.float,'left');
  assert.equal(mobile.style.marginTop,'0px');
  assert(mobile.nextBottom<500);
});


test('video MP4/WebM content survives course export and import without external server',async()=>{
  const mp4=Uint8Array.from([0,0,0,24,102,116,121,112,105,115,111,109,0,0,0,0,105,115,111,50,0,0,0,0]);
  const webm=Uint8Array.from([0x1a,0x45,0xdf,0xa3,0x87,0x42,0x82,0x84,119,101,98,109,0,0,0,0]);
  assert.equal(lessonVideoMediaType(mp4),'video/mp4');
  assert.equal(lessonVideoMediaType(webm),'video/webm');
  const video=await lessonVideoData(file(webm,'Leccion 1.webm'));
  assert.equal(video.mediaType,'video/webm');
  assert(video.src.startsWith('data:video/webm;base64,'));
  const document=createP2LRNStudioDocument({title:'Curso con vídeo sin conexión'});
  const lesson=[...document.entities.values()].find(entity=>entity.type==='activity');
  const editable=await document.readEditableText(lesson.id);
  document.setPayloadText(editable.path,'<!doctype html><html lang="es"><body><article><h1>Texto antes</h1><video data-p2lrn-lesson-video="1" controls preload="metadata" playsinline src="'+video.src+'" style="width:420px"></video><p>Texto después</p></article></body></html>');
  const packed=await exportP2LRNPackage(document);
  const opened=await openP2LRNPackageBytes(packed.bytes.buffer.slice(packed.bytes.byteOffset,packed.bytes.byteOffset+packed.bytes.byteLength));
  const html=new TextDecoder().decode(await opened.payload(editable.path).read());
  for(const required of ['Texto antes','Texto después','data-p2lrn-lesson-video','controls','data:video/webm;base64,',video.src])
    assert(html.includes(required),'Missing portable video or text: '+required.slice(0,30));
  assert.match(opened.manifest.integrity.contentRoot,/^sha256:[0-9a-f]{64}$/);
});

test('video upload validates size and magic bytes rather than trusting extension or MIME',async()=>{
  const mp4=Uint8Array.from([0,0,0,24,102,116,121,112,109,112,52,50,0,0,0,0]);
  assert.equal(lessonVideoMediaType(mp4),'video/mp4');
  const fake=new Uint8Array(Buffer.from('<html><script>alert(1)</script></html>'));
  assert.equal(lessonVideoMediaType(fake),null);
  await assert.rejects(lessonVideoData(file(fake,'trampa.mp4')),/MP4 o WebM/);
  await assert.rejects(lessonVideoData({name:'gigante.webm',size:MAX_LESSON_VIDEO_BYTES+1,arrayBuffer:()=>{throw Error('Should not read');}}),/32 MB/);
  await assert.rejects(lessonVideoData(file(Uint8Array.of(1,2,3,4),'bad.webm')),/12 bytes/);
});
