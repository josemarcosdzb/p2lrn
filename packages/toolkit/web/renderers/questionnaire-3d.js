import {playerUiText} from './ui-i18n.js';
import {THREE_D_RENDERER} from '../renderer-registry.js';
import {
  appendUniqueConnection,
  classificationIsCorrect,
  connectionKey,
  orderingIsCorrect,
  validateConnection,
} from '../game-3d-mechanics.js';
import {createThreeGameScene} from '../game-3d/three-runtime.js';
import {buildAssemblyControls} from './assembly-3d.js';
import {el, finishPanel, setupGame, statusNode, stylesheets} from './game-common.js';

export {stylesheets};

function seedText(value){
  let hash=2166136261;
  for(let i=0;i<String(value).length;i+=1){hash^=String(value).charCodeAt(i);hash=Math.imul(hash,16777619);}
  return hash>>>0;
}

function deterministicRandom(seed){
  let state=seed||0x9e3779b9;
  return ()=>{state+=0x6d2b79f5;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};
}

function randomRoomPositions(total,seed,{xMin=-7.8,xMax=7.8,zMin=2.4,zMax=9.8,y=0.72,separation=2.15}={}){
  const random=deterministicRandom(seed);
  const result=[];
  for(let index=0;index<total;index+=1){
    let chosen=null;
    for(let attempt=0;attempt<180;attempt+=1){
      const x=xMin+random()*(xMax-xMin);
      const z=zMin+random()*(zMax-zMin);
      if(result.some(([px,,pz])=>Math.hypot(px-x,pz-z)<separation)) continue;
      chosen=[x,y,z];
      break;
    }
    if(!chosen){
      const columns=Math.max(2,Math.ceil(Math.sqrt(total)));
      const row=Math.floor(index/columns),column=index%columns;
      const rows=Math.max(2,Math.ceil(total/columns));
      chosen=[
        xMin+column*((xMax-xMin)/Math.max(1,columns-1)),
        y,
        zMin+row*((zMax-zMin)/Math.max(1,rows-1)),
      ];
    }
    result.push(chosen);
  }
  return result;
}

function orderingSlotPosition(index,total) {
  const width=Math.min(5,total);
  const row=Math.floor(index/width);
  const column=index%width;
  const rowCount=Math.min(width,total-row*width);
  return [(column-(rowCount-1)/2)*2.7,0.18,-3.8-row*2.6];
}

function classificationZonePosition(index,total) {
  const columns=Math.min(3,total);
  const row=Math.floor(index/columns);
  const column=index%columns;
  const itemsInRow=Math.min(columns,total-row*columns);
  return [(column-(itemsInRow-1)/2)*5.1,0.14,-4.5-row*3.4];
}

function matchingPositions(side,total,seed){
  return randomRoomPositions(total,seed,{
    xMin:side==='left'?-8.6:1.65,
    xMax:side==='left'?-1.65:8.6,
    zMin:-1.2,
    zMax:Math.max(9.8,2.4+total*1.15),
    y:0.7,
    separation:2.1,
  });
}

function setText(node,value) {
  node.textContent=String(value);
}

