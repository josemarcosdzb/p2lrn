// Trusted interactive runtime injected only into a strictly sanitized,
// script-nonce-only, opaque-origin Player iframe for Studio drop-zone lessons.
// The package never supplies executable JavaScript or runtime URLs.
export function bootStudioDropActivities(){
  'use strict';
  const activities=[...document.querySelectorAll('[data-p2lrn-dnd="1"]')];
  for(const activity of activities){
    const tray=activity.querySelector('[data-p2lrn-dnd-tray]');
    const status=activity.querySelector('[data-p2lrn-dnd-status]');
    const items=[...activity.querySelectorAll('[data-p2lrn-dnd-item]')];
    const zones=[...activity.querySelectorAll('[data-p2lrn-dnd-zone]')];
    if(!tray||!status||!items.length||!zones.length||items.length>20||zones.length>20)continue;
    // Same trusted drop engine; optional concentric-image placement for geometry-based lessons.
    // Standard free-position activities keep their existing behaviour.
    const concentric=activity.dataset.p2lrnDndPuzzle==='concentric';
    const board=concentric?activity.querySelector('[data-p2lrn-dnd-board]'):null;
    let layerStack=null;
    if(concentric&&board){
      board.style.isolation='isolate';
      layerStack=document.createElement('div');
      layerStack.dataset.p2lrnDndStack='1';
      Object.assign(layerStack.style,{position:'absolute',inset:'0',width:'100%',height:'100%',
        pointerEvents:'none',zIndex:'1'});
      board.prepend(layerStack);
      const surface=board.querySelector('[data-p2lrn-dnd-image]');
      if(surface){
        surface.style.position='absolute';
        surface.style.zIndex='2';
        surface.style.pointerEvents='none';
      }
    }
    // Import existing authored images without inserting a white card plate.
    // Historic "Ficha N" defaults were not a teacher-provided caption.
    for(const item of items){
      if(!item.querySelector('[data-p2lrn-dnd-item-image]'))continue;
      const caption=item.querySelector('[data-p2lrn-dnd-text]');
      const index=Number(String(item.dataset.p2lrnDndItem||'').replace(/^item-/,''));
      if(caption&&Number.isInteger(index)&&index>0&&caption.textContent?.trim()==='Ficha '+index)
        caption.remove();
      item.style.backgroundColor='transparent';
      item.style.borderColor='transparent';
      item.style.padding='0';
    }
    const zoneBackgrounds=new Map(zones.map(zone=>[zone,zone.style.backgroundColor]));
    const byId=new Map(items.map(item=>[item.dataset.p2lrnDndItem,item]));
    const placed=new Set();
    // Prefer Pointer Events for mouse, pen and touch inside sandboxed lesson iframes.
    // Native HTML5 drag can lose its drop target when the browser scrolls an iframe.
    const pointerDragSupported=typeof PointerEvent==='function';
    // Keep the authored tray dimensions for a perfect reset after placing an image.
    const cardStyles=new Map(items.map(item=>[item,{
      style:item.getAttribute('style'),
      imageStyle:item.querySelector('[data-p2lrn-dnd-item-image]')?.getAttribute('style')??null,
    }]));
    let selected=null,pointer=null;
    const announce=(text)=>{status.textContent=text;};
    const tileName=item=>{
      const text=item?.querySelector('[data-p2lrn-dnd-text]')?.textContent?.trim()
        ||[...(item?.childNodes??[])].filter(node=>node.nodeType===3)
          .map(node=>node.textContent||'').join('').trim();
      const alt=item?.querySelector('[data-p2lrn-dnd-item-image]')?.getAttribute('alt')?.trim();
      return text||alt||'Imagen';
    };
    const select=(item)=>{
      selected=item&&!placed.has(item.dataset.p2lrnDndItem)?item:null;
      for(const source of items)source.style.outline=source===selected?'3px solid #1d4ed8':'';
      if(selected)announce('Ficha seleccionada: '+tileName(selected)+'. Elige su destino.');
    };
    const place=(item,zone)=>{
      if(!item||!zone)return false;
      const id=item.dataset.p2lrnDndItem;
      if(placed.has(id))return true;
      if(zone.dataset.p2lrnDndAccept!==id){
        announce('No corresponde a esa zona. Prueba otra vez.');
        zone.style.borderColor='#b91c1c';return false;
      }
      if([...zone.querySelectorAll('[data-p2lrn-dnd-item]')].length)return false;
      placed.add(id);
      item.draggable=false;item.style.cursor='default';
      item.style.outline='';item.style.position='relative';item.style.touchAction='auto';
      zone.append(item);
      const destinationLabel=zone.querySelector('[data-p2lrn-dnd-label]');
      if(destinationLabel)destinationLabel.hidden=true;
      // Cards with photos must fit even when the teacher resizes a target area.
      Object.assign(item.style,{
        minWidth:'0',minHeight:'0',width:'100%',height:'100%',maxWidth:'100%',maxHeight:'100%',
        padding:'3px',gap:'2px',boxSizing:'border-box',overflow:'hidden',
      });
      const picture=item.querySelector('[data-p2lrn-dnd-item-image]');
      if(picture)Object.assign(picture.style,{
        flex:'1 1 0',minHeight:'0',maxHeight:'100%',width:'auto',height:'auto',objectFit:'contain',
      });
      zone.style.border='2px solid #15803d';
      // Green border and status indicate success; no opaque rectangle over PNG alpha.
      zone.style.backgroundColor='transparent';
      zone.setAttribute('aria-label','Respuesta correcta: '+tileName(item));
      if(concentric&&layerStack){
        // The teacher's image occupies a normalized full-board canvas, while
        // the editable drop target is just a small hit region on the real Earth.
        const source=item.querySelector('[data-p2lrn-dnd-item-image]');
        if(source?.src?.startsWith('data:image/')){
          const overlay=source.cloneNode(true);
          overlay.removeAttribute('data-p2lrn-dnd-item-image');
          overlay.dataset.p2lrnDndPlacedOverlay=id;
          // Optional teacher-authored layer order: a student may place
          // concentric shells in any sequence without one hiding another.
          const explicitOrder=Number(item.dataset.p2lrnDndLayerOrder);
          let layerOrder=item.dataset.p2lrnDndLayerOrder!==undefined
            &&Number.isInteger(explicitOrder)&&explicitOrder>=0&&explicitOrder<=20
            ? explicitOrder:null;
          if(layerOrder===null&&activity.dataset.p2lrnDndLayerOrderMode==='core-to-crust'){
            const index=items.indexOf(item);
            // An outward core-to-crust list has its last, cutaway crust
            // on top; the inner core overlays the intermediate rings.
            layerOrder=index===items.length-1?items.length:items.length-1-index;
          }
          if(layerOrder!==null)overlay.style.zIndex=String(layerOrder);
          overlay.alt='';
          overlay.setAttribute('aria-hidden','true');
          Object.assign(overlay.style,{display:'block',position:'absolute',inset:'0',
            width:'100%',height:'100%',minHeight:'0',maxHeight:'none',maxWidth:'none',
            objectFit:'contain',objectPosition:'center',pointerEvents:'none',margin:'0'});
          layerStack.append(overlay);
          item.style.display='none';
        }
        zone.style.border='none';
      }
      selected=null;
      const complete=placed.size===zones.length;
      announce(complete?'Actividad completada. Todas las fichas están colocadas.':
        'Correcto: '+placed.size+' de '+zones.length+' fichas colocadas.');
      if(complete)activity.dataset.p2lrnDndCompleted='true';
      return true;
    };
    for(const zone of zones){
      zone.tabIndex=0;zone.setAttribute('role','button');
      if(concentric){
        zone.style.zIndex='3';
        zone.style.borderRadius='50%';
        zone.style.backgroundColor='transparent';
        const label=zone.querySelector('[data-p2lrn-dnd-label]');
        if(label)label.hidden=true;
      }
      zone.setAttribute('aria-label',(zone.querySelector('[data-p2lrn-dnd-label]')?.textContent||'Zona de destino')+'. Pulsa para colocar una ficha.');
      zone.addEventListener('dragover',event=>event.preventDefault());
      zone.addEventListener('drop',event=>{
        event.preventDefault();
        const id=event.dataTransfer?.getData('text/plain');
        place(byId.get(id),zone);
      });
      zone.addEventListener('click',()=>{if(selected)place(selected,zone);});
      zone.addEventListener('keydown',event=>{
        if(event.key==='Enter'||event.key===' '){event.preventDefault();if(selected)place(selected,zone);}
      });
    }
    for(const item of items){
      item.setAttribute('role','button');
      item.tabIndex=0;item.draggable=!pointerDragSupported;
      item.setAttribute('aria-label','Ficha: '+tileName(item));
      item.addEventListener('click',()=>select(item));
      item.addEventListener('keydown',event=>{
        if(event.key==='Enter'||event.key===' '){event.preventDefault();select(item);}
        if(event.key==='Escape'){event.preventDefault();select(null);}
      });
      item.addEventListener('dragstart',event=>{
        if(placed.has(item.dataset.p2lrnDndItem)){event.preventDefault();return;}
        event.dataTransfer?.setData('text/plain',item.dataset.p2lrnDndItem);
        if(event.dataTransfer)event.dataTransfer.effectAllowed='move';
        select(item);
      });
      // Pointer gestures work consistently for mouse, touch and pen, even in iframes.
      item.addEventListener('pointerdown',event=>{
        if(placed.has(item.dataset.p2lrnDndItem)
          ||(event.pointerType==='mouse'&&event.button!==0))return;
        pointer={id:event.pointerId,item,x:event.clientX,y:event.clientY,ghost:null};
        try{item.setPointerCapture(event.pointerId);}catch{}
      });
      item.addEventListener('pointermove',event=>{
        if(!pointer||pointer.id!==event.pointerId||pointer.item!==item)return;
        const movement=Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y);
        if(movement<8&&!pointer.ghost)return;
        event.preventDefault();
        if(!pointer.ghost){
          const clone=item.cloneNode(true);
          clone.removeAttribute('data-p2lrn-dnd-item');
          clone.removeAttribute('id');
          clone.setAttribute('aria-hidden','true');
          Object.assign(clone.style,{
            position:'fixed',left:'0',top:'0',pointerEvents:'none',
            zIndex:'9999',opacity:'.92',margin:'0',transform:'translate(-50%,-50%)',
          });
          document.body.append(clone);pointer.ghost=clone;select(item);
        }
        pointer.ghost.style.left=event.clientX+'px';
        pointer.ghost.style.top=event.clientY+'px';
      });
      const finish=(event)=>{
        if(!pointer||pointer.id!==event.pointerId||pointer.item!==item)return;
        const moving=Boolean(pointer.ghost);
        pointer.ghost?.remove();pointer=null;
        try{item.releasePointerCapture(event.pointerId);}catch{}
        if(moving){
          const hit=document.elementFromPoint(event.clientX,event.clientY);
          const zone=hit?.closest?.('[data-p2lrn-dnd-zone]');
          if(zone&&activity.contains(zone))place(item,zone);
          else announce('Suelta la ficha dentro de una zona.');
          event.preventDefault();
        }
      };
      item.addEventListener('pointerup',finish);
      item.addEventListener('pointercancel',finish);
    }
    const reset=document.createElement('button');
    reset.type='button';reset.textContent='Reiniciar actividad';
    Object.assign(reset.style,{
      display:'inline-block',marginTop:'10px',padding:'8px 12px',
      background:'#fff',border:'1px solid #64748b',borderRadius:'7px',
      color:'#0f172a',cursor:'pointer',fontSize:'14px',
    });
    reset.addEventListener('click',()=>{
      for(const item of items){
        tray.append(item);item.draggable=!pointerDragSupported;
        const original=cardStyles.get(item);
        if(original?.style===null)item.removeAttribute('style');
        else if(original?.style!==undefined)item.setAttribute('style',original.style);
        const picture=item.querySelector('[data-p2lrn-dnd-item-image]');
        if(picture){
          if(original?.imageStyle===null)picture.removeAttribute('style');
          else if(original?.imageStyle!==undefined)picture.setAttribute('style',original.imageStyle);
        }
      }
      placed.clear();selected=null;pointer?.ghost?.remove();pointer=null;
      if(concentric&&layerStack)layerStack.replaceChildren();
      activity.removeAttribute('data-p2lrn-dnd-completed');
      for(const zone of zones){
        const label=zone.querySelector('[data-p2lrn-dnd-label]');
        if(label)label.hidden=false;
        zone.style.border='2px dashed #1d4ed8';
        zone.style.backgroundColor=zoneBackgrounds.get(zone)||'transparent';
        zone.setAttribute('aria-label',zone.querySelector('[data-p2lrn-dnd-label]')?.textContent||'Zona');
        if(concentric){
          zone.style.border='1px dashed #0c6599';
          const label=zone.querySelector('[data-p2lrn-dnd-label]');
          if(label)label.hidden=true;
        }
      }
      announce('Actividad reiniciada. Arrastra una ficha hasta su zona.');
    });
    status.after(reset);
  }
}
export const studioDropRuntimeSource='('+bootStudioDropActivities.toString()+')();';
