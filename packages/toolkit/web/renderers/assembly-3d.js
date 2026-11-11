// The assembly mode plugs into the existing questionnaire 3D renderer/runtime.
// Classification answers remain the authoritative, resumable grading contract.
import {evaluateAssemblyPlacement,inspectAssemblyGLB,validateAssembly,assemblyPlacementTransform,scatterAssemblyStarts,stagedAssemblyVisualTransform} from '../assembly-3d-core.js';
import {playerUiText} from './ui-i18n.js';
import {el} from './game-common.js';

function quaternionTurn(q,axis,degrees){
  const a=degrees*Math.PI/360,c=Math.cos(a),s=Math.sin(a);
  const r=axis==='x'?[s,0,0,c]:axis==='y'?[0,s,0,c]:[0,0,s,c];
  const [x,y,z,w]=q,[a1,b1,c1,d1]=r;
  const result=[w*a1+x*d1+y*c1-z*b1,w*b1-x*c1+y*d1+z*a1,w*c1+x*b1-y*a1+z*d1,w*d1-x*a1-y*b1-z*c1];
  const len=Math.hypot(...result);
  return result.map(v=>v/len);
}
const fromJson=(o)=>structuredClone(o);
const boxId=(id)=>'assembly:'+id;
const zoneId=(id)=>'assembly-target:'+id;
const reasonText={
  'wrong-target':'La pieza no corresponde a ese destino.',
  'prerequisite':'Antes hay que colocar las piezas previas de este montaje.',
  'outside':'La pieza debe situarse dentro de la zona indicada.',
  'rotation':'La orientación de la pieza no coincide con el montaje.',
  'misaligned':'Ajusta el centro de la pieza dentro de la caja de encaje.',
  'outside-volume':'Parte de la pieza queda fuera del volumen de encaje.',
  'scale':'La pieza tiene un tamaño distinto del configurado por el profesor.',
  'invalid-transform':'La posición de la pieza no es válida.',
};