function buildOrderingControls({trial,runtime,scene,status}) {
  const saveKey=`3d:ordering:${trial.questionId}`;
  const validIds=new Set(trial.objects.map((item)=>item.id));
  const stored=runtime.getGameState(saveKey,null);
  const answer=runtime.answer(trial.questionId).order;
  const validSlots=(items)=>Array.isArray(items)&&items.length===trial.objects.length
    && items.every((id)=>id===null||validIds.has(String(id)))
    && new Set(items.filter(Boolean).map(String)).size===items.filter(Boolean).length;
  const restored=validSlots(stored)?stored:validSlots(answer)?answer:null;
  const placed=restored?restored.map((id)=>id===null?null:String(id)):Array(trial.objects.length).fill(null);
  const randomPositions=randomRoomPositions(trial.objects.length,seedText(`order:${trial.questionId}:${trial.prompt}`));
  const staging=new Map(trial.objects.map((item,index)=>[item.id,randomPositions[index]]));
  let selected=null;

  trial.objects.forEach((item,index)=>{
    scene.addBox({
      id:`order:${item.id}`,
      text:item.text,
      position:staging.get(item.id),
      interaction:{kind:'ordering-object',id:item.id},
    });
  });
  placed.forEach((_,index)=>{
    const p=orderingSlotPosition(index,placed.length);
    scene.addZone({
      id:`order-slot:${index}`,
      text:playerUiText(`Posición ${index+1}`),
      position:p,
      size:[2.35,0.22,1.85],
      color:'#1d4ed8',
      interaction:{kind:'ordering-slot',index},
    });
  });

  const panel=el('div',{class:'p2lrn-3d-accessible'});
  const title=el('p',{class:'p2lrn-game-description'},playerUiText('Selecciona un objeto y después una posición. También puedes usar los selectores accesibles.'));
  const rows=el('div',{class:'p2lrn-q-fields'});
  const selects=new Map();

  function currentOrder() {
    return placed.every(Boolean)?placed.map(String):null;
  }

  function syncObject(itemId) {
    const slot=placed.findIndex((id)=>id===itemId);
    const position=slot>=0
      ? [...orderingSlotPosition(slot,placed.length).slice(0,2),orderingSlotPosition(slot,placed.length)[2]]
      : staging.get(itemId);
    if (slot>=0) position[1]=0.78;
    scene.setTranslation(`order:${itemId}`,position);
  }

  function persistPlacement(){
    runtime.setGameState(saveKey,[...placed]);
    runtime.replaceAnswer(trial.questionId,{order:currentOrder()??[]});
  }

  function refreshSelects() {
    for(const [itemId,select] of selects){
      const slot=placed.findIndex((id)=>id===itemId);
      select.value=slot>=0?String(slot):'';
    }
  }

  function place(itemId,slotIndex) {
    if (!itemId) { setText(status,playerUiText('Selecciona primero un objeto.')); return false; }
    const current=placed.indexOf(itemId);
    const occupied=placed[slotIndex];
    if (occupied && occupied!==itemId) {
      setText(status,playerUiText(`La posición ${slotIndex+1} ya está ocupada.`));
      return false;
    }
    if (current>=0) placed[current]=null;
    placed[slotIndex]=itemId;
    scene.carry(`order:${itemId}`,false);
    scene.highlight(`order:${itemId}`,false);
    if(selected===itemId)selected=null;
    syncObject(itemId);
    refreshSelects();
    persistPlacement();
    const order=currentOrder();
    if (order) {
      setText(status,orderingIsCorrect(order,trial.correctOrder)?playerUiText('Orden correcto.'):playerUiText('Orden completo; puedes seguir ajustándolo.'));
    } else {
      setText(status,playerUiText(`Objeto colocado en la posición ${slotIndex+1}.`));
    }
    return true;
  }

  trial.objects.forEach((item)=>{
    const row=el('label',{class:'p2lrn-q-field'});
    row.append(el('span',{},item.text));
    const select=el('select');
    select.append(el('option',{value:''},playerUiText('Sin colocar')));
    placed.forEach((_,index)=>select.append(el('option',{value:String(index)},playerUiText(`Posición ${index+1}`))));
    select.addEventListener('change',()=>{
      if(select.value===''){
        const current=placed.indexOf(item.id);
        if(current>=0) placed[current]=null;
        scene.carry(`order:${item.id}`,false);
        scene.highlight(`order:${item.id}`,false);
        if(selected===item.id)selected=null;
        syncObject(item.id);
        refreshSelects();
        persistPlacement();
        setText(status,playerUiText('Objeto devuelto a la zona de salida.'));
        return;
      }
      place(item.id,Number(select.value));
    });
    selects.set(item.id,select);
    row.append(select);
    rows.append(row);
  });

  placed.forEach((id)=>{if(id)syncObject(id);});
  refreshSelects();
  panel.append(title,rows);
  return {
    panel,
    summary:restored?.some(Boolean)?`Posiciones recuperadas · ${placed.filter(Boolean).length}/${placed.length}`:null,
    drag(meta,phase,{position=null,target=null}={}){
      if(meta.kind!=='ordering-object')return false;
      if(phase==='start'){
        if(runtime.state.completed)return false;
        selected=meta.id;
        scene.carry(`order:${meta.id}`,false);
        scene.highlight(`order:${meta.id}`,true);
        setText(status,playerUiText('Arrastra el bloque hasta una posición.'));
        return true;
      }
      if(phase==='move'){if(position)scene.setTranslation(`order:${meta.id}`,position);return true;}
      if(phase==='end'){
        const success=target?.kind==='ordering-slot'&&place(meta.id,target.index);
        if(!success){
          syncObject(meta.id);
          scene.highlight(`order:${meta.id}`,false);
          setText(status,playerUiText('Suelta el bloque sobre una posición disponible.'));
        }
        selected=null;
        return true;
      }
      if(phase==='cancel'){
        syncObject(meta.id);
        scene.highlight(`order:${meta.id}`,false);
        selected=null;
        return true;
      }
      return false;
    },
    interact(meta) {
      if(runtime.state.completed){setText(status,playerUiText('Esta actividad ya está finalizada.'));return true;}
      if(meta.kind==='ordering-object'){
        if(selected&&selected!==meta.id){setText(status,playerUiText('Ya llevas un objeto. Colócalo antes de coger otro.'));return true;}
        selected=meta.id;
        scene.highlight(`order:${selected}`,true);
        scene.carry(`order:${selected}`,true);
        setText(status,playerUiText('Objeto seleccionado. Elige una posición.'));
        return true;
      }
      if(meta.kind==='ordering-slot'){
        const placedOk=place(selected,meta.index);
        if(placedOk && selected){
          scene.highlight(`order:${selected}`,false);
          selected=null;
        }
        return true;
      }
      return false;
    },
  };
}

