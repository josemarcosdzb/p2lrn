// Shared by the website Studio and npm Studio. Images remain inside the
// portable HTML payload; the passive-text Player's CSP permits img-src data:.
export const MAX_LESSON_IMAGE_BYTES=8*1024*1024;
const IMAGE='img[data-p2lrn-lesson-image]';
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
  const alt=String(file.name||'Imagen').replace(/\.[^.]+$/,'').slice(0,160)||'Imagen';
  return {src,alt,mediaType,bytes:bytes.byteLength};
}
const STYLES=".p2lrn-lesson-image-editor{display:grid;gap:8px;min-width:0;max-width:100%}\n.p2lrn-lesson-image-toolbar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;min-height:34px}\n.p2lrn-lesson-image-toolbar button{min-height:32px;padding:6px 10px;border:1px solid #cfd8e4;border-radius:7px;background:#fff;color:#172033;font:600 12px/1.2 system-ui,sans-serif;cursor:pointer}\n.p2lrn-lesson-image-toolbar button:hover:not(:disabled){background:#eef3f9}\n.p2lrn-lesson-image-toolbar button:disabled{opacity:.45;cursor:default}\n.p2lrn-lesson-image-toolbar span{color:#64748b;font:11px/1.35 system-ui,sans-serif}\n.p2lrn-lesson-image-editor [data-p2lrn-lesson-image]{cursor:grab;touch-action:none;user-select:none;object-fit:contain}\n.p2lrn-lesson-image-editor [data-p2lrn-lesson-image]:hover,.p2lrn-lesson-image-editor [data-p2lrn-lesson-image]:focus-visible{outline:2px solid #437ddd;outline-offset:2px}\n.p2lrn-lesson-image-editor [data-p2lrn-lesson-image]:active{cursor:grabbing}\n.p2lrn-lesson-image-editor .surface img,.p2lrn-lesson-image-editor .studio-wysiwyg img{height:auto}";

