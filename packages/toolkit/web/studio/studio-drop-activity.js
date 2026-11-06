// Drag-and-drop lesson authoring. Only inert HTML, text, images and constrained
// data attributes are saved. The Player activates this markup inside a sandbox.
const MAX_IMAGE_BYTES=5*1024*1024;
const ALLOWED_IMAGE=new Set(['image/png','image/jpeg','image/webp','image/gif','image/avif']);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const element=(doc,tag,attrs={})=>{
  const node=doc.createElement(tag);
  for(const [key,value] of Object.entries(attrs)){
    if(key==='text')node.textContent=value;
    else if(key==='style')Object.assign(node.style,value);
    else node.setAttribute(key,value);
  }
  return node;
};
const percent=(value)=>Math.round(clamp(value,0,100)*10)/10+'%';
export function addStudioDropPair(section,{x=10,y=14,width=33,height=26}={}){
  const board=section?.querySelector('[data-p2lrn-dnd-board]');
  const tray=section?.querySelector('[data-p2lrn-dnd-tray]');
  if(!board||!tray)throw new Error('Selecciona una actividad de arrastrar y soltar.');
  if(board.querySelectorAll('[data-p2lrn-dnd-zone]').length>=20)
    throw new RangeError('Máximo de 20 zonas por actividad.');
  const existing=[...section.querySelectorAll('[data-p2lrn-dnd-item]')].map(node=>Number(node.dataset.p2lrnDndItem?.replace('item-',''))||0);
  const id='item-'+(Math.max(0,...existing)+1);
  const ordinal=existing.length+1;
  const zone=element(section.ownerDocument,'div',{
    'data-p2lrn-dnd-zone':'zone-'+id,
    'data-p2lrn-dnd-accept':id,
    role:'group','aria-label':'Zona de destino '+ordinal,
    style:{
      position:'absolute',left:percent(x),top:percent(y),
      width:percent(width),height:percent(height),minWidth:'28px',minHeight:'32px',
      display:'flex',alignItems:'center',justifyContent:'center',
      boxSizing:'border-box',padding:'8px',border:'2px dashed #1d4ed8',
      borderRadius:'8px',backgroundColor:'rgba(255,255,255,.83)',
      color:'#172554',fontSize:'16px',fontWeight:'650',textAlign:'center',
      cursor:'move',overflow:'hidden',
    },
  });
  zone.append(element(section.ownerDocument,'span',{
    'data-p2lrn-dnd-label':'',text:'Destino '+ordinal,
  }));
  const item=element(section.ownerDocument,'span',{
    'data-p2lrn-dnd-item':id,
    role:'listitem',
    style:{
      display:'inline-flex',alignItems:'center',justifyContent:'center',
      minWidth:'92px',minHeight:'42px',padding:'9px 13px',
      border:'1px solid #94a3b8',borderRadius:'8px',
      backgroundColor:'#fff',color:'#172554',fontWeight:'650',
      cursor:'grab',touchAction:'none',boxSizing:'border-box',
    },
    text:'Ficha '+ordinal,
  });
  board.append(zone);
  tray.append(item);
  return {zone,item};
}
export function createStudioDropActivity(doc){
  const section=element(doc,'section',{
    'data-p2lrn-layout':'drag-drop',
    'data-p2lrn-dnd':'1',
    style:{
      display:'block',width:'100%',maxWidth:'100%',boxSizing:'border-box',
      padding:'16px',margin:'20px 0',border:'1px solid #94a3b8',
      borderRadius:'12px',backgroundColor:'#f8fafc',color:'#0f172a',
    },
  });
  section.append(element(doc,'h3',{text:'Arrastra cada ficha a su lugar',
    style:{margin:'0 0 7px',fontSize:'21px',fontWeight:'700'}}));
  section.append(element(doc,'p',{text:'Coloca las fichas en las zonas de destino. También puedes seleccionar una ficha y después su zona.',
    style:{margin:'0 0 12px',fontSize:'14px',color:'#334155'}}));
  const board=element(doc,'div',{
    'data-p2lrn-dnd-board':'',
    role:'group','aria-label':'Escenario con zonas de destino',
    style:{
      position:'relative',isolation:'isolate',width:'100%',minHeight:'240px',
      aspectRatio:'16 / 9',boxSizing:'border-box',overflow:'hidden',
      border:'2px solid #94a3b8',borderRadius:'10px',
      backgroundColor:'#dbeafe',backgroundSize:'cover',backgroundPosition:'center',
    },
  });
  const tray=element(doc,'div',{
    'data-p2lrn-dnd-tray':'',
    role:'list','aria-label':'Fichas para arrastrar',
    style:{
      display:'flex',flexWrap:'wrap',gap:'10px',alignItems:'center',
      padding:'13px',marginTop:'12px',minHeight:'64px',
      backgroundColor:'#e2e8f0',borderRadius:'10px',
    },
  });
  const status=element(doc,'p',{
    'data-p2lrn-dnd-status':'',
    role:'status','aria-live':'polite',
    style:{minHeight:'1.4em',fontSize:'14px',color:'#1e3a8a',margin:'10px 0 0'},
    text:'Selecciona una ficha y su zona, o arrástrala.',
  });
  section.append(board,tray,status);
  addStudioDropPair(section,{x:10,y:18,width:34,height:27});
  addStudioDropPair(section,{x:55,y:53,width:34,height:27});
  return section;
}
export function isStudioDropActivity(node){
  return node?.matches?.('[data-p2lrn-dnd="1"]')===true;
}
export function removeStudioDropPair(section,zone){
  if(!isStudioDropActivity(section)||!zone||!section.contains(zone))return false;
  const id=zone.dataset.p2lrnDndAccept;
  zone.remove();
  section.querySelectorAll('[data-p2lrn-dnd-item]').forEach(item=>{
    if(item.dataset.p2lrnDndItem===id)item.remove();
  });
  return true;
}
export async function setStudioDropBackground(section,file){
  if(!isStudioDropActivity(section))throw new Error('Selecciona una actividad de arrastrar y soltar.');
  if(!file||!ALLOWED_IMAGE.has(file.type)||file.size<=0||file.size>MAX_IMAGE_BYTES)
    throw new Error('Elige una imagen PNG, JPEG, WebP, GIF o AVIF de hasta 5 MB.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  let text='';
  // Chunking avoids argument limits and works in the browser's isolated Studio.
  for(let offset=0;offset<bytes.length;offset+=8192)
    text+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
  const data='data:'+file.type+';base64,'+btoa(text);
  const board=section.querySelector('[data-p2lrn-dnd-board]');
  if(!board)throw new Error('Escenario de destino no disponible.');
  const old=board.querySelector('[data-p2lrn-dnd-image]');
  const image=element(section.ownerDocument,'img',{
    'data-p2lrn-dnd-image':'',src:data,
    alt:file.name?.replace(/\.[^.]+$/,'')||'Imagen de fondo',
    style:{
      position:'absolute',inset:'0',width:'100%',height:'100%',
      objectFit:'contain',pointerEvents:'none',
    },
  });
  if(old)old.replaceWith(image);else board.prepend(image);
  return image;
}
export function removeStudioDropBackground(section){
  if(!isStudioDropActivity(section))return false;
  const image=section.querySelector('[data-p2lrn-dnd-image]');
  if(!image)return false;
  image.remove();return true;
}
export function mountStudioDropAuthoring({surface,onSelected=()=>{},onChange=()=>{}}={}){
  if(!surface?.isContentEditable)throw new TypeError('Editor HTML no disponible.');
  let selected=null,drag=null;
  const clear=()=>{selected?.removeAttribute('data-p2lrn-studio-zone-selected');selected=null;onSelected(null);};
  const select=zone=>{
    if(selected===zone)return;
    selected?.removeAttribute('data-p2lrn-studio-zone-selected');
    selected=zone&&surface.contains(zone)?zone:null;
    if(selected)selected.dataset.p2lrnStudioZoneSelected='true';
    onSelected(selected);
  };
  const onPointerDown=event=>{
    const zone=event.target.closest?.('[data-p2lrn-dnd-zone]');
    if(!zone||!surface.contains(zone)||event.button!==0||event.detail>1)return;
    const board=zone.closest('[data-p2lrn-dnd-board]');
    if(!board)return;
    const box=board.getBoundingClientRect(),bounds=zone.getBoundingClientRect();
    const resize=event.clientX>=bounds.right-23&&event.clientY>=bounds.bottom-23;
    select(zone);
    drag={
      id:event.pointerId,zone,box,mode:resize?'resize':'move',
      x:event.clientX,y:event.clientY,
      left:parseFloat(zone.style.left)||0,top:parseFloat(zone.style.top)||0,
      width:parseFloat(zone.style.width)||25,height:parseFloat(zone.style.height)||25,
      changed:false,
    };
    event.preventDefault();
    try{zone.setPointerCapture(event.pointerId);}catch{}
  };
  const onPointerMove=event=>{
    if(!drag||drag.id!==event.pointerId)return;
    const item=drag,dx=100*(event.clientX-item.x)/Math.max(1,item.box.width);
    const dy=100*(event.clientY-item.y)/Math.max(1,item.box.height);
    if(item.mode==='move'){
      item.zone.style.left=percent(clamp(item.left+dx,0,100-item.width));
      item.zone.style.top=percent(clamp(item.top+dy,0,100-item.height));
    }else{
      item.zone.style.width=percent(clamp(item.width+dx,8,100-item.left));
      item.zone.style.height=percent(clamp(item.height+dy,8,100-item.top));
    }
    item.changed=true;
    event.preventDefault();
  };
  const onPointerUp=event=>{
    if(!drag||drag.id!==event.pointerId)return;
    const {zone,changed}=drag;
    drag=null;
    try{zone.releasePointerCapture(event.pointerId);}catch{}
    if(changed)onChange();
  };
  const onClick=event=>{
    if(event.target.closest?.('[data-p2lrn-dnd-zone]'))return;
    if(!event.target.closest?.('[data-p2lrn-dnd="1"]'))clear();
  };
  surface.addEventListener('pointerdown',onPointerDown);
  surface.addEventListener('pointermove',onPointerMove);
  surface.addEventListener('pointerup',onPointerUp);
  surface.addEventListener('pointercancel',onPointerUp);
  surface.addEventListener('click',onClick);
  return {get selectedZone(){return selected&&surface.contains(selected)?selected:null;},
    select,dispose(){
      clear();drag=null;
      surface.removeEventListener('pointerdown',onPointerDown);
      surface.removeEventListener('pointermove',onPointerMove);
      surface.removeEventListener('pointerup',onPointerUp);
      surface.removeEventListener('pointercancel',onPointerUp);
      surface.removeEventListener('click',onClick);
    },
  };
}