function buildMatchingControls({trial,runtime,scene,status}) {
  const expected=new Set(trial.connections.map((item)=>connectionKey(item.leftId,item.rightId)));
  const solved=new Set();
  let connections=[];
  let selected=null;
  let activeRope=null;

  const leftPositions=matchingPositions('left',trial.left.length,seedText(`left:${trial.questionId}:${trial.prompt}`));
  const rightPositions=matchingPositions('right',trial.right.length,seedText(`right:${trial.questionId}:${trial.prompt}`));
  trial.left.forEach((item,index)=>scene.addNode({
    id:`left:${item.id}`,
    text:item.text,
    position:leftPositions[index],
    color:'#2563eb',
    interaction:{kind:'matching-left',id:item.id},
  }));
  trial.right.forEach((item,index)=>scene.addNode({
    id:`right:${item.id}`,
    text:item.text,
    position:rightPositions[index],
    color:'#7c3aed',
    interaction:{kind:'matching-right',id:item.id},
  }));

  const panel=el('div',{class:'p2lrn-match-grid'});
  const leftColumn=el('div',{class:'p2lrn-match-column'});
  const rightColumn=el('div',{class:'p2lrn-match-column'});
  const leftButtons=new Map();
  const allMatched=()=>connections.length>=trial.connections.length;
  const matchingLocked=()=>Boolean(runtime.state.completed||allMatched());
  const completedMessage=()=>playerUiText('Todas las relaciones están completadas. Finaliza la actividad.');

  function chooseLeft(id) {
    // A solved source must not create another temporary rope, even before
    // the learner presses the final Submit button.
    if(matchingLocked()||connections.some((pair)=>pair.leftId===id)){
      clearSelection();
      setText(status,matchingLocked()?completedMessage():playerUiText('Esta pareja ya está conectada.'));
      return false;
    }
    clearSelection();
    selected=id;
    scene.highlight(`left:${selected}`,true);
    activeRope=scene.connectToPlayer(`left:${selected}`);
    leftButtons.forEach((button,key)=>button.classList.toggle('is-selected',key===id));
    setText(status,playerUiText('Origen seleccionado. Elige su pareja.'));
    return true;
  }

  function chooseRight(id) {
    if(matchingLocked()){
      clearSelection();
      setText(status,completedMessage());
      return false;
    }
    if(!selected){setText(status,playerUiText('Selecciona primero un elemento de la izquierda.'));return false;}
    const validation=validateConnection(selected,id,expected,solved);
    if(!validation.ok){
      if(activeRope){scene.disconnect(activeRope);activeRope=null;}
      scene.highlight(`left:${selected}`,false);
      selected=null;leftButtons.forEach((button)=>button.classList.remove('is-selected'));
      setText(status,playerUiText('Esa relación no es correcta. Busca otra pareja.'));return false;
    }
    const key=connectionKey(selected,id);
    if(!validation.alreadyExists){
      solved.add(key);
      connections=appendUniqueConnection(connections,{leftId:selected,rightId:id});
      runtime.applyPatch(trial.questionId,{kind:'pair-set',leftId:selected,rightId:id});
      if(activeRope){scene.disconnect(activeRope);activeRope=null;}
      scene.connect(`left:${selected}`,`right:${id}`);
    }
    leftButtons.get(selected)?.classList.add('is-solved');
    if(activeRope){scene.disconnect(activeRope);activeRope=null;}
    scene.highlight(`left:${selected}`,false);
    selected=null;
    leftButtons.forEach((button)=>button.classList.remove('is-selected'));
    setText(status,playerUiText(`Conexión correcta · ${connections.length}/${trial.connections.length}`)
      +(allMatched()?` · ${completedMessage()}`:''));
    return true;
  }

  trial.left.forEach((item)=>{
    const button=el('button',{type:'button',class:'p2lrn-game-card'},item.text);
    button.addEventListener('click',()=>chooseLeft(item.id));
    leftButtons.set(item.id,button);
    leftColumn.append(button);
  });
  trial.right.forEach((item)=>{
    const button=el('button',{type:'button',class:'p2lrn-game-card'},item.text);
    button.addEventListener('click',()=>chooseRight(item.id));
    rightColumn.append(button);
  });
  const savedPairs=runtime.answer(trial.questionId).pairs??{};
  for(const connection of trial.connections){
    if(savedPairs?.[connection.leftId]!==connection.rightId)continue;
    const key=connectionKey(connection.leftId,connection.rightId);
    if(solved.has(key))continue;
    solved.add(key);
    connections=appendUniqueConnection(connections,connection);
    scene.connect(`left:${connection.leftId}`,`right:${connection.rightId}`);
    leftButtons.get(connection.leftId)?.classList.add('is-solved');
  }
  panel.append(leftColumn,rightColumn);

  function clearSelection(){
    if(activeRope){scene.disconnect(activeRope);activeRope=null;}
    if(selected)scene.highlight(`left:${selected}`,false);
    selected=null;
    leftButtons.forEach((button)=>button.classList.remove('is-selected'));
  }

  return {
    panel,
    summary:connections.length?`Conexiones recuperadas · ${connections.length}/${trial.connections.length}`:null,
    drag(meta,phase,{position=null,target=null}={}){
      if(meta.kind!=='matching-left')return false;
      if(phase==='start'){
        if(!chooseLeft(meta.id))return false;
        if(activeRope){scene.disconnect(activeRope);activeRope=null;}
        activeRope=scene.connectToPointer(`left:${meta.id}`);
        if(position)scene.setPointerTarget(position);
        setText(status,playerUiText('Lleva la cuerda hasta la pareja en la escena.'));
        return true;
      }
      if(phase==='move'){if(activeRope&&position)scene.setPointerTarget(position);return Boolean(activeRope);}
      if(phase==='end'){
        if(!selected){clearSelection();return false;}
        if(target?.kind==='matching-right')chooseRight(target.id);
        else {clearSelection();setText(status,playerUiText('Suelta la cuerda encima de su pareja.'));}
        return true;
      }
      if(phase==='cancel'){clearSelection();return true;}
      return false;
    },
    interact(meta) {
      if(runtime.state.completed){setText(status,playerUiText('Esta actividad ya está finalizada.'));return true;}
      if(meta.kind==='matching-left'){
        chooseLeft(meta.id);return true;
      }
      if(meta.kind==='matching-right'){
        chooseRight(meta.id);return true;
      }
      return false;
    },
  };
}

