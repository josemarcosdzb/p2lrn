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
    const byId=new Map(items.map(item=>[item.dataset.p2lrnDndItem,item]));
    const placed=new Set();
    let selected=null,pointer=null;
    const announce=(text)=>{status.textContent=text;};
    const select=(item)=>{
      selected=item&&!placed.has(item.dataset.p2lrnDndItem)?item:null;
      for(const source of items)source.style.outline=source===selected?'3px solid #1d4ed8':'';
      if(selected)announce('Ficha seleccionada: '+selected.textContent+'. Elige su destino.');
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
      zone.style.border='2px solid #15803d';
      zone.style.backgroundColor='#dcfce7';
      zone.setAttribute('aria-label','Respuesta correcta: '+item.textContent);
      selected=null;
      const complete=placed.size===zones.length;
      announce(complete?'Actividad completada. Todas las fichas están colocadas.':
        'Correcto: '+placed.size+' de '+zones.length+' fichas colocadas.');
      if(complete)activity.dataset.p2lrnDndCompleted='true';
      return true;
    };
    for(const zone of zones){
      zone.tabIndex=0;zone.setAttribute('role','button');
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
      item.tabIndex=0;item.draggable=true;
      item.setAttribute('aria-label','Ficha: '+item.textContent);
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
      // Touch/pen pointer gestures work without HTML5 drag-and-drop support.
      item.addEventListener('pointerdown',event=>{
        if(!['touch','pen'].includes(event.pointerType)||placed.has(item.dataset.p2lrnDndItem))return;
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
        tray.append(item);item.draggable=true;item.style.cursor='grab';
        item.style.position='';item.style.touchAction='none';item.style.outline='';
      }
      placed.clear();selected=null;pointer?.ghost?.remove();pointer=null;
      activity.removeAttribute('data-p2lrn-dnd-completed');
      for(const zone of zones){
        zone.style.border='2px dashed #1d4ed8';
        zone.style.backgroundColor='rgba(255,255,255,.83)';
        zone.setAttribute('aria-label',zone.querySelector('[data-p2lrn-dnd-label]')?.textContent||'Zona');
      }
      announce('Actividad reiniciada. Arrastra una ficha hasta su zona.');
    });
    status.after(reset);
  }
}
export const studioDropRuntimeSource='('+bootStudioDropActivities.toString()+')();';
