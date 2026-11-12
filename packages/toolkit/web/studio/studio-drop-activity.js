import {studioUiText} from './studio-ui-i18n.js';

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
  // Keep displayed numbers unique after deleting a middle zone and adding another.
  const ordinal=Number(id.slice('item-'.length));
  const zone=element(section.ownerDocument,'div',{
    'data-p2lrn-dnd-zone':'zone-'+id,
    'data-p2lrn-dnd-accept':id,
    role:'group','aria-label':'Zona de destino '+ordinal,
    style:{
      position:'absolute',left:percent(x),top:percent(y),
      width:percent(width),height:percent(height),minWidth:'28px',minHeight:'32px',
      display:'flex',alignItems:'center',justifyContent:'center',
      boxSizing:'border-box',padding:'8px',border:'2px dashed #1d4ed8',
      borderRadius:'8px',backgroundColor:'transparent',
      color:'#172554',fontSize:'16px',fontWeight:'650',textAlign:'center',
      cursor:'move',touchAction:'none',overflow:'hidden',
    },
  });
  zone.append(element(section.ownerDocument,'span',{
    'data-p2lrn-dnd-label':'',text:'Destino '+ordinal,
  }));
  const item=element(section.ownerDocument,'span',{
    'data-p2lrn-dnd-item':id,
    role:'listitem',
    style:{
      display:'inline-flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'6px',
      minWidth:'106px',minHeight:'48px',padding:'9px 13px',
      border:'1px solid #94a3b8',borderRadius:'8px',
      backgroundColor:'#fff',color:'#172554',fontWeight:'650',
      cursor:'grab',touchAction:'none',boxSizing:'border-box',
    },
  });
  item.append(element(section.ownerDocument,'span',{
    'data-p2lrn-dnd-text':'',text:'',
    style:{display:'none',width:'100%',fontSize:'16px',lineHeight:'1.35',textAlign:'center',whiteSpace:'normal',overflowWrap:'anywhere'},
  }));
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
function findDropItem(section,item){
  return isStudioDropActivity(section)&&item?.matches?.('[data-p2lrn-dnd-item]')&&section.contains(item);
}
export function getStudioDropItemText(item){
  const label=item?.querySelector?.('[data-p2lrn-dnd-text]');
  if(label)return label.textContent?.trim()||'';
  // Earlier courses stored the text directly inside the tile.
  return [...(item?.childNodes??[])].filter(node=>node.nodeType===3)
    .map(node=>node.textContent||'').join('').trim();
}
// Older lessons generated "Ficha N" as if it were authored text. Once an
// image is attached, this automatically generated caption must not appear.
export function normalizeStudioDropImageTile(item){
  const image=item?.querySelector?.('[data-p2lrn-dnd-item-image]');
  if(!image)return false;
  let modified=false;
  const caption=item.querySelector('[data-p2lrn-dnd-text]');
  const index=Number(String(item.dataset?.p2lrnDndItem||'').replace(/^item-/,''));
  if(caption&&Number.isInteger(index)&&index>0&&caption.textContent?.trim()==='Ficha '+index){
    caption.remove();modified=true;
  }
  // No opaque tile plate may be composited behind a transparent PNG.
  for(const [property,value] of [['backgroundColor','transparent'],['borderColor','transparent'],['padding','0px']]){
    if(item.style[property]!==value){item.style[property]=value;modified=true;}
  }
  return modified;
}
export function setStudioDropItemText(section,item,text){
  if(!findDropItem(section,item))throw new Error('Selecciona una ficha de esta actividad.');
  const value=String(text??'').trim().slice(0,120);
  if(!value&&!item.querySelector('[data-p2lrn-dnd-item-image]'))
    throw new Error('La ficha necesita texto o una imagen.');
  let label=item.querySelector('[data-p2lrn-dnd-text]');
  if(!value){label?.remove();return null;}
  if(!label){
    label=element(section.ownerDocument,'span',{
      'data-p2lrn-dnd-text':'',
      style:{display:'block',width:'100%',fontSize:'16px',lineHeight:'1.35',textAlign:'center',overflowWrap:'anywhere'},
    });
    for(const child of [...item.childNodes])if(child.nodeType===3)child.remove();
    item.append(label);
  }
  label.textContent=value;
  label.hidden=false;
  label.style.display='block';
  return label;
}
async function readStudioDropImage(file){
  if(!file||!ALLOWED_IMAGE.has(file.type)||file.size<=0||file.size>MAX_IMAGE_BYTES)
    throw new Error('Elige una imagen PNG, JPEG, WebP, GIF o AVIF de hasta 5 MB.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(bytes.byteLength!==file.size||bytes.byteLength>MAX_IMAGE_BYTES)
    throw new Error('El archivo de imagen no coincide con su tamaño declarado.');
  let binary='';
  for(let offset=0;offset<bytes.length;offset+=8192)
    binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
  return 'data:'+file.type+';base64,'+btoa(binary);
}
export async function setStudioDropItemImage(section,item,file){
  if(!findDropItem(section,item))throw new Error('Selecciona una ficha de esta actividad.');
  const data=await readStudioDropImage(file);
  const previous=item.querySelector('[data-p2lrn-dnd-item-image]');
  const image=element(section.ownerDocument,'img',{
    'data-p2lrn-dnd-item-image':'',src:data,
    alt:String(file.name||'Imagen de ficha').replace(/\.[^.]+$/,'').trim().slice(0,120)||'Imagen de ficha',
    draggable:'false',
    style:{
      display:'block',width:'130px',maxWidth:'100%',height:'92px',maxHeight:'140px',
      objectFit:'contain',objectPosition:'center',pointerEvents:'none',userSelect:'none',
      borderRadius:'6px',margin:'0 auto',
    },
  });
  if(previous)previous.replaceWith(image);else item.prepend(image);
  normalizeStudioDropImageTile(item);
  return image;
}
export function setStudioDropItemImageAlt(section,item,text){
  if(!findDropItem(section,item))throw new Error('Selecciona una ficha de esta actividad.');
  const image=item.querySelector('[data-p2lrn-dnd-item-image]');
  if(!image)throw new Error('Primero añade una imagen a la ficha.');
  const alt=String(text??'').trim().slice(0,120);
  if(!alt)throw new Error('Escribe una descripción de la imagen para accesibilidad.');
  image.alt=alt;
  return image;
}
export function removeStudioDropItemImage(section,item){
  if(!findDropItem(section,item))return false;
  const image=item.querySelector('[data-p2lrn-dnd-item-image]');
  if(!image)return false;
  if(!getStudioDropItemText(item))throw new Error('Antes de quitar la imagen, escribe el texto de la ficha.');
  image.remove();
  item.style.backgroundColor='#fff';
  item.style.borderColor='#94a3b8';
  item.style.padding='9px 13px';
  return true;
}
export async function setStudioDropBackground(section,file){
  if(!isStudioDropActivity(section))throw new Error('Selecciona una actividad de arrastrar y soltar.');
  const data=await readStudioDropImage(file);
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
  const doc=surface.ownerDocument,root=surface.getRootNode(),styleHost=root.nodeType===9?doc.head:root;
  if(!styleHost.querySelector('[data-p2lrn-drop-editing-style]')){
    const style=doc.createElement('style');style.dataset.p2lrnDropEditingStyle='1';
    style.textContent=[
      '.p2lrn-studio-drop-editing [data-p2lrn-dnd-zone],.p2lrn-studio-drop-editing [data-p2lrn-dnd-item]{user-select:none;-webkit-user-select:none;touch-action:none}',
      '.p2lrn-studio-drop-editing [data-p2lrn-dnd-zone]{cursor:move!important}',
      '.p2lrn-studio-drop-editing [data-p2lrn-dnd-item]{cursor:grab!important;position:relative}',
      '.p2lrn-studio-drop-editing [data-p2lrn-dnd-zone]::after,.p2lrn-studio-drop-editing [data-p2lrn-dnd-item]::after{content:"";position:absolute;right:2px;bottom:2px;width:12px;height:12px;border-right:3px solid #2563eb;border-bottom:3px solid #2563eb;pointer-events:none;opacity:.85}',
      '.p2lrn-studio-drop-editing [data-p2lrn-dnd-board].p2lrn-drop-board-target{outline:3px solid #2563eb;outline-offset:2px}',
      '.p2lrn-studio-drop-editing [data-p2lrn-dnd-zone]:focus-visible,.p2lrn-studio-drop-editing [data-p2lrn-dnd-item]:focus-visible{outline:3px solid #1d4ed8!important;outline-offset:3px}',
      '@media(forced-colors:active){.p2lrn-studio-drop-editing [data-p2lrn-dnd-zone]:focus-visible,.p2lrn-studio-drop-editing [data-p2lrn-dnd-item]:focus-visible{outline:3px solid Highlight!important;outline-offset:3px}}',
    ].join('\n');
    styleHost.append(style);
  }
  surface.classList.add('p2lrn-studio-drop-editing');
  const normalized=[...surface.querySelectorAll('[data-p2lrn-dnd-item]')].filter(normalizeStudioDropImageTile);
  if(normalized.length)onChange();
  let selected=null,drag=null,suppressClick=null;
  const select=zone=>{const next=zone&&surface.contains(zone)?zone:null;if(selected!==next){selected=next;onSelected(selected);}};
  const matchingZone=item=>{
    const activity=item?.closest?.('[data-p2lrn-dnd="1"]');
    return [...(activity?.querySelectorAll('[data-p2lrn-dnd-zone]')??[])]
      .find(zone=>zone.dataset.p2lrnDndAccept===item?.dataset.p2lrnDndItem)??null;
  };
  const cleanup=state=>{state?.ghost?.remove();state?.board?.classList.remove('p2lrn-drop-board-target');};
  // Keyboard editing is equivalent to dragging: all positions/sizes are edited
  // through the same inline styles that pointer gestures and Player export use.
  // Nested contenteditable descendants can send real keyboard events to the
  // root editor instead of the focused tile/zone, even with tabindex=0. Make
  // each drag target an independent non-editable focus stop while authoring.
  const previousEditable=new Map();
  const makeKeyboardFocusStop=node=>{
    if(!previousEditable.has(node))previousEditable.set(node,node.getAttribute('contenteditable'));
    node.contentEditable='false';
    node.tabIndex=0;
  };
  const decorateKeyboardTargets=()=>{
    for(const zone of surface.querySelectorAll('[data-p2lrn-dnd-zone]')){
      makeKeyboardFocusStop(zone);
      zone.setAttribute('aria-keyshortcuts','ArrowUp ArrowDown ArrowLeft ArrowRight Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight');
      zone.setAttribute('aria-description',studioUiText('Flechas: mover la zona. Mayús y flechas: cambiar su tamaño. Alt y flechas: paso de cinco.',doc));
    }
    for(const item of surface.querySelectorAll('[data-p2lrn-dnd-item]')){
      makeKeyboardFocusStop(item);
      item.setAttribute('aria-keyshortcuts','Enter Alt+ArrowLeft Alt+ArrowRight Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight');
      item.setAttribute('aria-description',studioUiText('Intro: editar zona asociada. Alt y flechas izquierda/derecha: ordenar ficha. Mayús y flechas: cambiar tamaño.',doc));
    }
  };
  decorateKeyboardTargets();
  const KeyboardObserver=doc.defaultView?.MutationObserver;
  const keyboardObserver=KeyboardObserver?new KeyboardObserver(decorateKeyboardTargets):null;
  keyboardObserver?.observe(surface,{childList:true,subtree:true});
  const onKeyDown=event=>{
    const target=event.target;
    // Never hijack arrow keys while a teacher is editing actual text or numbers.
    if(target?.matches?.('input,textarea,select,[contenteditable=true]'))return;
    const item=target?.closest?.('[data-p2lrn-dnd-item]');
    const zone=item?null:target?.closest?.('[data-p2lrn-dnd-zone]');
    if((item||zone)&&!surface.contains(item||zone))return;
    const delta={
      ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1],
    }[event.key];
    if(item){
      if(event.key==='Enter'||event.key===' '){
        event.preventDefault();const linked=matchingZone(item);select(linked);linked?.focus();return;
      }
      if(!delta)return;
      const tray=item.closest('[data-p2lrn-dnd-tray]');
      if(event.altKey&&!event.shiftKey&&delta[0]&&tray){
        const siblings=[...tray.querySelectorAll('[data-p2lrn-dnd-item]')];
        const index=siblings.indexOf(item),next=siblings[index+delta[0]];
        event.preventDefault();
        if(next){if(delta[0]<0)next.before(item);else next.after(item);onChange();}
        item.focus();return;
      }
      if(event.shiftKey){
        event.preventDefault();
        const rect=item.getBoundingClientRect(),step=event.altKey?20:8;
        const width=Math.round(clamp(rect.width+delta[0]*step,72,Math.max(72,tray?.clientWidth??rect.width)));
        const height=Math.round(clamp(rect.height+delta[1]*step,44,360));
        Object.assign(item.style,{width:width+'px',minWidth:width+'px',height:height+'px',minHeight:height+'px'});
        onChange();
      }
      return;
    }
    if(!zone||!delta)return;
    event.preventDefault();select(zone);
    const left=parseFloat(zone.style.left)||0,top=parseFloat(zone.style.top)||0;
    const width=parseFloat(zone.style.width)||25,height=parseFloat(zone.style.height)||25;
    const step=event.altKey?5:1;
    if(event.shiftKey){
      zone.style.width=percent(clamp(width+delta[0]*step,8,100-left));
      zone.style.height=percent(clamp(height+delta[1]*step,8,100-top));
    }else{
      zone.style.left=percent(clamp(left+delta[0]*step,0,100-width));
      zone.style.top=percent(clamp(top+delta[1]*step,0,100-height));
    }
    onChange();
  };
  const onPointerDown=event=>{
    if(event.button!==0)return;
    const item=event.target.closest?.('[data-p2lrn-dnd-item]');
    const zone=item?null:event.target.closest?.('[data-p2lrn-dnd-zone]');
    const target=item||zone;
    if(!target||!surface.contains(target))return;
    // Use the inspector to edit names: prevent accidental selection of labels.
    event.preventDefault();
    if(event.detail>1)return;
    cleanup(drag);
    const rect=target.getBoundingClientRect();
    if(item){
      const match=matchingZone(item);select(match);
      drag={kind:event.clientX>=rect.right-19&&event.clientY>=rect.bottom-19?'card-resize':'card',
        node:item,zone:match,board:match?.closest('[data-p2lrn-dnd-board]')??null,
        tray:item.closest('[data-p2lrn-dnd-tray]'),pointerId:event.pointerId,
        x:event.clientX,y:event.clientY,width:rect.width,height:rect.height,changed:false,ghost:null};
    }else{
      const board=zone.closest('[data-p2lrn-dnd-board]');if(!board)return;
      select(zone);
      drag={kind:event.clientX>=rect.right-23&&event.clientY>=rect.bottom-23?'zone-resize':'zone',
        node:zone,board,box:board.getBoundingClientRect(),pointerId:event.pointerId,
        x:event.clientX,y:event.clientY,
        left:parseFloat(zone.style.left)||0,top:parseFloat(zone.style.top)||0,
        width:parseFloat(zone.style.width)||25,height:parseFloat(zone.style.height)||25,
        changed:false,ghost:null};
    }
    try{target.setPointerCapture(event.pointerId);}catch{}
  };
  const onPointerMove=event=>{
    if(!drag||drag.pointerId!==event.pointerId||!surface.contains(drag.node))return;
    const state=drag,dx=event.clientX-state.x,dy=event.clientY-state.y;
    if(state.kind==='card'){
      if(Math.hypot(dx,dy)<6&&!state.ghost)return;
      event.preventDefault();
      if(!state.ghost){
        const ghost=state.node.cloneNode(true);
        ghost.removeAttribute('id');ghost.removeAttribute('data-p2lrn-dnd-item');
        ghost.setAttribute('aria-hidden','true');ghost.contentEditable='false';
        Object.assign(ghost.style,{position:'fixed',left:'0px',top:'0px',
          width:Math.round(state.width)+'px',height:Math.round(state.height)+'px',
          margin:'0',transform:'translate(-50%,-50%)',zIndex:'2147483000',
          pointerEvents:'none',opacity:'.88',boxSizing:'border-box'});
        (root.nodeType===9?doc.body:root).append(ghost);state.ghost=ghost;
      }
      state.ghost.style.left=event.clientX+'px';state.ghost.style.top=event.clientY+'px';
      const box=state.board?.getBoundingClientRect();
      state.board?.classList.toggle('p2lrn-drop-board-target',Boolean(box&&
        event.clientX>=box.left&&event.clientX<=box.right&&
        event.clientY>=box.top&&event.clientY<=box.bottom));
      state.changed=true;return;
    }
    if(Math.abs(dx)<1&&Math.abs(dy)<1)return;
    if(state.kind==='card-resize'){
      const width=Math.round(clamp(state.width+dx,72,Math.max(72,state.tray?.clientWidth??state.width)));
      const height=Math.round(clamp(state.height+dy,44,360));
      Object.assign(state.node.style,{width:width+'px',minWidth:width+'px',
        height:height+'px',minHeight:height+'px'});
    }else{
      const x=100*dx/Math.max(1,state.box.width),y=100*dy/Math.max(1,state.box.height);
      if(state.kind==='zone'){
        state.node.style.left=percent(clamp(state.left+x,0,100-state.width));
        state.node.style.top=percent(clamp(state.top+y,0,100-state.height));
      }else{
        state.node.style.width=percent(clamp(state.width+x,8,100-state.left));
        state.node.style.height=percent(clamp(state.height+y,8,100-state.top));
      }
    }
    state.changed=true;event.preventDefault();
  };
  const onPointerUp=event=>{
    if(!drag||drag.pointerId!==event.pointerId)return;
    const state=drag;drag=null;cleanup(state);
    try{state.node.releasePointerCapture(event.pointerId);}catch{}
    if(!surface.contains(state.node))return;
    if(state.kind==='card'){
      if(!state.changed||event.type==='pointercancel')return;
      const box=state.board?.getBoundingClientRect();
      if(state.zone&&box?.width&&box.height&&event.clientX>=box.left&&
         event.clientX<=box.right&&event.clientY>=box.top&&event.clientY<=box.bottom){
        // Moving a card onto the picture positions the corresponding hotspot.
        // The card stays in the tray, preserving Player/answer IDs.
        const rect=state.zone.getBoundingClientRect();
        const width=100*rect.width/box.width,height=100*rect.height/box.height;
        state.zone.style.left=percent(clamp(100*(event.clientX-box.left)/box.width-width/2,0,100-width));
        state.zone.style.top=percent(clamp(100*(event.clientY-box.top)/box.height-height/2,0,100-height));
        select(state.zone);onChange();
      }else if(state.tray?.contains(state.node)){
        const hits=root.elementsFromPoint?.(event.clientX,event.clientY)||
          doc.elementsFromPoint?.(event.clientX,event.clientY)||[];
        const sibling=hits.map(el=>el.closest?.('[data-p2lrn-dnd-item]'))
          .find(el=>el&&el!==state.node&&el.parentElement===state.tray);
        if(sibling){
          const rect=sibling.getBoundingClientRect();
          if(event.clientX<rect.left+rect.width/2)sibling.before(state.node);
          else sibling.after(state.node);
          onChange();
        }
      }
      suppressClick={node:state.node,until:Date.now()+400};
      event.preventDefault();return;
    }
    if(state.changed)onChange();
  };
  const onClick=event=>{
    if(suppressClick){
      const item=event.target.closest?.('[data-p2lrn-dnd-item]');
      if(Date.now()<suppressClick.until&&item===suppressClick.node){
        event.preventDefault();suppressClick=null;return;
      }
      suppressClick=null;
    }
    const item=event.target.closest?.('[data-p2lrn-dnd-item]');
    if(item&&surface.contains(item)){select(matchingZone(item));return;}
    if(event.target.closest?.('[data-p2lrn-dnd-zone]'))return;
    if(!event.target.closest?.('[data-p2lrn-dnd="1"]'))select(null);
  };
  const handlers=[['pointerdown',onPointerDown],['pointermove',onPointerMove],
    ['pointerup',onPointerUp],['pointercancel',onPointerUp],['click',onClick],
    ['keydown',onKeyDown]];
  for(const [name,handler] of handlers)surface.addEventListener(name,handler);
  let interactive=true;
  const setEnabled=next=>{
    const enabled=Boolean(next);
    if(enabled===interactive)return;
    interactive=enabled;
    if(enabled){
      // Resume the existing editor instead of modifying authored markup.
      decorateKeyboardTargets();
      keyboardObserver?.observe(surface,{childList:true,subtree:true});
      for(const [name,handler] of handlers)surface.addEventListener(name,handler);
    }else{
      select(null);cleanup(drag);drag=null;keyboardObserver?.disconnect();
      for(const [name,handler] of handlers)surface.removeEventListener(name,handler);
    }
  };
  return {get selectedZone(){return selected&&surface.contains(selected)?selected:null;},select,setEnabled,
    dispose(){
      setEnabled(false);
      for(const [node,original] of previousEditable){
        if(original===null)node.removeAttribute('contenteditable');
        else node.setAttribute('contenteditable',original);
      }
      previousEditable.clear();
      surface.classList.remove('p2lrn-studio-drop-editing');
    }};
}