function buildClassificationControls({trial,runtime,scene,status}) {
  const expected=new Map(trial.assignments.map((item)=>[item.itemId,item.categoryId]));
  const saved=runtime.answer(trial.questionId).classifications??{};
  const values=Object.fromEntries(Object.entries(saved).filter(([itemId,categoryId])=>
    expected.get(itemId)===categoryId));
  const randomPositions=randomRoomPositions(trial.objects.length,seedText(`classify:${trial.questionId}:${trial.prompt}`),{zMin:2.5,zMax:9.2});
  const staging=new Map(trial.objects.map((item,index)=>[item.id,randomPositions[index]]));
  let selected=null;

  trial.categories.forEach((category,index)=>{
    scene.addZone({
      id:`category:${category.id}`,
      text:category.text,
      position:classificationZonePosition(index,trial.categories.length),
      size:[4.1,0.24,2.5],
      color:['#0369a1','#6d28d9','#047857','#b45309'][index%4],
      interaction:{kind:'classification-category',id:category.id},
    });
  });
  trial.objects.forEach((item,index)=>{
    scene.addBox({
      id:`classify:${item.id}`,
      text:item.text,
      position:staging.get(item.id),
      interaction:{kind:'classification-object',id:item.id},
    });
  });

  const panel=el('div',{class:'p2lrn-q-fields'});
  const selects=new Map();

  function syncClassifiedPosition(itemId,categoryId){
    const categoryIndex=trial.categories.findIndex((item)=>item.id===categoryId);
    if(categoryIndex<0)return;
    const base=classificationZonePosition(categoryIndex,trial.categories.length);
    const siblings=Object.entries(values).filter(([,value])=>value===categoryId).map(([id])=>id);
    const offset=siblings.indexOf(itemId);
    scene.setTranslation(`classify:${itemId}`,[base[0]+((offset%3)-1)*0.9,0.72,base[2]+1.25+Math.floor(offset/3)*0.95]);
  }

  function moveToCategory(itemId,categoryId) {
    const expectedCategory=expected.get(itemId);
    if(expectedCategory!==categoryId){
      setText(status,playerUiText('Esa categoría no es correcta.'));
      return false;
    }
    values[itemId]=categoryId;
    scene.carry(`classify:${itemId}`,false);
    scene.highlight(`classify:${itemId}`,false);
    if(selected===itemId)selected=null;
    runtime.applyPatch(trial.questionId,{kind:'classification-set',itemId,categoryId});
    syncClassifiedPosition(itemId,categoryId);
    selects.get(itemId).value=categoryId;
    setText(status,classificationIsCorrect(values,expected)?playerUiText('Clasificación completada correctamente.'):playerUiText('Objeto clasificado correctamente.'));
    return true;
  }

  trial.objects.forEach((item)=>{
    const row=el('label',{class:'p2lrn-q-field'});
    row.append(el('span',{},item.text));
    const select=el('select');
    select.append(el('option',{value:''},playerUiText('Selecciona categoría…')));
    trial.categories.forEach((category)=>select.append(el('option',{value:category.id},category.text)));
    select.addEventListener('change',()=>{
      if(!select.value){select.value=values[item.id]??'';return;}
      if(!moveToCategory(item.id,select.value)) select.value=values[item.id]??'';
    });
    selects.set(item.id,select);
    row.append(select);
    panel.append(row);
  });

  for(const [itemId,categoryId] of Object.entries(values)){
    syncClassifiedPosition(itemId,categoryId);
    const select=selects.get(itemId);
    if(select)select.value=categoryId;
  }

  return {
    panel,
    summary:Object.keys(values).length?`Clasificaciones recuperadas · ${Object.keys(values).length}/${trial.objects.length}`:null,
    drag(meta,phase,{position=null,target=null}={}){
      if(meta.kind!=='classification-object')return false;
      if(phase==='start'){
        if(runtime.state.completed||values[meta.id])return false;
        selected=meta.id;
        scene.carry(`classify:${meta.id}`,false);
        scene.highlight(`classify:${meta.id}`,true);
        setText(status,playerUiText('Arrastra el objeto hasta su categoría.'));
        return true;
      }
      if(phase==='move'){if(position)scene.setTranslation(`classify:${meta.id}`,position);return true;}
      if(phase==='end'){
        const ok=target?.kind==='classification-category'&&moveToCategory(meta.id,target.id);
        if(!ok){
          scene.setTranslation(`classify:${meta.id}`,staging.get(meta.id));
          scene.highlight(`classify:${meta.id}`,false);
          if(target?.kind!=='classification-category')setText(status,playerUiText('Suelta el bloque sobre una categoría.'));
        }
        selected=null;
        return true;
      }
      if(phase==='cancel'){
        scene.setTranslation(`classify:${meta.id}`,staging.get(meta.id));
        scene.highlight(`classify:${meta.id}`,false);
        selected=null;
        return true;
      }
      return false;
    },
    interact(meta) {
      if(runtime.state.completed){setText(status,playerUiText('Esta actividad ya está finalizada.'));return true;}
      if(meta.kind==='classification-object'){
        if(selected&&selected!==meta.id){setText(status,playerUiText('Ya llevas un objeto. Deposítalo antes de coger otro.'));return true;}
        selected=meta.id;
        scene.highlight(`classify:${selected}`,true);
        scene.carry(`classify:${selected}`,true);
        setText(status,playerUiText('Objeto seleccionado. Elige una categoría.'));
        return true;
      }
      if(meta.kind==='classification-category'){
        if(!selected){setText(status,playerUiText('Selecciona primero un objeto.'));return true;}
        const ok=moveToCategory(selected,meta.id);
        if(ok){
          scene.highlight(`classify:${selected}`,false);
          selected=null;
        }
        return true;
      }
      return false;
    },
  };
}


