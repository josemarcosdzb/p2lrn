import {studioUiText} from './studio-ui-i18n.js';
import {studioNestedInsertionContainer,ensureStudioEndCaret} from './visual-layout.js';
// Shared by the website Studio and npm Studio. Images remain inside the
// portable HTML payload; the passive-text Player's CSP permits img-src data:.
export const MAX_LESSON_IMAGE_BYTES=8*1024*1024;
export const MAX_LESSON_VIDEO_BYTES=32*1024*1024;
const IMAGE='img[data-p2lrn-lesson-image]';
const VIDEO='video[data-p2lrn-lesson-video]';
const MEDIA=IMAGE+','+VIDEO;
const isDiagramMedia=media=>['diagram-canvas','diagram-group'].includes(media?.parentElement?.dataset?.p2lrnLayout);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

export function lessonImageMediaType(bytes){
  const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  const word=(a,z)=>String.fromCharCode(...b.subarray(a,z));
  if(b.length>=8&&b[0]===137&&word(1,4)==='PNG'&&b[4]===13&&b[5]===10&&b[6]===26&&b[7]===10)return 'image/png';
  if(b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';
  if(b.length>=6&&['GIF87a','GIF89a'].includes(word(0,6)))return 'image/gif';
  if(b.length>=12&&word(0,4)==='RIFF'&&word(8,12)==='WEBP')return 'image/webp';
  if(b.length>=12&&word(4,8)==='ftyp'&&['avif','avis'].includes(word(8,12)))return 'image/avif';
  return null; // Reject SVG, HTML and renamed non-image files.
}
export async function lessonImageData(file){
  if(!file||typeof file.arrayBuffer!=='function')throw new TypeError('Selecciona una imagen local.');
  if(!Number.isFinite(file.size)||file.size<12||file.size>MAX_LESSON_IMAGE_BYTES)
    throw new Error('La imagen debe ocupar entre 12 bytes y 8 MB.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(bytes.byteLength!==file.size)throw new Error('El tamaño de imagen es incorrecto.');
  const mediaType=lessonImageMediaType(bytes);
  if(!mediaType)throw new Error('Utiliza PNG, JPG, GIF, WebP o AVIF. No se admite SVG ni HTML.');
  if(typeof createImageBitmap==='function'){
    const image=await createImageBitmap(new Blob([bytes],{type:mediaType}));
    try{if(!image.width||!image.height)throw new Error('Imagen sin dimensiones válidas.');}
    finally{image.close?.();}
  }
  const pieces=[];
  for(let offset=0;offset<bytes.length;offset+=16384)
    pieces.push(String.fromCharCode(...bytes.subarray(offset,offset+16384)));
  const src='data:'+mediaType+';base64,'+btoa(pieces.join(''));
  const alt=String(file.name||studioUiText('Imagen')).replace(/\.[^.]+$/,'').slice(0,160)||studioUiText('Imagen');
  return {src,alt,mediaType,bytes:bytes.byteLength};
}


export function lessonVideoMediaType(bytes){
  const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  if(b.length>=16&&String.fromCharCode(...b.subarray(4,8))==='ftyp'){
    // ISO Base Media File Format with MP4-compatible major brand.
    const brand=String.fromCharCode(...b.subarray(8,12));
    if(['isom','iso2','iso4','iso5','iso6','mp41','mp42','avc1','M4V '].includes(brand))return 'video/mp4';
  }
  if(b.length>=12&&b[0]===0x1a&&b[1]===0x45&&b[2]===0xdf&&b[3]===0xa3){
    const header=new TextDecoder('latin1').decode(b.subarray(0,Math.min(b.length,4096)));
    if(header.includes('webm'))return 'video/webm';
  }
  return null;
}

export async function lessonVideoData(file){
  if(!file||typeof file.arrayBuffer!=='function')throw new TypeError('Selecciona un vídeo local.');
  if(!Number.isFinite(file.size)||file.size<12||file.size>MAX_LESSON_VIDEO_BYTES)
    throw new Error('El vídeo debe ocupar entre 12 bytes y 32 MB.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(bytes.byteLength!==file.size)throw new Error('El tamaño del vídeo es incorrecto.');
  const mediaType=lessonVideoMediaType(bytes);
  if(!mediaType)throw new Error('Solo se admiten vídeos MP4 o WebM válidos. No se admite HTML, SVG ni archivos renombrados.');
  const chunks=[];
  for(let offset=0;offset<bytes.length;offset+=16384)
    chunks.push(String.fromCharCode(...bytes.subarray(offset,offset+16384)));
  return {src:'data:'+mediaType+';base64,'+btoa(chunks.join('')),
    label:String(file.name||'Vídeo').replace(/\.[^.]+$/,'').slice(0,160)||'Vídeo',
    mediaType,bytes:bytes.byteLength};
}

// One layout contract for Studio, exported lesson HTML and the Player.
// A float excludes only the actual image; text before, beside and after it
// can occupy the remaining lines without being covered.
export function lessonImageFlowLayout({x=0,y=0,width=280,height=180},canvasWidth,previousBottom=0){
  const fullWidth=Math.max(1,Number(canvasWidth)||1);
  const imageWidth=Math.min(Math.max(1,Number(width)||280),Math.max(1,fullWidth-12));
  const imageHeight=imageWidth*Math.max(1,Number(height)||180)/Math.max(1,Number(width)||280);
  const freeSpace=Math.max(0,fullWidth-imageWidth-12);
  const requested=clamp((Number(x)||0)*fullWidth/100,0,freeSpace);
  const right=requested>freeSpace-requested;
  const stack=freeSpace<180;
  const snap=!stack&&Math.max(requested,freeSpace-requested)<180;
  const left=stack?0:snap?(right?freeSpace:0):requested;
  const start=stack?previousBottom:Math.max(Math.max(0,Number(y)||0),previousBottom);
  const gap=Math.max(0,start-previousBottom);
  return {
    nextBottom:start+imageHeight+12,
    style:{
      float:stack?'left':right?'right':'left',
      clear:'both',
      marginTop:gap+'px',
      marginBottom:'12px',
      marginLeft:stack?'0px':right?'12px':Math.round(left)+'px',
      // On narrow screens the float's entire margin-box occupies the row:
      // headings and paragraphs continue underneath, never in a tiny column.
      marginRight:stack?Math.round(Math.max(0,fullWidth-imageWidth))+'px':right?Math.round(Math.max(0,fullWidth-left-imageWidth))+'px':'12px',
      shapeOutside:'inset('+gap+'px 0px 0px 0px)',
    },
  };
}

const STYLES=".p2lrn-lesson-image-editor{display:grid;gap:8px;min-width:0;max-width:100%}\n.p2lrn-lesson-image-toolbar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;min-height:34px}\n.p2lrn-lesson-image-toolbar button{min-height:32px;padding:6px 10px;border:1px solid #cfd8e4;border-radius:7px;background:#fff;color:#172033;font:600 12px/1.2 system-ui,sans-serif;cursor:pointer}\n.p2lrn-lesson-image-toolbar button:hover:not(:disabled){background:#eef3f9}\n.p2lrn-lesson-image-toolbar button:disabled{opacity:.45;cursor:default}\n.p2lrn-lesson-image-toolbar span{color:#64748b;font:11px/1.35 system-ui,sans-serif}\n.p2lrn-lesson-image-editor [data-p2lrn-lesson-image]{cursor:grab;touch-action:none;user-select:none;object-fit:contain}\n.p2lrn-lesson-image-editor [data-p2lrn-lesson-image]:hover,.p2lrn-lesson-image-editor [data-p2lrn-lesson-image]:focus-visible{outline:2px solid #437ddd;outline-offset:2px}\n.p2lrn-lesson-image-editor [data-p2lrn-lesson-image]:active{cursor:grabbing}\n.p2lrn-lesson-image-editor .surface img,.p2lrn-lesson-image-editor .studio-wysiwyg img{height:auto}\n.p2lrn-lesson-image-editor video[data-p2lrn-lesson-video]{object-fit:contain;max-width:100%;background:#111827;border-radius:7px}\n.p2lrn-lesson-image-editor video[data-p2lrn-lesson-video]:focus-visible{outline:2px solid #437ddd;outline-offset:2px}";

export function mountLessonImageEditor({host,surface,onChange=()=>{},onStatus:reportStatus=()=>{},preferRibbonInsert=false,getInsertionTarget=()=>null}){
  const onStatus=(message)=>reportStatus(studioUiText(message,surface?.ownerDocument));
  if(!host||!surface||surface.contentEditable!=='true')
    throw new TypeError(studioUiText('Se requiere una superficie HTML editable.',surface?.ownerDocument));
  const doc=surface.ownerDocument;
  const wrapper=doc.createElement('div');wrapper.className='p2lrn-lesson-image-editor';
  const style=doc.createElement('style');style.textContent=STYLES+`\n.p2lrn-lesson-image-toolbar button[hidden],.p2lrn-lesson-media-options[hidden]{display:none!important}\n.p2lrn-lesson-media-options{border:1px solid #e2e8f0;border-radius:8px;background:#fbfcfe;margin:0 0 14px;overflow:hidden}\n.p2lrn-lesson-media-options>summary{padding:9px 12px;cursor:pointer;color:#475467;font:600 12px/1.35 system-ui,sans-serif}\n.p2lrn-lesson-media-options>summary:focus-visible{outline:2px solid #4776b6;outline-offset:-2px}\n.p2lrn-lesson-media-options[open] .p2lrn-lesson-image-toolbar{padding:10px 12px;border-top:1px solid #e2e8f0}\n`;
  style.textContent+='\n'+".p2lrn-lesson-image-editor{position:relative}\n.p2lrn-lesson-media-options[data-floating=true]{position:fixed!important;z-index:80;box-sizing:border-box;width:min(520px,calc(100vw - 16px));max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);box-shadow:0 12px 30px rgba(15,23,42,.16);overflow:auto}\n.p2lrn-lesson-media-selection{position:absolute;z-index:46;pointer-events:none;border:2px solid #3166ae;border-radius:6px;box-shadow:0 0 0 2px rgba(74,128,203,.12)}\n.p2lrn-lesson-media-selection[hidden],.p2lrn-lesson-media-options[hidden]{display:none!important}\n.p2lrn-lesson-image-toolbar [data-lesson-media-move]{cursor:grab;touch-action:none;background:#eef4ff;border-color:#b9cee9}\n.p2lrn-lesson-image-toolbar [data-lesson-media-move]:active{cursor:grabbing}\n.p2lrn-lesson-image-toolbar{padding:7px!important}\n.p2lrn-lesson-image-toolbar span{font-size:11px;max-width:260px}\n@media(max-width:740px){.p2lrn-lesson-media-options[data-floating=true]{width:calc(100vw - 16px);max-width:calc(100vw - 16px)}.p2lrn-lesson-image-toolbar{gap:4px}.p2lrn-lesson-image-toolbar button{min-height:32px;padding:6px 8px}}";
  const toolbar=doc.createElement('div');toolbar.className='p2lrn-lesson-image-toolbar';
  toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label',studioUiText('Imágenes y vídeos de la lección',doc));
  const button=(text,attr)=>{
    const b=doc.createElement('button');b.type='button';b.textContent=studioUiText(text,doc);b.setAttribute(attr,'');
    toolbar.append(b);return b;
  };
  const add=button('Insertar imagen','data-insert-lesson-image');
  const addVideo=button('Insertar vídeo','data-insert-lesson-video');
  if(preferRibbonInsert){add.hidden=true;addVideo.hidden=true;}
  const smaller=button('− Tamaño','data-lesson-image-smaller');
  const bigger=button('+ Tamaño','data-lesson-image-bigger');
  const remove=button('Eliminar recurso','data-lesson-image-remove');
  const move=button('Mover','data-lesson-media-move');move.title='Arrastra para mover la imagen o vídeo. Flechas para ajustes precisos.';
  const cover=button('Portada del vídeo','data-lesson-video-poster');
  const hint=doc.createElement('span');hint.textContent=studioUiText('Selecciona la imagen o vídeo; la barra permanece visible. Usa Mover o las flechas para colocarlo.',doc);
  toolbar.append(hint);
  const picker=doc.createElement('input');picker.type='file';picker.multiple=true;
  picker.accept='image/png,image/jpeg,image/gif,image/webp,image/avif';
  picker.hidden=true;picker.setAttribute('data-lesson-image-file','');
  const videoPicker=doc.createElement('input');videoPicker.type='file';videoPicker.multiple=true;
  videoPicker.accept='video/mp4,video/webm,.mp4,.webm';videoPicker.hidden=true;videoPicker.setAttribute('data-lesson-video-file','');
  const coverPicker=doc.createElement('input');coverPicker.type='file';coverPicker.accept=picker.accept;coverPicker.hidden=true;
  const options=doc.createElement('details');options.className='p2lrn-lesson-media-options';
  const summary=doc.createElement('summary');summary.textContent='Opciones de multimedia';
  summary.title='Abrir controles de tamaño, eliminación y portada de imágenes y vídeos';
  options.append(summary,toolbar);
  style.textContent+='\n.p2lrn-lesson-media-drop-target{outline:2px dashed #3779c3!important;outline-offset:3px!important}';
  const selectionFrame=doc.createElement('div');selectionFrame.className='p2lrn-lesson-media-selection';selectionFrame.hidden=true;
  wrapper.append(style,options,picker,videoPicker,coverPicker,surface,selectionFrame);host.append(wrapper);
  let selected=null,drag=null;
  // Ephemeral editor-only insertion context; never serialized into course HTML.
  surface.__p2lrnMediaInsertionTarget=()=>selected&&surface.contains(selected)?selected.parentElement:null;

  const currentCanvas=()=>surface.querySelector(':scope > [data-p2lrn-lesson-canvas]');
  function syncSelectionPosition(){
    const active=!!selected&&surface.contains(selected);
    if(!active){selectionFrame.hidden=true;options.hidden=preferRibbonInsert;return;}
    options.hidden=false;options.open=true;options.dataset.floating='true';
    selectionFrame.hidden=false;
    const relative=wrapper.getBoundingClientRect(),rect=selected.getBoundingClientRect();
    const left=rect.left-relative.left,top=rect.top-relative.top;
    selectionFrame.style.left=Math.round(left)+'px';
    selectionFrame.style.top=Math.round(top)+'px';
    selectionFrame.style.width=Math.round(rect.width)+'px';
    selectionFrame.style.height=Math.round(rect.height)+'px';
    // Fixed editor overlay: the media may be nested in a 60px table cell,
    // but the inspector must never inherit that cell's narrow width.
    const viewportWidth=Math.max(120,doc.defaultView?.innerWidth||doc.documentElement.clientWidth||390);
    const viewportHeight=Math.max(200,doc.defaultView?.innerHeight||doc.documentElement.clientHeight||840);
    const menuWidth=Math.min(viewportWidth-16,options.offsetWidth||420);
    const menuHeight=Math.min(viewportHeight-16,options.offsetHeight||75);
    const desiredLeft=clamp(rect.left,8,Math.max(8,viewportWidth-menuWidth-8));
    const above=rect.top-menuHeight-8;
    const below=rect.bottom+8;
    const desiredTop=above>=8?above:below+menuHeight<=viewportHeight-8?below:8;
    options.style.left=Math.round(desiredLeft)+'px';
    options.style.top=Math.round(clamp(desiredTop,8,Math.max(8,viewportHeight-menuHeight-8)))+'px';
  }
  const insertionContainer=(explicit=null)=>{
    const root=surface.getRootNode();
    const selection=typeof root.getSelection==='function'?root.getSelection():doc.getSelection();
    const caret=selection?.rangeCount&&surface.contains(selection.anchorNode)?selection.anchorNode:null;
    let target=explicit&&surface.contains(explicit)?explicit:(getInsertionTarget?.()||selected?.parentElement||null);
    // A visible caret after the last activity wins over a stale media/object
    // selection; do not insert new media back inside an old block.
    const diagramTarget=target?.matches?.('[data-p2lrn-layout="diagram-canvas"],[data-p2lrn-layout="diagram-group"]')||
      target?.closest?.('[data-p2lrn-layout="diagram-canvas"],[data-p2lrn-layout="diagram-group"]');
    if(caret&&target&&!target.contains(caret)&&target!==caret&&!diagramTarget)target=null;
    return studioNestedInsertionContainer(surface,{targetElement:target,anchorNode:caret});
  };
  const refresh=()=>{
    for(const b of [smaller,bigger,remove])b.disabled=!selected||!surface.contains(selected);
    cover.disabled=!selected?.matches?.(VIDEO);
    syncSelectionPosition();
  };
  const hydratedMedia=new WeakSet();
  function imagePosition(img){
    if(isDiagramMedia(img))return {
      x:clamp(parseFloat(img.style.left)||0,0,100),
      y:clamp(parseFloat(img.style.top)||0,0,100)
    };
    const rawX=img.dataset.p2lrnImageX;
    const rawY=img.dataset.p2lrnImageY;
    return {
      x:clamp(Number.isFinite(parseFloat(rawX))?parseFloat(rawX):(parseFloat(img.style.left)||0),0,100),
      y:clamp(Number.isFinite(parseFloat(rawY))?parseFloat(rawY):(parseFloat(img.style.top)||0),0,6000),
    };
  }
  function positiveMediaRatio(media){
    const w=media.matches(VIDEO)?media.videoWidth:media.naturalWidth;
    const h=media.matches(VIDEO)?media.videoHeight:media.naturalHeight;
    return Math.max(.05,Math.min(20,w>0&&h>0?w/h:(parseFloat(media.dataset.p2lrnImageRatio)||1.5)));
  }
  function reflowNestedMedia(media){
    const parent=media?.parentElement;
    if(!parent||parent===currentCanvas())return;
    if(isDiagramMedia(media)){
      if(!hydratedMedia.has(media)){
        hydratedMedia.add(media);
        media.addEventListener('click',()=>choose(media));
      }
      const ratio=positiveMediaRatio(media);
      media.style.position='absolute';media.style.float='none';media.style.clear='none';
      media.style.display='block';media.style.maxWidth='none';media.style.height='auto';
      media.style.margin='0';media.style.objectFit='contain';
      if(!media.style.left)media.style.left='8%';
      if(!media.style.top)media.style.top='8%';
      if(!media.style.width.endsWith('%'))media.style.width='20%';
      media.style.aspectRatio=String(ratio);
      return;
    }
    if(!hydratedMedia.has(media)){
      hydratedMedia.add(media);
      media.addEventListener('click',()=>choose(media));
      media.addEventListener(media.matches(VIDEO)?'loadedmetadata':'load',()=>{if(surface.contains(media)){reflow(currentCanvas());syncSelectionPosition();}});
    }
    const {x,y}=imagePosition(media);
    const width=Math.max(1,parent.clientWidth||parent.getBoundingClientRect().width||300);
    const size=clamp(parseFloat(media.style.width)||280,80,Math.min(800,width));
    const usable=Math.max(0,width-size-12);
    const offset=Math.round(clamp(x*width/100,0,usable));
    media.style.position='relative';media.style.left='';media.style.top='';
    media.style.float='none';media.style.clear='both';media.style.display='block';
    media.style.width=size+'px';media.style.maxWidth='100%';media.style.height='auto';
    media.style.marginLeft=offset+'px';media.style.marginTop=Math.round(y)+'px';
    media.style.marginRight='0';media.style.marginBottom='12px';
    const w=media.matches(VIDEO)?media.videoWidth:media.naturalWidth;
    const h=media.matches(VIDEO)?media.videoHeight:media.naturalHeight;
    const ratio=w>0&&h>0?w/h:parseFloat(media.dataset.p2lrnImageRatio)||1.5;
    media.dataset.p2lrnImageRatio=String(Math.max(.05,Math.min(20,ratio)));
    media.style.aspectRatio=String(Math.max(.05,Math.min(20,ratio)));
  }
  function reflow(box){
    if(!box)return;
    box.style.position='relative';
    box.style.display='flow-root';
    box.style.boxSizing='border-box';
    box.style.maxWidth='100%';
    // Old absolute-position canvases forced unused space below short texts.
    box.style.minHeight='0px';
    const canvasWidth=Math.max(1,box.clientWidth||box.getBoundingClientRect().width);
    const images=[...box.children].filter(node=>node.matches?.(MEDIA))
      .sort((a,b)=>imagePosition(a).y-imagePosition(b).y);
    // Floats must precede the text in DOM order to affect all of its lines.
    for(let index=0;index<images.length;index++){
      if(box.children[index]!==images[index])
        box.insertBefore(images[index],box.children[index]||null);
    }
    let previousBottom=0;
    for(const img of images){
      if(!hydratedMedia.has(img)){
        hydratedMedia.add(img);
        img.addEventListener('click',()=>choose(img));
        img.addEventListener(img.matches(VIDEO)?'loadedmetadata':'load',()=>{if(box.isConnected){reflow(box);syncSelectionPosition();}});
      }
      const {x,y}=imagePosition(img);
      img.dataset.p2lrnImageX=x.toFixed(3);
      img.dataset.p2lrnImageY=String(Math.round(y));
      const requestedWidth=clamp(parseFloat(img.style.width)||280,80,800);
      const measuredRatio=(img.matches(VIDEO)?img.videoWidth:img.naturalWidth)>0&&(img.matches(VIDEO)?img.videoHeight:img.naturalHeight)>0
        ?(img.matches(VIDEO)?img.videoWidth:img.naturalWidth)/(img.matches(VIDEO)?img.videoHeight:img.naturalHeight)
        :(parseFloat(img.dataset.p2lrnImageRatio)||1.5);
      const ratio=Math.max(.05,Math.min(20,measuredRatio));
      img.dataset.p2lrnImageRatio=String(ratio);
      const geometry=lessonImageFlowLayout({x,y,width:requestedWidth,height:requestedWidth/ratio},
        canvasWidth,previousBottom);
      previousBottom=geometry.nextBottom;
      img.style.position='relative';
      img.style.left='';
      img.style.top='';
      img.style.zIndex='';
      img.style.display='block';
      img.style.width=requestedWidth+'px';
      img.style.maxWidth='calc(100% - 12px)';
      img.style.height='auto';
      img.style.aspectRatio=String(ratio);
      for(const [name,value] of Object.entries(geometry.style))img.style[name]=value;
    }
    // Preserve nested DOM order: a media child stays in its section, cell or column.
    for(const media of box.querySelectorAll(MEDIA))if(media.parentElement!==box)reflowNestedMedia(media);
  }
  function ensureCanvas(){
    let box=currentCanvas();
    if(!box){
      box=doc.createElement('div');box.dataset.p2lrnLessonCanvas='1';
      while(surface.firstChild)box.append(surface.firstChild);
      surface.append(box);
    }
    reflow(box);
    return box;
  }
  function place(img,box,left,top){
    const scope=img.parentElement&&img.parentElement!==currentCanvas()?img.parentElement:box;
    if(isDiagramMedia(img)){
      const bounds=scope.getBoundingClientRect();
      if(!bounds.width||!bounds.height)return;
      const mediaWidth=img.getBoundingClientRect().width||bounds.width*.2;
      const mediaHeight=img.getBoundingClientRect().height||bounds.height*.2;
      img.style.left=(clamp(left,0,Math.max(0,bounds.width-mediaWidth))/bounds.width*100).toFixed(4)+'%';
      img.style.top=(clamp(top,0,Math.max(0,bounds.height-mediaHeight))/bounds.height*100).toFixed(4)+'%';
      img.dataset.p2lrnDiagramMedia='1';
      if(selected===img)syncSelectionPosition();
      return;
    }
    const width=Math.max(1,scope.getBoundingClientRect().width||scope.clientWidth);
    const imageWidth=img.getBoundingClientRect().width||Math.min(280,width);
    const x=clamp(left,0,Math.max(0,width-imageWidth));
    img.dataset.p2lrnImageX=(x/width*100).toFixed(3);
    img.dataset.p2lrnImageY=String(Math.round(clamp(top,0,6000)));
    reflow(currentCanvas()||box);
    if(selected===img)syncSelectionPosition();
  }
  const choose=img=>{if(!img||!surface.contains(img))return;const same=selected===img;selected=img;refresh();if(!same&&!img.matches(VIDEO))try{img.focus({preventScroll:true});}catch{}};
  const changed=()=>{ensureStudioEndCaret(surface);onChange();};
  async function insertImage(file,point=null,explicitTarget=null){
    const data=await lessonImageData(file);
    const box=ensureCanvas();
    const parent=insertionContainer(explicitTarget);
    const nested=!!parent&&parent!==box;
    const rect=box.getBoundingClientRect();
    const nonImages=[...box.children].filter(child=>child.nodeType===1&&!child.matches(MEDIA));
    const textBottom=nonImages.reduce((max,item)=>Math.max(max,item.getBoundingClientRect().bottom-rect.top),0);
    const lastBottom=[...box.querySelectorAll(MEDIA)].reduce((max,item)=>Math.max(max,imagePosition(item).y+(item.getBoundingClientRect().height||220)),0);
    const top=nested?0:point?point.y:Math.max(24,textBottom,lastBottom)+16;
    const img=doc.createElement('img');
    img.dataset.p2lrnLessonImage='1';img.alt=data.alt;img.src=data.src;
    img.setAttribute('contenteditable','false');img.setAttribute('draggable','false');
    img.tabIndex=0;img.title=studioUiText('Arrastra para colocar esta imagen en la lección',doc);
    img.style.cssText='position:relative;float:left;clear:both;width:280px;max-width:calc(100% - 12px);height:auto;';
    if(nested)parent.append(img);else box.prepend(img);
    if(nested&&isDiagramMedia(img)){
      img.style.width='20%';img.style.maxWidth='none';
      img.style.float='none';img.style.clear='none';img.style.margin='0';
      img.style.position='absolute';
      place(img,parent,parent.clientWidth*.08,parent.clientHeight*.08);
    }else place(img,nested?parent:box,nested?0:point?point.x:0,top);
    img.addEventListener('load',()=>{if(box.isConnected){reflow(box);changed();}},{once:true});
    choose(img);changed();
    onStatus(nested?'Imagen insertada dentro del elemento seleccionado.':'Imagen insertada. Usa Mover para recolocarla.');
    return img;
  }

  async function insertVideo(file,point=null,explicitTarget=null){
    const data=await lessonVideoData(file);
    const box=ensureCanvas();
    const parent=insertionContainer(explicitTarget);
    const nested=!!parent&&parent!==box;
    const rect=box.getBoundingClientRect();
    const content=[...box.children].filter(child=>child.nodeType===1&&!child.matches(MEDIA));
    const textBottom=content.reduce((max,item)=>Math.max(max,item.getBoundingClientRect().bottom-rect.top),0);
    const lastBottom=[...box.querySelectorAll(MEDIA)].reduce((max,item)=>Math.max(max,imagePosition(item).y+(item.getBoundingClientRect().height||220)),0);
    const top=nested?0:point?point.y:Math.max(24,textBottom,lastBottom)+16;
    const video=doc.createElement('video');
    video.dataset.p2lrnLessonVideo='1';video.src=data.src;
    video.controls=true;video.preload='metadata';video.playsInline=true;
    video.dataset.p2lrnImageRatio=String(16/9);
    video.setAttribute('contenteditable','false');video.setAttribute('draggable','false');
    video.tabIndex=0;video.title='Selecciona para cambiar el tamaño. Alt + arrastrar para mover.';
    video.setAttribute('aria-label',data.label);
    video.style.cssText='position:relative;float:left;clear:both;width:420px;max-width:calc(100% - 12px);height:auto;aspect-ratio:16 / 9;';
    if(nested)parent.append(video);else box.prepend(video);
    place(video,nested?parent:box,nested?0:point?point.x:0,top);
    video.addEventListener('loadedmetadata',()=>{if(box.isConnected){reflow(box);changed();}},{once:true});
    choose(video);changed();
    onStatus(nested?'Vídeo insertado dentro del elemento seleccionado.':'Vídeo insertado. Usa Mover sin afectar a la reproducción.');
    return video;
  }

  async function addFiles(files,point=null,targetElement=null){
    for(const file of files)try{
      if(file.type.startsWith('video/')||/\.(?:mp4|webm)$/i.test(file.name||''))await insertVideo(file,point,targetElement);
      else await insertImage(file,point,targetElement);
    }
    catch(error){onStatus(String(error?.message||error));}
  }
  add.addEventListener('click',()=>picker.click());
  addVideo.addEventListener('click',()=>videoPicker.click());
  videoPicker.addEventListener('change',()=>{const files=[...videoPicker.files||[]];videoPicker.value='';void addFiles(files);});
  cover.addEventListener('click',()=>{if(selected?.matches?.(VIDEO))coverPicker.click();});
  coverPicker.addEventListener('change',async()=>{const file=coverPicker.files?.[0];coverPicker.value='';if(!file||!selected?.matches?.(VIDEO))return;try{const data=await lessonImageData(file);selected.poster=data.src;changed();onStatus('Portada del vídeo guardada.');}catch(error){onStatus(String(error?.message||error));}});
  picker.addEventListener('change',()=>{const files=[...picker.files||[]];picker.value='';void addFiles(files);});
  surface.addEventListener('paste',event=>{
    const files=[...event.clipboardData?.items||[]].filter(item=>item.kind==='file'&&item.type.startsWith('image/'))
      .map(item=>item.getAsFile()).filter(Boolean);
    if(files.length){event.preventDefault();void addFiles(files);}
  });
  surface.addEventListener('dragover',event=>{
    if(event.dataTransfer?.types?.includes('Files')){event.preventDefault();event.dataTransfer.dropEffect='copy';}
  });
  surface.addEventListener('drop',event=>{
    const files=[...event.dataTransfer?.files||[]];if(!files.length)return;
    event.preventDefault();event.stopPropagation();
    const rect=(currentCanvas()||surface).getBoundingClientRect();
    const target=event.target.closest?.('td,th,[data-p2lrn-layout]');
    void addFiles(files,{x:event.clientX-rect.left,y:event.clientY-rect.top},target);
  });
  const resize=step=>{
    if(!selected||!surface.contains(selected))return;
    const box=currentCanvas();if(!box)return;
    if(isDiagramMedia(selected)){
      const parent=selected.parentElement,rect=parent.getBoundingClientRect();
      const before=imagePosition(selected);
      const current=selected.getBoundingClientRect().width;
      selected.style.width=(clamp(current+step,32,rect.width)/rect.width*100).toFixed(4)+'%';
      place(selected,parent,rect.width*before.x/100,rect.height*before.y/100);
    }else{
      selected.style.width=clamp((parseInt(selected.style.width,10)||280)+step,80,800)+'px';
      place(selected,box,box.clientWidth*imagePosition(selected).x/100,imagePosition(selected).y);
    }
    changed();syncSelectionPosition();
  };
  smaller.addEventListener('click',()=>resize(-60));bigger.addEventListener('click',()=>resize(60));
  const deleteImage=()=>{if(!selected)return;selected.remove();selected=null;refresh();changed();onStatus('Imagen eliminada de la lección.');};
  remove.addEventListener('click',deleteImage);
  // Selection is changed on pointer DOWN, never on the click generated after a drag.
  // This prevents a released image/video from losing its editing toolbar.
  let pendingMediaDrop=null;
  function possibleMediaDrop(event,source){
    const root=surface.getRootNode();
    const hits=root.elementsFromPoint?.(event.clientX,event.clientY)||
      doc.elementsFromPoint?.(event.clientX,event.clientY)||[];
    for(const hit of hits){
      if(!surface.contains(hit)||source.contains(hit))continue;
      const candidate=hit.closest?.('td,th,[data-p2lrn-layout]');
      if(!candidate||candidate===source||candidate.contains(source))continue;
      const target=studioNestedInsertionContainer(surface,{targetElement:candidate,anchorNode:hit});
      if(target&&target!==source.parentElement&&!source.contains(target))return target;
    }
    return null;
  }
  function markMediaDrop(target){
    if(pendingMediaDrop===target)return;
    pendingMediaDrop?.classList.remove('p2lrn-lesson-media-drop-target');
    pendingMediaDrop=target;
    pendingMediaDrop?.classList.add('p2lrn-lesson-media-drop-target');
  }
  function beginDrag(event,img,owner){
    if(event.button!==0||!img||!surface.contains(img))return;
    event.preventDefault();
    const box=img.parentElement&&img.parentElement!==currentCanvas()?img.parentElement:currentCanvas();
    if(!box)return;
    const position=imagePosition(img);
    drag={img,box,startX:event.clientX,startY:event.clientY,
      baseX:(box.clientWidth||box.getBoundingClientRect().width)*position.x/100,
      baseY:isDiagramMedia(img)?(box.clientHeight||box.getBoundingClientRect().height)*position.y/100:position.y,
      oldTransform:img.style.transform||'',
      moved:false,pointerId:event.pointerId,owner};
    try{owner.setPointerCapture?.(event.pointerId);}catch{}
  }
  function moveDrag(event){
    if(!drag||event.pointerId!==drag.pointerId)return;
    if(event.cancelable)event.preventDefault();
    const dx=event.clientX-drag.startX,dy=event.clientY-drag.startY;
    if(!drag.moved&&Math.hypot(dx,dy)<2)return;
    drag.moved=true;
    // Preview movement without reflowing the source or moving drop targets.
    drag.img.style.transform=(drag.oldTransform?drag.oldTransform+' ':'')+
      'translate3d('+Math.round(dx)+'px,'+Math.round(dy)+'px,0)';
    drag.img.style.willChange='transform';
    if(!isDiagramMedia(drag.img))markMediaDrop(possibleMediaDrop(event,drag.img));
    syncSelectionPosition();
  }
  function finishDrag(event){
    if(!drag||drag.pointerId!==event.pointerId)return;
    const result=drag;drag=null;
    try{result.owner.releasePointerCapture?.(event.pointerId);}catch{}
    const dx=event.clientX-result.startX,dy=event.clientY-result.startY;
    // Re-evaluate the target with the stable source layout before committing.
    if(result.moved&&!isDiagramMedia(result.img))markMediaDrop(possibleMediaDrop(event,result.img));
    const destination=pendingMediaDrop;markMediaDrop(null);
    result.img.style.transform=result.oldTransform;result.img.style.willChange='';
    if(result.moved&&destination&&destination!==result.img.parentElement&&!result.img.contains(destination)){
      destination.append(result.img);
      result.img.dataset.p2lrnImageX='0';result.img.dataset.p2lrnImageY='0';
      reflow(currentCanvas());
      onStatus('Imagen o vídeo anidado dentro del contenedor de destino.');
    }else if(result.moved){
      place(result.img,result.box,result.baseX+dx,result.baseY+dy);
    }
    if(result.moved)changed();
    refresh();
  }
  surface.addEventListener('pointerdown',event=>{
    const img=event.target?.closest?.(MEDIA);
    if(!img||!surface.contains(img)){
      if(selected){selected=null;refresh();}
      return;
    }
    choose(img);
    // Native video controls stay functional; use Mover or Alt+drag for position.
    if(img.matches(VIDEO)&&!event.altKey)return;
    beginDrag(event,img,surface);
  });
  surface.addEventListener('pointermove',moveDrag);
  surface.addEventListener('pointerup',finishDrag);
  surface.addEventListener('pointercancel',finishDrag);
  move.addEventListener('pointerdown',event=>{if(selected)beginDrag(event,selected,move);});
  move.addEventListener('pointermove',moveDrag);
  move.addEventListener('pointerup',finishDrag);
  move.addEventListener('pointercancel',finishDrag);
  function nudgeSelected(delta,step){
    if(!selected||!surface.contains(selected))return;
    const box=selected.parentElement&&selected.parentElement!==currentCanvas()?selected.parentElement:currentCanvas();
    if(!box)return;
    const pos=imagePosition(selected);
    place(selected,box,box.clientWidth*pos.x/100+delta[0]*step,
      isDiagramMedia(selected)?box.clientHeight*pos.y/100+delta[1]*step:pos.y+delta[1]*step);
    changed();syncSelectionPosition();
  }
  const keyDelta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
  move.addEventListener('keydown',event=>{
    const delta=keyDelta[event.key];if(!delta)return;
    event.preventDefault();nudgeSelected(delta,event.shiftKey?10:2);
  });
  surface.addEventListener('keydown',event=>{
    if(event.target!==selected||!selected)return;
    if(['Delete','Backspace'].includes(event.key)){event.preventDefault();deleteImage();return;}
    // Preserve native keyboard seek controls when a video itself is focused.
    if(selected.matches(VIDEO)&&!event.altKey)return;
    const delta=keyDelta[event.key];if(!delta)return;
    event.preventDefault();nudgeSelected(delta,event.shiftKey?10:2);
  });
  const onMediaScroll=()=>{
    if(!wrapper.isConnected){doc.removeEventListener('scroll',onMediaScroll,true);return;}
    syncSelectionPosition();
  };
  doc.addEventListener('scroll',onMediaScroll,true);
  // Convert existing absolute-position images without deleting the content.
  // Normalization persists into the same portable HTML payload.
  const initial=currentCanvas();
  if(initial){
    const legacy=[...initial.querySelectorAll(IMAGE)].some(img=>
      img.style.position==='absolute'||!img.dataset.p2lrnImageX);
    reflow(initial);
    if(legacy)changed();
  }
  if(typeof ResizeObserver!=='undefined'){
    const observer=new ResizeObserver(()=>{
      if(!wrapper.isConnected){observer.disconnect();return;}
      const box=currentCanvas();if(box)reflow(box);syncSelectionPosition();
    });
    observer.observe(surface);
  }
  // The last section of a lesson must remain editable, even when it ends in
  // an interactive block or large video with no natural text caret below.
  ensureStudioEndCaret(surface);
  surface.addEventListener('input',()=>ensureStudioEndCaret(surface));
  style.textContent+='\n'+'.p2lrn-lesson-image-editor p[data-p2lrn-end-caret]{min-height:32px;padding:5px 2px;margin:16px 0 0;cursor:text;outline-offset:3px}'+
    '\n'+'.p2lrn-lesson-image-editor p[data-p2lrn-end-caret]:not(:focus)::before{content:'+JSON.stringify(studioUiText('Escribe o inserta aquí, después de la última actividad',surface.ownerDocument))+';pointer-events:none;color:#64748b;font:400 12px/1.5 system-ui,sans-serif}';
  refresh();
  return {openPicker:()=>picker.click(),openVideoPicker:()=>videoPicker.click(),insertImage,insertVideo,element:wrapper};
}