export function mountLessonImageEditor({host,surface,onChange=()=>{},onStatus=()=>{}}){
  if(!host||!surface||surface.contentEditable!=='true')
    throw new TypeError('Se requiere una superficie HTML editable.');
  const doc=surface.ownerDocument;
  const wrapper=doc.createElement('div');wrapper.className='p2lrn-lesson-image-editor';
  const style=doc.createElement('style');style.textContent=STYLES;
  const toolbar=doc.createElement('div');toolbar.className='p2lrn-lesson-image-toolbar';
  toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','Imágenes de la lección');
  const button=(text,attr)=>{
    const b=doc.createElement('button');b.type='button';b.textContent=text;b.setAttribute(attr,'');
    toolbar.append(b);return b;
  };
  const add=button('Insertar imagen','data-insert-lesson-image');
  const smaller=button('− Tamaño','data-lesson-image-smaller');
  const bigger=button('+ Tamaño','data-lesson-image-bigger');
  const remove=button('Eliminar imagen','data-lesson-image-remove');
  const hint=doc.createElement('span');hint.textContent='Arrastra, pega o elige imágenes; haz clic para moverlas.';
  toolbar.append(hint);
  const picker=doc.createElement('input');picker.type='file';picker.multiple=true;
  picker.accept='image/png,image/jpeg,image/gif,image/webp,image/avif';
  picker.hidden=true;picker.setAttribute('data-lesson-image-file','');
  wrapper.append(style,toolbar,picker,surface);host.append(wrapper);
  let selected=null,drag=null;
  const currentCanvas=()=>surface.querySelector(':scope > [data-p2lrn-lesson-canvas]');
  const refresh=()=>{for(const b of [smaller,bigger,remove])b.disabled=!selected||!surface.contains(selected);};
  function ensureCanvas(){
    let box=currentCanvas();if(box)return box;
    box=doc.createElement('div');box.dataset.p2lrnLessonCanvas='1';
    box.style.cssText='position:relative;min-height:360px;max-width:100%;box-sizing:border-box;';
    while(surface.firstChild)box.append(surface.firstChild);
    surface.append(box);return box;
  }
  function grow(box,img,top){
    const height=img.getBoundingClientRect().height||Math.min(250,parseInt(img.style.width,10)||280);
    box.style.minHeight=Math.max(360,parseInt(box.style.minHeight,10)||360,Math.ceil(top+height+20))+'px';
  }
  function place(img,box,left,top,expand=false){
    const width=Math.max(1,box.getBoundingClientRect().width||box.clientWidth);
    const imgWidth=img.getBoundingClientRect().width||Math.min(280,width);
    const imgHeight=img.getBoundingClientRect().height||180;
    const x=clamp(left,0,Math.max(0,width-imgWidth));
    const y=clamp(top,0,expand?Math.max(0,top):Math.max(0,box.clientHeight-imgHeight));
    const percent=x/width*100;
    img.style.left=percent.toFixed(3)+'%';img.style.top=Math.round(y)+'px';
    img.style.maxWidth='calc('+(100-percent).toFixed(3)+'% - 4px)';
    if(expand)grow(box,img,y);
  }
  const choose=img=>{selected=img;refresh();try{img.focus({preventScroll:true});}catch{}};
  const changed=()=>onChange();
  async function insertImage(file,point=null){
    const data=await lessonImageData(file);
    const box=ensureCanvas();
    const rect=box.getBoundingClientRect();
    const nonImages=[...box.children].filter(child=>child.nodeType===1&&!child.matches(IMAGE));
    const textBottom=nonImages.reduce((max,item)=>Math.max(max,item.getBoundingClientRect().bottom-rect.top),0);
    const lastBottom=[...box.querySelectorAll(IMAGE)].reduce((max,item)=>Math.max(max,(parseFloat(item.style.top)||0)+(item.getBoundingClientRect().height||220)),0);
    const top=point?point.y:Math.max(24,textBottom,lastBottom)+16;
    const img=doc.createElement('img');
    img.dataset.p2lrnLessonImage='1';img.alt=data.alt;img.src=data.src;
    img.setAttribute('contenteditable','false');img.setAttribute('draggable','false');
    img.tabIndex=0;img.title='Arrastra para colocar esta imagen en la lección';
    img.style.cssText='position:absolute;top:0;left:0;width:280px;max-width:calc(100% - 4px);height:auto;z-index:1;';
    box.append(img);place(img,box,point?point.x:0,top,true);
    img.addEventListener('load',()=>{if(box.isConnected){grow(box,img,parseFloat(img.style.top)||0);changed();}},{once:true});
    choose(img);changed();
    onStatus('Imagen incrustada en la lección. Puedes moverla arrastrando.');
    return img;
  }
  async function addFiles(files,point=null){
    for(const file of files)try{await insertImage(file,point);}
    catch(error){onStatus(String(error?.message||error));}
  }
  add.addEventListener('click',()=>picker.click());
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
    void addFiles(files,{x:event.clientX-rect.left,y:event.clientY-rect.top});
  });
  const resize=step=>{
    if(!selected||!surface.contains(selected))return;
    const box=currentCanvas();if(!box)return;
    selected.style.width=clamp((parseInt(selected.style.width,10)||280)+step,80,800)+'px';
    place(selected,box,box.clientWidth*(parseFloat(selected.style.left)||0)/100,parseFloat(selected.style.top)||0,true);
    changed();
  };
  smaller.addEventListener('click',()=>resize(-60));bigger.addEventListener('click',()=>resize(60));
  const deleteImage=()=>{if(!selected)return;selected.remove();selected=null;refresh();changed();onStatus('Imagen eliminada de la lección.');};
  remove.addEventListener('click',deleteImage);
  surface.addEventListener('pointerdown',event=>{
    const img=event.target?.closest?.(IMAGE);
    if(!img||!surface.contains(img))return;
    event.preventDefault();choose(img);
    const rect=img.getBoundingClientRect();
    drag={img,box:currentCanvas(),x:event.clientX-rect.left,y:event.clientY-rect.top,moved:false};
    try{surface.setPointerCapture(event.pointerId);}catch{}
  });
  surface.addEventListener('pointermove',event=>{
    if(!drag)return;
    const {img,box}=drag;const rect=box.getBoundingClientRect();
    const before=img.style.left+','+img.style.top;
    place(img,box,event.clientX-rect.left-drag.x,event.clientY-rect.top-drag.y);
    if(before!==img.style.left+','+img.style.top)drag.moved=true;
  });
  const finish=event=>{
    if(!drag)return;const moved=drag.moved;drag=null;
    try{surface.releasePointerCapture(event.pointerId);}catch{}
    if(moved)changed();
  };
  surface.addEventListener('pointerup',finish);surface.addEventListener('pointercancel',finish);
  surface.addEventListener('keydown',event=>{
    if(event.target!==selected||!selected)return;
    if(['Delete','Backspace'].includes(event.key)){event.preventDefault();deleteImage();return;}
    const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
    if(!delta)return;
    event.preventDefault();
    const box=currentCanvas(),step=event.shiftKey?10:2;
    place(selected,box,box.clientWidth*(parseFloat(selected.style.left)||0)/100+delta[0]*step,(parseFloat(selected.style.top)||0)+delta[1]*step);
    changed();
  });
  refresh();
  return {openPicker:()=>picker.click(),insertImage,element:wrapper};
}