// The analog joystick is scoped to one scene. It never intercepts gestures
// on the WebGL canvas, where taps and drags must remain available for gameplay.
export function createVirtualJoystick(scene){
  const pad=el('div',{
    class:'p2lrn-3d-joystick',
    role:'group',
    'aria-label':playerUiText('Joystick de movimiento. Desliza la bola para caminar.'),
  });
  const base=el('div',{class:'p2lrn-3d-joystick-base','aria-hidden':'true'});
  const knob=el('div',{class:'p2lrn-3d-joystick-knob'});
  base.append(knob);
  pad.append(base);
  let pointerId=null;
  const update=(event)=>{
    const rect=base.getBoundingClientRect();
    const radius=Math.max(1,rect.width*0.33);
    const dx=event.clientX-(rect.left+rect.width/2);
    const dy=event.clientY-(rect.top+rect.height/2);
    const distance=Math.hypot(dx,dy);
    const amount=Math.min(1,distance/radius);
    const strength=amount<0.12?0:(amount-0.12)/0.88;
    const nx=distance?dx/distance:0,ny=distance?dy/distance:0;
    knob.style.transform='translate3d('+(nx*amount*radius)+'px,'+(ny*amount*radius)+'px,0)';
    if(strength===0)scene.setMovementVector(0,0);
    else scene.setMovementVector(nx*strength,-ny*strength);
  };
  const reset=()=>{
    const held=pointerId;
    pointerId=null;
    scene.setMovementVector(0,0);
    knob.style.transform='translate3d(0,0,0)';
    if(held!==null)try{pad.releasePointerCapture?.(held);}catch{}
  };
  const start=(event)=>{
    if(pointerId!==null || (event.pointerType==='mouse'&&event.button!==0))return;
    event.preventDefault();
    pointerId=event.pointerId;
    try{pad.setPointerCapture?.(pointerId);}catch{}
    update(event);
  };
  const move=(event)=>{
    if(pointerId!==event.pointerId)return;
    event.preventDefault();
    update(event);
  };
  const end=(event)=>{
    if(pointerId===event.pointerId)reset();
  };
  pad.addEventListener('pointerdown',start);
  pad.addEventListener('pointermove',move);
  pad.addEventListener('pointerup',end);
  pad.addEventListener('pointercancel',end);
  pad.addEventListener('lostpointercapture',end);
  globalThis.addEventListener?.('blur',reset);
  return {
    element:pad,
    reset,
    destroy(){
      reset();
      globalThis.removeEventListener?.('blur',reset);
      pad.removeEventListener('pointerdown',start);
      pad.removeEventListener('pointermove',move);
      pad.removeEventListener('pointerup',end);
      pad.removeEventListener('pointercancel',end);
      pad.removeEventListener('lostpointercapture',end);
    },
  };
}

