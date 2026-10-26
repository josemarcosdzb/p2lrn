import {THREE_D_RENDERER} from '../renderer-registry.js';
import {
  appendUniqueConnection,
  classificationIsCorrect,
  connectionKey,
  orderingIsCorrect,
  validateConnection,
} from '../game-3d-mechanics.js';
import {createThreeGameScene} from '../game-3d/three-runtime.js';
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
      text:`Posición ${index+1}`,
      position:p,
      size:[2.35,0.22,1.85],
      color:'#1d4ed8',
      interaction:{kind:'ordering-slot',index},
    });
  });

  const panel=el('div',{class:'p2lrn-3d-accessible'});
  const title=el('p',{class:'p2lrn-game-description'},'Selecciona un objeto y después una posición. También puedes usar los selectores accesibles.');
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
    if (!itemId) { setText(status,'Selecciona primero un objeto.'); return false; }
    const current=placed.indexOf(itemId);
    const occupied=placed[slotIndex];
    if (occupied && occupied!==itemId) {
      setText(status,`La posición ${slotIndex+1} ya está ocupada.`);
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
      setText(status,orderingIsCorrect(order,trial.correctOrder)?'Orden correcto.':'Orden completo; puedes seguir ajustándolo.');
    } else {
      setText(status,`Objeto colocado en la posición ${slotIndex+1}.`);
    }
    return true;
  }

  trial.objects.forEach((item)=>{
    const row=el('label',{class:'p2lrn-q-field'});
    row.append(el('span',{},item.text));
    const select=el('select');
    select.append(el('option',{value:''},'Sin colocar'));
    placed.forEach((_,index)=>select.append(el('option',{value:String(index)},`Posición ${index+1}`)));
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
        setText(status,'Objeto devuelto a la zona de salida.');
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
        setText(status,'Arrastra el bloque hasta una posición.');
        return true;
      }
      if(phase==='move'){if(position)scene.setTranslation(`order:${meta.id}`,position);return true;}
      if(phase==='end'){
        const success=target?.kind==='ordering-slot'&&place(meta.id,target.index);
        if(!success){
          syncObject(meta.id);
          scene.highlight(`order:${meta.id}`,false);
          setText(status,'Suelta el bloque sobre una posición disponible.');
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
      if(runtime.state.completed){setText(status,'Esta actividad ya está finalizada.');return true;}
      if(meta.kind==='ordering-object'){
        if(scene.playerDistanceTo(`order:${meta.id}`)>3.15){setText(status,'Acércate al bloque para cogerlo.');return true;}
        if(selected&&selected!==meta.id){setText(status,'Ya llevas un objeto. Colócalo antes de coger otro.');return true;}
        selected=meta.id;
        scene.highlight(`order:${selected}`,true);
        scene.carry(`order:${selected}`,true);
        setText(status,'Objeto seleccionado. Elige una posición.');
        return true;
      }
      if(meta.kind==='ordering-slot'){
        if(scene.playerDistanceTo(`order-slot:${meta.index}`)>3.15){setText(status,'Acércate al pedestal para colocar el bloque.');return true;}
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

  function chooseLeft(id) {
    if(activeRope){scene.disconnect(activeRope);activeRope=null;}
    if(selected) scene.highlight(`left:${selected}`,false);
    selected=id;
    scene.highlight(`left:${selected}`,true);
    activeRope=scene.connectToPlayer(`left:${selected}`);
    leftButtons.forEach((button,key)=>button.classList.toggle('is-selected',key===id));
    setText(status,'Origen seleccionado. Elige su pareja.');
  }

  function chooseRight(id) {
    if(!selected){setText(status,'Selecciona primero un elemento de la izquierda.');return false;}
    const validation=validateConnection(selected,id,expected,solved);
    if(!validation.ok){
      if(activeRope){scene.disconnect(activeRope);activeRope=null;}
      scene.highlight(`left:${selected}`,false);
      selected=null;leftButtons.forEach((button)=>button.classList.remove('is-selected'));
      setText(status,'Esa relación no es correcta. Busca otra pareja.');return false;
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
    setText(status,`Conexión correcta · ${connections.length}/${trial.connections.length}`);
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
        if(runtime.state.completed)return false;
        chooseLeft(meta.id);
        if(activeRope){scene.disconnect(activeRope);activeRope=null;}
        activeRope=scene.connectToPointer(`left:${meta.id}`);
        if(position)scene.setPointerTarget(position);
        setText(status,'Lleva la cuerda hasta la pareja en la escena.');
        return true;
      }
      if(phase==='move'){if(position)scene.setPointerTarget(position);return true;}
      if(phase==='end'){
        if(target?.kind==='matching-right')chooseRight(target.id);
        else {clearSelection();setText(status,'Suelta la cuerda encima de su pareja.');}
        return true;
      }
      if(phase==='cancel'){clearSelection();return true;}
      return false;
    },
    interact(meta) {
      if(runtime.state.completed){setText(status,'Esta actividad ya está finalizada.');return true;}
      if(meta.kind==='matching-left'){
        if(scene.playerDistanceTo(`left:${meta.id}`)>3.15){setText(status,'Acércate al bloque de origen para coger la cuerda.');return true;}
        chooseLeft(meta.id);return true;
      }
      if(meta.kind==='matching-right'){
        if(scene.playerDistanceTo(`right:${meta.id}`)>3.15){setText(status,'Acércate al bloque de destino para enganchar la cuerda.');return true;}
        chooseRight(meta.id);return true;
      }
      return false;
    },
  };
}

function buildClassificationControls({trial,runtime,scene,status}) {
  const expected=new Map(trial.assignments.map((item)=>[item.itemId,item.categoryId]));
  const values={};
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

  function moveToCategory(itemId,categoryId) {
    const expectedCategory=expected.get(itemId);
    if(expectedCategory!==categoryId){
      setText(status,'Esa categoría no es correcta.');
      return false;
    }
    values[itemId]=categoryId;
    scene.carry(`classify:${itemId}`,false);
    scene.highlight(`classify:${itemId}`,false);
    if(selected===itemId)selected=null;
    runtime.applyPatch(trial.questionId,{kind:'classification-set',itemId,categoryId});
    const categoryIndex=trial.categories.findIndex((item)=>item.id===categoryId);
    const base=classificationZonePosition(categoryIndex,trial.categories.length);
    const siblings=Object.entries(values).filter(([,value])=>value===categoryId).map(([id])=>id);
    const offset=siblings.indexOf(itemId);
    scene.setTranslation(`classify:${itemId}`,[base[0]+((offset%3)-1)*0.9,0.72,base[2]+1.25+Math.floor(offset/3)*0.95]);
    selects.get(itemId).value=categoryId;
    setText(status,classificationIsCorrect(values,expected)?'Clasificación completada correctamente.':'Objeto clasificado correctamente.');
    return true;
  }

  trial.objects.forEach((item)=>{
    const row=el('label',{class:'p2lrn-q-field'});
    row.append(el('span',{},item.text));
    const select=el('select');
    select.append(el('option',{value:''},'Selecciona categoría…'));
    trial.categories.forEach((category)=>select.append(el('option',{value:category.id},category.text)));
    select.addEventListener('change',()=>{
      if(!select.value){select.value=values[item.id]??'';return;}
      if(!moveToCategory(item.id,select.value)) select.value=values[item.id]??'';
    });
    selects.set(item.id,select);
    row.append(select);
    panel.append(row);
  });

  return {
    panel,
    interact(meta) {
      if(meta.kind==='classification-object'){
        if(scene.playerDistanceTo(`classify:${meta.id}`)>3.15){setText(status,'Acércate al bloque para cogerlo.');return true;}
        if(selected&&selected!==meta.id){setText(status,'Ya llevas un objeto. Deposítalo antes de coger otro.');return true;}
        selected=meta.id;
        scene.highlight(`classify:${selected}`,true);
        scene.carry(`classify:${selected}`,true);
        setText(status,'Objeto seleccionado. Elige una categoría.');
        return true;
      }
      if(meta.kind==='classification-category'){
        if(scene.playerDistanceTo(`category:${meta.id}`)>3.25){setText(status,'Acércate a la categoría para colocar el bloque.');return true;}
        if(!selected){setText(status,'Selecciona primero un objeto.');return true;}
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

export async function render(options) {
  const {game,runtime,shell}=await setupGame({...options,rendererId:THREE_D_RENDERER});
  const layout=el('div',{class:'p2lrn-3d-layout'});
  const canvas=el('canvas',{
    class:'p2lrn-3d-canvas',
    width:'960',
    height:'540',
    'aria-label':'Escena 3D interactiva del ejercicio',
  });
  const controls=el('div',{class:'p2lrn-3d-controls'});
  const status=statusNode('Preparando escena 3D…');
  let trialIndex=0;
  let currentInteraction=()=>false;

  const scene=await createThreeGameScene(canvas,{
    onInteraction:(meta)=>currentInteraction(meta),
  });

  const technology=el('p',{class:'p2lrn-3d-runtime'},`Three.js · física: ${scene.physics==='rapier'?'Rapier':'fallback sin físicas'}`);
  const help=el('p',{class:'p2lrn-game-description'},'Muévete con WASD/flechas. Arrastra sobre el fondo para girar la cámara. Acércate y pulsa un bloque para cogerlo; en Relacionar llevarás el extremo de una cuerda flexible hasta su pareja.');
  const movePad=el('div',{class:'p2lrn-3d-move-pad','aria-label':'Controles de movimiento'});
  for(const [label,direction] of [['▲','forward'],['◀','left'],['▼','back'],['▶','right']]){
    const button=el('button',{type:'button',class:'p2lrn-game-button','aria-label':direction},label);
    button.addEventListener('click',()=>scene.nudgePlayer(direction));
    movePad.append(button);
  }
  const resetView=el('button',{type:'button',class:'p2lrn-game-button'},'Recentrar jugador');
  resetView.addEventListener('click',()=>scene.resetPlayer());
  controls.append(technology,help,movePad,resetView);

  const renderTrial=()=>{
    scene.reset();
    controls.querySelectorAll('.p2lrn-3d-trial').forEach((node)=>node.remove());
    const trial=game.data.trials[trialIndex];
    const wrap=el('div',{class:'p2lrn-3d-trial'});
    wrap.append(
      el('p',{class:'p2lrn-game-description'},`Prueba ${trialIndex+1} de ${game.data.trials.length}`),
      el('h3',{},trial.prompt),
    );

    let controller;
    if(trial.type==='ordering-3d') controller=buildOrderingControls({trial,runtime,scene,status});
    else if(trial.type==='matching-3d') controller=buildMatchingControls({trial,runtime,scene,status});
    else if(trial.type==='classification-3d') controller=buildClassificationControls({trial,runtime,scene,status});
    else throw new Error(`Unsupported P2LRN 3D trial: ${trial.type}`);

    currentInteraction=controller.interact;
    wrap.append(controller.panel);

    const nav=el('div',{class:'p2lrn-game-actions'});
    const previous=el('button',{type:'button',class:'p2lrn-game-button',disabled:trialIndex===0},'Anterior');
    const next=el('button',{type:'button',class:'p2lrn-game-button',disabled:trialIndex===game.data.trials.length-1},'Siguiente');
    previous.addEventListener('click',()=>{trialIndex-=1;renderTrial();});
    next.addEventListener('click',()=>{trialIndex+=1;renderTrial();});
    nav.append(previous,next);
    wrap.append(nav);
    controls.append(wrap);
    setText(status,'Selecciona elementos en la escena o utiliza los controles accesibles.');
  };

  renderTrial();
  layout.append(canvas,controls);
  shell.append(layout);
  finishPanel(runtime,shell);
  shell.append(status);

  const originalDestroy=runtime.destroy.bind(runtime);
  runtime.destroy=()=>{
    scene.destroy();
    originalDestroy();
  };
  return runtime;
}