export async function buildAssemblyControls({trial,runtime,scene,status,pkg,onProgress=()=>{}}){
  const config=validateAssembly(trial.scene);
  const expected=new Map(config.links.map(l=>[l.pieceId,l.targetId]));
  const targetById=new Map(config.targets.map(t=>[t.id,t]));
  const pieceById=new Map(config.pieces.map(p=>[p.id,p]));
  const stored=runtime.answer(trial.questionId)?.classifications??{};
  const placements=Object.fromEntries(Object.entries(stored).filter(([id,target])=>expected.get(id)===target));
  const attempt=Number(runtime.state.attemptsCompleted??0)+1;
  const scatterKey='3d:assembly:scatter:'+trial.questionId+':attempt-'+attempt;
  const previouslySaved=runtime.getGameState(scatterKey,null);
  const seed=Number.isInteger(previouslySaved?.seed)&&previouslySaved.seed>=0&&previouslySaved.seed<=0xffffffff
    ?previouslySaved.seed:
    (typeof globalThis.crypto?.getRandomValues==='function'
      ?globalThis.crypto.getRandomValues(new Uint32Array(1))[0]
      :Math.floor(Math.random()*0x100000000));
  if(!previouslySaved&&!runtime.state.completed)runtime.setGameState(scatterKey,{seed});
  const startPositions=scatterAssemblyStarts(config,seed);
  const transforms=new Map(config.pieces.map(p=>[p.id,fromJson(startPositions[p.id])]));
  // Same released-pose rule as ordering/classification. Assembly also keeps
  // the authored orientation and scale for custom glTF geometry.
  const poseKey=`3d:assembly:free-poses:${trial.questionId}:attempt-${attempt}`;
  const savedPoses=runtime.getGameState(poseKey,null);
  const freePoses=new Map();
  const finite=(values,n)=>Array.isArray(values)&&values.length===n&&values.every(Number.isFinite);
  const validPose=pose=>pose&&finite(pose.position,3)&&finite(pose.rotation,4)&&
    finite(pose.scale,3)&&pose.scale.every(value=>value>0&&value<=10000)&&
    pose.position.every(value=>Math.abs(value)<100000)&&
    Math.hypot(...pose.rotation)>0.0001;
  function persistFreePose(id,pose){
    if(!pieceById.has(id))return;
    if(validPose(pose))freePoses.set(id,fromJson(pose));
    else freePoses.delete(id);
    runtime.setGameState(poseKey,Object.fromEntries(freePoses));
  }
  let dragging=null;
  const modelBytes=new Map();
  let selected=null;
  let sceneLoadWarning='';

  async function embeddedAsset(assetId){
    const asset=config.assets.find(a=>a.id===assetId);
    if(!asset||!pkg?.payload)throw new Error('Recurso de modelo 3D no incorporado al curso');
    if(!modelBytes.has(assetId)){
      modelBytes.set(assetId,(async()=>{
        const bytes=await pkg.payload(asset.path).read();
        const info=inspectAssemblyGLB(bytes);
        if(info.size!==asset.size)throw new Error('Los bytes del modelo no coinciden con los metadatos del curso');
        return bytes;
      })());
    }
    return modelBytes.get(assetId);
  }
  for(const dest of config.targets){
    scene.addCage({
      id:zoneId(dest.id),vertices:dest.vertices,
      position:dest.transform.position,rotation:dest.transform.rotation,scale:dest.transform.scale,
      visibility:dest.visibility,interaction:{kind:'assembly-target',id:dest.id},
    });
  }
  for(const piece of config.pieces){
    const id=boxId(piece.id),transform=transforms.get(piece.id);
    if(piece.assetId){
      try{
        const bytes=await embeddedAsset(piece.assetId);
        await scene.addModel({id,assetId:piece.assetId,bytes,nodeId:piece.nodeId??null,
          position:transform.position,rotation:transform.rotation,scale:transform.scale,
          interaction:{kind:'assembly-piece',id:piece.id}});
      }catch(error){
        sceneLoadWarning=playerUiText('Algún modelo 3D no se pudo cargar. Puedes completar el montaje con los controles accesibles.');
        scene.addBox({id,text:piece.text,position:transform.position,size:[1.2,0.8,1],dynamic:false,physicsEnabled:false,interaction:{kind:'assembly-piece',id:piece.id}});
        console.warn('P2LRN assembly 3D model load blocked:',error);
      }
    }else scene.addBox({id,text:piece.text,position:transform.position,size:[1.2,0.8,1],dynamic:false,physicsEnabled:false,interaction:{kind:'assembly-piece',id:piece.id}});
    const measured=scene.getObjectLocalBounds?.(id);
    if(measured){
      try{
        const aligned=stagedAssemblyVisualTransform(transform,measured);
        transforms.set(piece.id,aligned);
        startPositions[piece.id]=fromJson(aligned);
        scene.setTransform(id,aligned);
      }catch(error){
        console.warn('P2LRN assembly staging pivot adjustment rejected:',error);
      }
    }
    // Restore free movement AFTER measuring the GLB/pivot; never overwrite
    // a completed placement or trust malformed saved transforms.
    const saved=savedPoses&&Object.hasOwn(savedPoses,piece.id)?savedPoses[piece.id]:null;
    if(!placements[piece.id]&&validPose(saved)){
      const pose=fromJson(saved);
      freePoses.set(piece.id,pose);
      transforms.set(piece.id,pose);
      scene.setTransform(id,pose);
    }
  }
  if(config.referenceAssetId){
    try{
      const bytes=await embeddedAsset(config.referenceAssetId);
      await scene.addModel({id:'assembly-reference',assetId:config.referenceAssetId,bytes,
        position:config.referenceTransform?.position??[0,0,0],
        rotation:config.referenceTransform?.rotation??[0,0,0,1],
        scale:config.referenceTransform?.scale??[1,1,1],opacity:0.36});
    }catch(error){console.warn('P2LRN assembly reference model unavailable:',error);sceneLoadWarning=playerUiText('No se pudo cargar el modelo base de referencia.');}
  }

  const panel=el('div',{class:'p2lrn-3d-accessible'});
  const instruction=el('p',{class:'p2lrn-game-description'},playerUiText('Todas las piezas empiezan separadas y desordenadas fuera de las cajas. Arrastra cada pieza a su destino en esta misma vista 3D. Puedes girar la escena y acercar la cámara.'));
  const rows=el('div',{class:'p2lrn-q-fields'});
  const controls=el('div',{class:'p2lrn-game-actions'});
  const pieceSelect=el('select',{'aria-label':playerUiText('Pieza que vas a colocar')});
  const targetSelect=el('select',{'aria-label':playerUiText('Zona donde colocar la pieza')});
  for(const p of config.pieces)pieceSelect.append(el('option',{value:p.id},p.text));
  for(const t of config.targets)targetSelect.append(el('option',{value:t.id},t.text));
  const rotateInfo=el('p',{class:'p2lrn-game-description'},playerUiText('Gira la pieza por ejes de 15 grados:'));
  const rotateButtons=el('div',{class:'p2lrn-game-actions'});
  const progress=el('p',{class:'p2lrn-game-description',role:'status','aria-live':'polite'});
  const placeButton=el('button',{type:'button',class:'p2lrn-game-button'},playerUiText('Colocar pieza'));
  const resetButton=el('button',{type:'button',class:'p2lrn-game-button'},playerUiText('Restaurar orientación'));
  const restartButton=el('button',{type:'button',class:'p2lrn-game-button'},playerUiText('Reiniciar pieza'));
  const frameButton=el('button',{type:'button',class:'p2lrn-game-button'},playerUiText('Centrar montaje'));
  const allPlaced=()=>Object.keys(placements).length===config.pieces.length;
  const activeId=()=>selected??pieceSelect.value;
  function setText(value){status.textContent=playerUiText(value);}
  function update(){
    progress.textContent=playerUiText('Piezas colocadas: ')+Object.keys(placements).length+'/'+config.pieces.length;
    rows.replaceChildren();
    for(const p of config.pieces){
      const row=el('div',{class:'p2lrn-q-field'});
      row.append(el('span',{},p.text));
      row.append(el('strong',{},placements[p.id]?playerUiText('Encajada'):playerUiText('Pendiente')));
      rows.append(row);
    }
    const locked=runtime.state.completed||allPlaced();
    placeButton.disabled=locked||Boolean(placements[activeId()]);
    resetButton.disabled=locked||Boolean(placements[activeId()]);
    restartButton.disabled=locked||Boolean(placements[activeId()]);
    rotateButtons.querySelectorAll('button').forEach(b=>{b.disabled=locked||Boolean(placements[activeId()]);});
    if(allPlaced())setText('Montaje completado. Puedes finalizar la actividad.');
  }
  function releaseSelected(){
    if(selected===null)return;
    const id=selected,live=scene.getTranslation?.(boxId(id));
    scene.carry(boxId(id),false);
    if(!placements[id]&&finite(live,3)){
      // Use the last rendered position, not the old authored transform.
      // This is the same click-to-carry/release contract as ordering and
      // classification, but keeps the assembly mesh's rotation and scale.
      const next={...transforms.get(id),position:[...live]};
      transforms.set(id,next);
      persistFreePose(id,next);
    }
    scene.highlight(boxId(id),false);
    selected=null;
  }
  function choosePiece(id,{carry=false}={}){
    if(!pieceById.has(id)||runtime.state.completed||placements[id])return false;
    if(selected!==null&&selected!==id)releaseSelected();
    selected=id;pieceSelect.value=id;
    scene.highlight(boxId(id),true);
    if(carry)scene.carry(boxId(id),true);
    setText('Pieza seleccionada. Oriéntala y selecciona su destino.');
    update();return true;
  }
  function place(id,targetId,{draggedPosition=null}={}){
    if(runtime.state.completed||!pieceById.has(id)||placements[id])return false;
    const target=targetById.get(targetId);
    if(!target){setText('Selecciona un destino válido.');return false;}
    const desired=assemblyPlacementTransform(config,id);
    const current=transforms.get(id);
    // Accessible selection uses the authored visual fitting pose, with the
    // student's own orientation/scale. Physical dragging must validate its
    // ACTUAL released location; it may never teleport to the answer first.
    const placement={
      position:draggedPosition?[...draggedPosition]:[...desired.position],
      rotation:[...current.rotation],scale:[...current.scale],
    };
    const result=evaluateAssemblyPlacement(config,id,targetId,placement,placements);
    if(!result.ok){setText(reasonText[result.reason]??'La pieza no encaja.');return false;}
    placements[id]=targetId;
    persistFreePose(id,null);
    transforms.set(id,{...current,...fromJson(result.snap)});
    runtime.applyPatch(trial.questionId,{kind:'classification-set',itemId:id,categoryId:targetId});
    onProgress();
    scene.carry(boxId(id),false);
    scene.highlight(boxId(id),false);
    scene.setTransform(boxId(id),result.snap);
    selected=null;
    const next=config.pieces.find(p=>!placements[p.id]);
    if(next)pieceSelect.value=next.id;
    setText('Pieza encajada correctamente.');
    update();return true;
  }
  function restore(id){
    const p=pieceById.get(id);if(!p||placements[id])return;
    const transform=transforms.get(id);
    scene.carry(boxId(id),false);
    scene.setTransform(boxId(id),transform);
  }

  for(const [axis,label] of [['x','X'],['y','Y'],['z','Z']]){
    for(const turn of [-15,15]){
      const button=el('button',{type:'button',class:'p2lrn-game-button'},label+(turn<0?' −15°':' +15°'));
      button.addEventListener('click',()=>{
        const id=activeId();if(!id||runtime.state.completed||placements[id])return;
        choosePiece(id);
        const transform=transforms.get(id);
        transform.rotation=quaternionTurn(transform.rotation,axis,turn);
        scene.setTransform(boxId(id),transform);
        persistFreePose(id,transform);
        setText('Orientación actualizada en eje '+label+'.');
      });
      rotateButtons.append(button);
    }
  }
  pieceSelect.addEventListener('change',()=>choosePiece(pieceSelect.value));
  placeButton.addEventListener('click',()=>{const id=activeId();if(id)place(id,targetSelect.value);});
  resetButton.addEventListener('click',()=>{
    const id=activeId(),piece=pieceById.get(id);if(!piece||placements[id])return;
    const current=transforms.get(id);
    // Reset orientation only. Moving a piece must never be undone by this action.
    const next={...current,rotation:[...startPositions[id].rotation]};
    transforms.set(id,next);scene.setTransform(boxId(id),next);
    persistFreePose(id,next);
    setText('Orientación restaurada.');
  });
  restartButton.addEventListener('click',()=>{
    const id=activeId();if(!pieceById.has(id)||placements[id])return;
    transforms.set(id,fromJson(startPositions[id]));
    scene.setTransform(boxId(id),transforms.get(id));
    persistFreePose(id,null); // The explicit restart discards the free pose.
    setText('Pieza reiniciada.');
  });
  const assemblyObjects=[
    ...config.targets.map(t=>zoneId(t.id)),
    ...config.pieces.map(p=>boxId(p.id)),
    ...(config.referenceAssetId?['assembly-reference']:[]),
  ];
  frameButton.addEventListener('click',()=>{
    scene.frameObjects?.(assemblyObjects,{padding:1.28});
    setText('Vista del montaje centrada.');
  });
  controls.append(pieceSelect,targetSelect,placeButton,resetButton,restartButton,frameButton);
  panel.append(instruction,controls,rotateInfo,rotateButtons,progress,rows);
  for(const [id,target] of Object.entries(placements)){
    const t=targetById.get(target);
    if(t)scene.setTransform(boxId(id),assemblyPlacementTransform(config,id)??t.transform);
  }
  scene.frameObjects?.(assemblyObjects,{padding:1.28});
  if(sceneLoadWarning)panel.prepend(el('p',{class:'p2lrn-game-description',role:'alert'},sceneLoadWarning));
  update();
  return {
    panel,
    summary:sceneLoadWarning||playerUiText('Elige una pieza y colócala dentro de la estructura.'),
    drag(meta,phase,{position=null,target=null}={}){
      if(meta.kind!=='assembly-piece')return false;
      const id=meta.id;
      if(phase==='start'){
        if(!choosePiece(id))return false;
        const from=transforms.get(id);
        dragging={id,original:fromJson(from),lastPosition:[...from.position],
          offset:position?from.position.map((n,i)=>n-position[i]):[0,0,0]};
        return true;
      }
      if(!dragging||dragging.id!==id)return false;
      if(phase==='move'){
        if(position){
          const moving=position.map((n,i)=>n+dragging.offset[i]);
          if(moving.every(Number.isFinite)){
            dragging.lastPosition=moving;
            scene.setTranslation(boxId(id),moving);
          }
        }
        return true;
      }
      if(phase==='end'){
        // The piece stays where it was released. Only a valid physical
        // placement into a target can snap it; a missed drop is NOT a reset.
        const release=position?position.map((n,i)=>n+dragging.offset[i]):dragging.lastPosition;
        const finalPosition=release.every(Number.isFinite)?release:dragging.lastPosition;
        const current={...dragging.original,position:[...finalPosition]};
        transforms.set(id,current);
        scene.setTransform(boxId(id),current);
        persistFreePose(id,current);
        const overTarget=target?.kind==='assembly-target';
        const completed=overTarget&&place(id,target.id,{draggedPosition:finalPosition});
        scene.highlight(boxId(id),false);
        selected=null;
        if(!completed&&!overTarget)setText('Pieza desplazada. Sigue acercándola a su destino.');
        // Every completed pointer gesture releases the piece; selecting
        // another may not move the old one or leave it attached to the hand.
        dragging=null;update();
        return true;
      }
      if(phase==='cancel'){
        // An interrupted pointer gesture is a release, NOT a teleport.
        const current={...dragging.original,position:[...dragging.lastPosition]};
        transforms.set(id,current);
        scene.setTransform(boxId(id),current);
        persistFreePose(id,current);
        scene.highlight(boxId(id),false);selected=null;dragging=null;
        return true;
      }
      return false;
    },
    interact(meta){
      if(runtime.state.completed)return true;
      if(meta.kind==='scene-empty'){
        if(selected!==null){
          releaseSelected();
          setText('Pieza soltada donde la has dejado.');
          update();
        }
        return true;
      }
      if(meta.kind==='assembly-piece'){choosePiece(meta.id,{carry:true});return true;}
      if(meta.kind==='assembly-target'){
        if(!selected){setText('Selecciona una pieza antes de elegir destino.');return true;}
        place(selected,meta.id);return true;
      }
      return false;
    },
  };
}