// A WebGL failure must not make the entire authored exercise unusable.
// The accessible fields still drive the same native questionnaire session.
function createAccessibleOnlyScene() {
  return {
    physics:'none',
    reset(){},
    addBox(){},addZone(){},addNode(){},addCage(){},async addModel(){},setTransform(){},
    connect(){return null;},connectToPlayer(){return null;},connectToPointer(){return null;},
    setPointerTarget(){},disconnect(){return false;},
    carry(){return false;},setTranslation(){return false;},highlight(){},
    playerDistanceTo(){return 0;},nudgePlayer(){},setMovementVector(){},resetPlayer(){},destroy(){},
  };
}

export async function render(options) {
  const {game,runtime,shell}=await setupGame({...options,rendererId:THREE_D_RENDERER});
  const packageSource=options.package;
  shell.classList.add('p2lrn-3d-game');
  const layout=el('div',{class:'p2lrn-3d-layout'});
  const directions=el('p',{class:'p2lrn-3d-directions',role:'note'});
  const stage=el('div',{class:'p2lrn-3d-stage'});
  const canvas=el('canvas',{
    class:'p2lrn-3d-canvas',
    width:'960',
    height:'540',
    'aria-label':playerUiText('Escena 3D interactiva del ejercicio'),
  });
  stage.append(canvas);
  const fullscreen=el('button',{type:'button',class:'p2lrn-3d-fullscreen',
    'aria-label':playerUiText('Ampliar escena 3D a pantalla completa')},
    playerUiText('Pantalla completa'));
  stage.append(fullscreen);
  const getFullscreen=()=>stage.getRootNode()?.fullscreenElement===stage || document.fullscreenElement===stage;
  const updateFullscreen=()=>{
    const active=getFullscreen();
    fullscreen.textContent=playerUiText(active?'Salir de pantalla completa':'Pantalla completa');
    fullscreen.setAttribute('aria-label',playerUiText(active?'Salir de pantalla completa':'Ampliar escena 3D a pantalla completa'));
    fullscreen.setAttribute('aria-pressed',String(active));
  };
  fullscreen.addEventListener('click',async()=>{
    try{
      if(getFullscreen())await document.exitFullscreen();
      else if(typeof stage.requestFullscreen==='function')await stage.requestFullscreen();
      else throw Error('Este navegador no permite pantalla completa.');
    }catch(error){status.textContent=playerUiText('No se pudo activar pantalla completa: ')+(error?.message||String(error));}
    updateFullscreen();
  });
  document.addEventListener('fullscreenchange',updateFullscreen);
  const entryHint=el('div',{class:'p2lrn-3d-entry-hint',role:'note'},
    playerUiText('Haz clic en la escena para entrar'));
  entryHint.append(el('small',{},playerUiText('Usa WASD o las flechas para caminar y arrastra el fondo para mirar.')));
  stage.append(entryHint);
  const enterScene=()=>{stage.classList.add('is-entered');entryHint.setAttribute('aria-hidden','true');};
  canvas.addEventListener('focus',enterScene);
  canvas.addEventListener('pointerdown',enterScene);
  canvas.addEventListener('click',enterScene);
  const heading=el('header',{class:'p2lrn-3d-question-head'});
  const controls=el('div',{class:'p2lrn-3d-controls'});
  const status=statusNode(playerUiText('Preparando escena 3D…'));
  let trialIndex=0;
  let currentInteraction=()=>false;
  let currentDrag=()=>false;

  let scene;
  let joystick=null;
  let accessibleOnly=false;
  try{
    scene=await createThreeGameScene(canvas,{
      onInteraction:(meta)=>currentInteraction(meta),
      onDrag:(meta,phase,info)=>currentDrag(meta,phase,info),
    });
    layout.classList.add('p2lrn-3d-interactive');
    joystick=createVirtualJoystick(scene);
    stage.append(joystick.element);
  }catch(error){
    console.warn('P2LRN 3D renderer unavailable; accessible controls remain enabled:',error);
    scene=createAccessibleOnlyScene();
    accessibleOnly=true;
    stage.hidden=true;
    fullscreen.hidden=true;
    layout.classList.add('p2lrn-3d-fallback');
    layout.append(el('p',{class:'p2lrn-game-description',role:'status'},
      playerUiText('La escena 3D no está disponible en este dispositivo. Puedes completar las mismas preguntas con los controles accesibles.')));
  }

  const technology=el('p',{class:'p2lrn-3d-runtime'},accessibleOnly
    ?playerUiText('Escena 3D no disponible · modo accesible')
    :playerUiText(`Three.js · física: ${scene.physics==='rapier'?'Rapier':'fallback sin físicas'}`));
  const help=el('p',{class:'p2lrn-game-description'},accessibleOnly
    ?playerUiText('Elige las respuestas usando los botones y selectores de cada prueba.')
    :playerUiText('En móvil, mueve la bola para caminar y arrastra el fondo para mirar. En PC, haz clic en la escena y usa WASD o las flechas.'));
  controls.append(technology,help);

  const renderTrial=async()=>{
    joystick?.reset();
    scene.reset();
    controls.querySelectorAll('.p2lrn-3d-trial').forEach((node)=>node.remove());
    const trial=game.data.trials[trialIndex];
    const assembly=trial.type==='assembly-3d';
    scene.setAssemblyMode?.(assembly);
    if(joystick?.element){joystick.element.hidden=assembly;joystick.element.style.display=assembly?'none':'';}
    // Assembly is a directly manipulable model, not a walking simulation.
    // No entry overlay may cover a destination or staging piece.
    entryHint.hidden=assembly;
    entryHint.style.display=assembly?'none':'';
    entryHint.querySelector('small').textContent=playerUiText(assembly
      ?'Todas las piezas están a la vista: arrastra una pieza a una caja. Arrastra el fondo para girar la cámara.'
      :'Usa WASD o las flechas para caminar y arrastra el fondo para mirar.');
    help.textContent=playerUiText(assembly
      ?'Todas las piezas y sus destinos están visibles. Arrastra una pieza hasta su caja; gira la cámara con el fondo y usa la rueda para acercarte.'
      :'En móvil, mueve la bola para caminar y arrastra el fondo para mirar. En PC, usa WASD o las flechas.');
    const wrap=el('div',{class:'p2lrn-3d-trial'});
    heading.replaceChildren(
      el('p',{class:'p2lrn-game-description'},playerUiText(`Prueba ${trialIndex+1} de ${game.data.trials.length}`)),
      el('h3',{},trial.prompt),
    );

    let controller;
    if(trial.type==='ordering-3d') controller=buildOrderingControls({trial,runtime,scene,status});
    else if(trial.type==='matching-3d') controller=buildMatchingControls({trial,runtime,scene,status});
    else if(trial.type==='classification-3d') controller=buildClassificationControls({trial,runtime,scene,status});
    else if(trial.type==='assembly-3d') controller=await buildAssemblyControls({trial,runtime,scene,status,pkg:packageSource});
    else throw new Error(`Unsupported P2LRN 3D trial: ${trial.type}`);

    const instructions={
      'ordering-3d':'Haz clic en una caja y después en el pedestal numerado, o arrastra la caja hasta él.',
      'matching-3d':'Haz clic en una caja azul y luego en su pareja morada para enlazarlas, o arrastra la cuerda.',
      'classification-3d':'Haz clic en una caja y después en su categoría, o arrastra la caja hasta la zona correcta.',
      'assembly-3d':'Todas las piezas empiezan desordenadas; arrástralas desde su zona de salida hasta los destinos correctos.',
    };
    setText(directions,playerUiText(instructions[trial.type]));
    currentInteraction=controller.interact;
    currentDrag=controller.drag??(()=>false);
    const alternative=el('div',{class:'p2lrn-3d-alternative'});
    alternative.append(controller.panel);
    wrap.append(alternative);

    const nav=el('div',{class:'p2lrn-game-actions'});
    const previous=el('button',{type:'button',class:'p2lrn-game-button',disabled:trialIndex===0},playerUiText('Anterior'));
    const next=el('button',{type:'button',class:'p2lrn-game-button',disabled:trialIndex===game.data.trials.length-1},playerUiText('Siguiente'));
    previous.addEventListener('click',()=>{trialIndex-=1;renderTrial().catch(error=>setText(status,error.message));});
    next.addEventListener('click',()=>{trialIndex+=1;renderTrial().catch(error=>setText(status,error.message));});
    nav.append(previous,next);
    if(game.data.trials.length>1)wrap.append(nav);
    controls.append(wrap);
    setText(status,controller.summary??playerUiText('Toca o arrastra las cajas en la escena para responder.'));
  };

  await renderTrial();
  layout.append(heading,directions,stage,controls);
  shell.append(layout);
  // For a single-trial assembly the canvas is only attached now. Frame it
  // using its actual rendered aspect ratio, not the off-DOM fallback size.
  if(game.data.trials[trialIndex]?.type==='assembly-3d'&&!accessibleOnly){
    requestAnimationFrame(()=>scene.frameObjects?.([
      ...game.data.trials[trialIndex].scene.targets.map(t=>'assembly-target:'+t.id),
      ...game.data.trials[trialIndex].scene.pieces.map(p=>'assembly:'+p.id),
      ...(game.data.trials[trialIndex].scene.referenceAssetId?['assembly-reference']:[]),
    ],{padding:1.28}));
  }
  finishPanel(runtime,shell);
  shell.append(status);

  const originalDestroy=runtime.destroy.bind(runtime);
  runtime.destroy=()=>{
    joystick?.destroy();
    document.removeEventListener('fullscreenchange',updateFullscreen);
    if(getFullscreen())void document.exitFullscreen().catch(()=>{});
    canvas.removeEventListener('focus',enterScene);
    canvas.removeEventListener('pointerdown',enterScene);
    canvas.removeEventListener('click',enterScene);
    scene.destroy();
    originalDestroy();
  };
  return runtime;
}
