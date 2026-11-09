import {
  ASSEMBLY_MAX_PIECES,CAGE_EDGES,cageVertices,validCage,toWorld,toLocal,
  validateAssembly,inspectAssemblyGLB,fitAssemblyBounds,assemblyPlacementTransform,assemblyFitStatus,
} from '../assembly-3d-core.js';

// The authoring viewport is a lightweight geometric overlay. The same
// vertices, pivots and transforms feed the Player's Three.js runtime.
// It is not a second scene model or a static image.
const ns='http://www.w3.org/2000/svg';
const $=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=String(text);return n;};
const style=`
.p2lrn-assembly-editor{box-sizing:border-box;display:flex;flex-direction:column;gap:10px;width:100%;min-width:0;font-family:inherit;color:inherit}
.p2lrn-assembly-editor *{box-sizing:border-box}
.p2lrn-assembly-editor [hidden]{display:none!important}
.p2lrn-assembly-editor .a3-head{display:flex;align-items:center;justify-content:space-between;gap:9px;flex-wrap:wrap}
.p2lrn-assembly-editor .a3-head>strong{font-size:15px}
.p2lrn-assembly-editor .a3-toolbar{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.p2lrn-assembly-editor button,.p2lrn-assembly-editor select,.p2lrn-assembly-editor input,.p2lrn-assembly-editor textarea{font:inherit;border:1px solid #8295aa;border-radius:7px;padding:7px 9px;color:inherit;background:transparent;min-width:0}
.p2lrn-assembly-editor button{cursor:pointer;min-height:36px}
.p2lrn-assembly-editor button:focus-visible,.p2lrn-assembly-editor select:focus-visible,.p2lrn-assembly-editor input:focus-visible,.p2lrn-assembly-editor textarea:focus-visible,.p2lrn-assembly-editor summary:focus-visible{outline:3px solid #0d9488;outline-offset:2px}
.p2lrn-assembly-editor button[aria-pressed=true],.p2lrn-assembly-editor .a3-primary{background:#0f766e;color:#fff;border-color:#0f766e}
.p2lrn-assembly-editor .a3-main{display:block;min-width:0;width:100%}
.p2lrn-assembly-editor .a3-scene{position:relative;min-width:0;width:100%;border-radius:12px;overflow:hidden;background:radial-gradient(ellipse at 45% 45%,#183348,#071522)}
.p2lrn-assembly-editor .a3-scene>canvas,.p2lrn-assembly-editor .a3-scene>svg{display:block;width:100%;height:clamp(390px,65vh,780px);aspect-ratio:auto;touch-action:none;cursor:grab}
.p2lrn-assembly-editor .a3-scene:focus-within{outline:2px solid #0d9488}
.p2lrn-assembly-editor .a3-scene-note{position:absolute;z-index:2;bottom:8px;left:12px;right:12px;width:max-content;max-width:calc(100% - 24px);padding:6px 10px;border-radius:7px;color:#f8fafc;background:#071522e0;font-size:12px;pointer-events:none}
.p2lrn-assembly-editor .a3-pane{border:1px solid #90a1b474;border-radius:11px;padding:10px;min-width:0;display:grid;gap:8px}
.p2lrn-assembly-editor .a3-assets{position:absolute;z-index:5;top:12px;left:12px;max-height:calc(100% - 62px);overflow:auto;width:min(295px,calc(100% - 24px));border:1px solid #8998ae;background:#f8fafcee;color:#17263c;box-shadow:0 8px 24px #0206176e;border-radius:10px}
.p2lrn-assembly-editor .a3-assets:not([open]){width:auto;max-width:calc(100% - 24px)}
.p2lrn-assembly-editor .a3-assets>summary{cursor:pointer;padding:9px 13px;font-weight:700;list-style-position:inside}
.p2lrn-assembly-editor .a3-assets .a3-tree{display:grid;gap:5px;max-height:min(50vh,440px);overflow:auto;padding:6px 10px 10px}
.p2lrn-assembly-editor .a3-tree>button{width:100%;text-align:left}
.p2lrn-assembly-editor .a3-tree>label{display:grid;gap:4px}
.p2lrn-assembly-editor .a3-assets input,.p2lrn-assembly-editor .a3-assets select{width:100%;background:#fff;color:#17263c}
.p2lrn-assembly-editor .a3-properties{position:absolute;z-index:4;top:12px;right:12px;bottom:48px;max-height:calc(100% - 60px);overflow-y:auto;width:min(300px,calc(100% - 24px));background:#f8fafcf5;color:#17263c;box-shadow:0 8px 24px #02061780;align-content:start}
.p2lrn-assembly-editor .a3-panel-title{font-weight:700;font-size:14px}
.p2lrn-assembly-editor .a3-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}
.p2lrn-assembly-editor label{display:grid;gap:4px;font-size:12px;font-weight:600}
.p2lrn-assembly-editor .a3-fields input{width:100%;padding:6px 4px}
.p2lrn-assembly-editor .a3-property{display:grid;gap:7px}
.p2lrn-assembly-editor .a3-property select,.p2lrn-assembly-editor .a3-property input{width:100%;color:#17263c}
.p2lrn-assembly-editor .a3-hint{font-size:12px;line-height:1.45;opacity:.88}
.p2lrn-assembly-editor .a3-error{color:#b91c1c;min-height:1.3em;margin:0}
.p2lrn-assembly-editor .a3-activity-settings{position:relative;max-width:min(370px,90vw);z-index:8}
.p2lrn-assembly-editor .a3-activity-settings>summary{cursor:pointer;padding:8px 10px;border:1px solid #8295aa;border-radius:7px;list-style-position:inside;white-space:nowrap;font-size:13px}
.p2lrn-assembly-editor .a3-activity-settings[open]{background:#fff;border:1px solid #8295aa;border-radius:9px;padding:0 8px 8px}
.p2lrn-assembly-editor .a3-activity-settings-fields{display:grid;gap:7px;grid-template-columns:repeat(2,minmax(0,1fr));padding:8px;max-width:350px}
.p2lrn-assembly-editor .a3-activity-settings-fields>label:nth-child(-n+2){grid-column:1/-1}
.p2lrn-assembly-editor .a3-activity-settings-fields input,.p2lrn-assembly-editor .a3-activity-settings-fields select,.p2lrn-assembly-editor .a3-activity-settings-fields textarea{width:100%;background:#fff;color:#17263c}
@media(max-width:700px){.p2lrn-assembly-editor .a3-head{align-items:flex-start}.p2lrn-assembly-editor .a3-head>strong{width:100%}.p2lrn-assembly-editor .a3-scene>canvas,.p2lrn-assembly-editor .a3-scene>svg{height:clamp(340px,57vh,600px)}.p2lrn-assembly-editor .a3-properties{width:min(265px,70%)}.p2lrn-assembly-editor .a3-assets{width:min(250px,65%)}}
`;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const degrees=180/Math.PI;
function eulerQuat(a){const [x,y,z]=a.map(n=>n/degrees/2),cx=Math.cos(x),cy=Math.cos(y),cz=Math.cos(z),sx=Math.sin(x),sy=Math.sin(y),sz=Math.sin(z);return[
  sx*cy*cz-cx*sy*sz,cx*sy*cz+sx*cy*sz,cx*cy*sz-sx*sy*cz,cx*cy*cz+sx*sy*sz
];}
function quatEuler(q){const [x,y,z,w]=q;return[
  Math.atan2(2*(w*x+y*z),1-2*(x*x+y*y))*degrees,
  Math.asin(clamp(2*(w*y-z*x),-1,1))*degrees,
  Math.atan2(2*(w*z+x*y),1-2*(y*y+z*z))*degrees,
];}
function syncQuestion(question){
  const scene=question.assembly3d;
  question.items=scene.pieces.map(p=>({id:p.id,text:p.text}));
  question.categories=scene.targets.map(t=>({id:t.id,text:t.text}));
  question.solution={assignments:scene.links.map(l=>({item:l.pieceId,category:l.targetId}))};
}
function nextId(prefix,things){let n=1;while(things.some(x=>x.id===prefix+'-'+n))n++;return prefix+'-'+n}
function mountStyle(root){
  const owner=root instanceof ShadowRoot?root:document.head;
  if(owner.querySelector('style[data-p2lrn-assembly-style]'))return;
  const tag=$('style');tag.dataset.p2lrnAssemblyStyle='1';tag.textContent=style;owner.append(tag);
}
function numeric(value,callback,{min=-1000,max=1000,step=0.05}={}){
  const field=$('input');field.type='number';field.step=String(step);field.min=String(min);field.max=String(max);field.value=String(Math.round(value*1000)/1000);
  field.addEventListener('change',()=>{const n=Number(field.value);if(Number.isFinite(n)&&n>=min&&n<=max)callback(n);else field.value=String(Math.round(value*1000)/1000);});
  return field;
}

export function renderAssembly3DEditor(container,{question,model,commit,onStatus=()=>{},createScene=null}={}){
  if(!question?.assembly3d)throw Error('La actividad no tiene escena de montaje');
  // Cards are assembled detached from the DOM; wait until the editor is
  // attached so its styles reach either Document or the npm ShadowRoot.
  queueMicrotask(()=>mountStyle(container.getRootNode()));
  const scene=question.assembly3d,root=$('section','p2lrn-assembly-editor');
  const head=$('div','a3-head'),buttons=$('div','a3-toolbar'),main=$('div','a3-main');
  const tree=$('details','a3-assets'),center=$('div','a3-scene'),props=$('aside','a3-pane a3-properties');
  // A definite camera viewport prevents the canvas intrinsic 16:11 ratio
  // from making a second, scroll-length screen with the cage far below view.
  center.style.height='clamp(400px,65vh,720px)';
  center.style.position='relative';
  center.style.overflow='hidden';
  const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 600 410');svg.setAttribute('role','img');svg.setAttribute('aria-label','Editor 3D de piezas y volúmenes de encaje; gira arrastrando el fondo');
  svg.tabIndex=0;svg.hidden=true;svg.style.cssText='width:100%;height:100%;display:block;touch-action:none';
  const canvas=$('canvas','a3-webgl');canvas.hidden=false;canvas.tabIndex=0;canvas.style.cssText='width:100%;height:100%;display:block;touch-action:none';canvas.setAttribute('aria-label','Visor 3D editable; arrastra piezas, jaulas o vértices, y gira la cámara arrastrando el fondo');
  const note=$('div','a3-scene-note','La pieza aparece dentro de su destino. Arrástrala para ajustar el encaje; arrastra el fondo para girar.');
  const warning=$('p','a3-error');warning.setAttribute('role','status');warning.setAttribute('aria-live','polite');
  let selected={kind:'target',id:scene.targets[0]?.id},vertexIndex=0,showAll=false;
  let yaw=0.55,pitch=0.73,zoom=46,drag=null;
  let threeRuntime=null,threeDestroyed=false,threeSignature=null,threePending=false,threeGeneration=0,threeDrag=null;
  const history=[JSON.stringify(scene)],redo=[];
  const btn=(name,callback)=>{const b=$('button',null,name);b.type='button';b.addEventListener('click',callback);return b;};
  const message=(s)=>{warning.textContent=s;onStatus(s);};
  const snapshot=()=>{const value=JSON.stringify(scene);if(history.at(-1)!==value){history.push(value);if(history.length>50)history.shift();redo.length=0;}};
  function restore(value){
    const loaded=JSON.parse(value);
    for(const key of Object.keys(scene))delete scene[key];
    Object.assign(scene,loaded);syncQuestion(question);commit();drawAll();scheduleThreeSync();
  }
  function apply(mutator,{redraw=true,save=true}={}){
    const previous=JSON.stringify(scene);
    try{mutator();validateAssembly(scene,{requireReady:false});syncQuestion(question);
      if(save){commit();snapshot();}if(redraw)drawAll();scheduleThreeSync();message('');return true;
    }catch(error){const loaded=JSON.parse(previous);for(const k of Object.keys(scene))delete scene[k];Object.assign(scene,loaded);message(error.message||'Geometría inválida');if(redraw)drawAll();scheduleThreeSync();return false;}
  }
  const undo=btn('Deshacer',()=>{if(history.length<2)return;const current=history.pop();redo.push(current);restore(history.at(-1));});
  const redoButton=btn('Rehacer',()=>{if(!redo.length)return;const next=redo.pop();history.push(next);restore(next);});
  const add=btn('+ Pieza y destino',()=>{
    if(scene.pieces.length>=ASSEMBLY_MAX_PIECES){message('Máximo de piezas alcanzado');return;}
    const item=nextId('piece',scene.pieces),dest=nextId('target',scene.targets),n=scene.pieces.length;
    apply(()=>{scene.pieces.push({id:item,text:'Pieza '+(n+1),assetId:null,nodeId:null,initialTransform:{position:[(n%5-2)*1.9,0.85,2.5+Math.floor(n/5)],rotation:[0,0,0,1],scale:[1,1,1]}});scene.targets.push({id:dest,text:'Destino '+(n+1),vertices:cageVertices(),transform:{position:[(n%5-2)*1.85,1.2,-2.5-Math.floor(n/5)*1.8],rotation:[0,0,0,1],scale:[1,1,1]},visibility:'outline'});scene.links.push({pieceId:item,targetId:dest,positionTolerance:0.18,rotationToleranceDeg:22,prerequisites:[]});selected={kind:'target',id:dest};});
  });
  const remove=btn('Eliminar pareja',()=>{
    if(scene.pieces.length<=2)return message('El juego necesita al menos dos piezas');
    const link=scene.links.find(x=>x.pieceId===selected.id||x.targetId===selected.id);
    if(!link)return;
    apply(()=>{scene.links=scene.links.filter(x=>x!==link);scene.pieces=scene.pieces.filter(x=>x.id!==link.pieceId);scene.targets=scene.targets.filter(x=>x.id!==link.targetId);scene.links.forEach(x=>x.prerequisites=x.prerequisites.filter(y=>y!==link.pieceId));selected={kind:'target',id:scene.targets[0].id};});
  });
  const fit=btn('Ajustar pieza dentro de la caja',()=>fitSelected());
  fit.classList.add('a3-primary');
  const frame=btn('Centrar encaje',()=>focusSelection());
  const allPieces=btn('Ver todas las piezas',()=>{
    showAll=!showAll;
    allPieces.textContent=showAll?'Ver solo esta pieza':'Ver todas las piezas';
    allPieces.setAttribute('aria-pressed',String(showAll));
    syncThreeVisibility();
    if(!showAll)focusSelection();
    if(!svg.hidden)drawScene();
  });
  allPieces.setAttribute('aria-pressed','false');
  props.hidden=true;
  const settings=btn('Mostrar ajustes',()=>{
    props.hidden=!props.hidden;
    if(!props.hidden)tree.open=false;
    settings.textContent=props.hidden?'Mostrar ajustes':'Ocultar ajustes';
    settings.setAttribute('aria-expanded',String(!props.hidden));
    settings.setAttribute('aria-pressed',String(!props.hidden));
  });
  settings.setAttribute('aria-expanded','false');
  settings.setAttribute('aria-pressed','false');
  buttons.append(fit,frame,allPieces,settings,undo,redoButton,add,remove);
  head.append($('strong',null,'Ensamblaje 3D · editor de piezas y jaulas'),buttons);
  root.append(head);
  tree.append($('summary',null,'Piezas y modelos'));
  const entries=$('div','a3-tree');tree.append(entries);
  // Never mount both render surfaces. The fallback SVG stays detached unless
  // WebGL actually fails; a hidden second surface used to take up 637px and
  // pushed the real cage off-screen despite looking 'hidden' in DOM tests.
  center.append(canvas,note,tree,props);props.append($('strong',null,'Propiedades'));
  main.append(center);root.append(main,warning);container.replaceChildren(root);
  const centerPoint={x:300,y:212};
  const project=(p)=>{
    const rx=p[0]*Math.cos(yaw)-p[2]*Math.sin(yaw),rz=p[0]*Math.sin(yaw)+p[2]*Math.cos(yaw);
    return [centerPoint.x+zoom*rx,centerPoint.y-zoom*(p[1]*Math.cos(pitch)-rz*Math.sin(pitch)),rz];
  };
  const pointer=(e)=>{const r=svg.getBoundingClientRect();return[(e.clientX-r.left)*600/r.width,(e.clientY-r.top)*410/r.height];};
  const element=(tag,attrs={},parent=svg)=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));parent.append(n);return n;};
  const path=(pts,color,width=2,opacity=1)=>element('path',{d:pts.map(([x,y],i)=>(i?'L':'M')+x.toFixed(2)+' '+y.toFixed(2)).join(''),stroke:color,'stroke-width':width,'stroke-opacity':opacity,fill:'none'});
  function deltaWorld(dx,dy,vertical){
    if(vertical)return[0,-dy/(zoom*Math.cos(pitch)),0];
    const rx=dx/zoom,rz=dy/(zoom*Math.sin(pitch));
    return[rx*Math.cos(yaw)+rz*Math.sin(yaw),0,-rx*Math.sin(yaw)+rz*Math.cos(yaw)];
  }
  function drawScene(){
    svg.replaceChildren();
    const g=element('g',{'aria-hidden':'true'});
    const grid=Array.from({length:15},(_,i)=>i-7);
    grid.forEach(v=>{const line1=[[-7,0,v],[7,0,v]],line2=[[v,0,-7],[v,0,7]];const a=line1.map(project),b=line2.map(project);element('path',{d:'M'+a[0][0]+' '+a[0][1]+'L'+a[1][0]+' '+a[1][1],stroke:'#315069','stroke-width':1,opacity:0.6},g);element('path',{d:'M'+b[0][0]+' '+b[0][1]+'L'+b[1][0]+' '+b[1][1],stroke:'#315069','stroke-width':1,opacity:0.6},g);});
    const sortItems=[];
    scene.targets.forEach(target=>{const world=target.vertices.map(v=>toWorld(v,target.transform)),coords=world.map(project);sortItems.push({depth:project(target.transform.position)[2],run:()=>{
      const active=selected.kind==='target'&&selected.id===target.id;
      const group=element('g',{'data-kind':'target','data-id':target.id});
      CAGE_EDGES.forEach(([a,b])=>{const c=coords[a],d=coords[b];const line=element('path',{d:'M'+c[0]+' '+c[1]+' L'+d[0]+' '+d[1],stroke:active?'#5eead4':'#6bbac0','stroke-width':active?2.8:1.8,fill:'none','stroke-opacity':target.visibility==='hidden'?0.45:0.9},group);line.dataset.kind='target';line.dataset.id=target.id;line.style.cursor='move';});
      if(active)coords.forEach(([x,y],index)=>{const n=element('circle',{cx:x,cy:y,r:6,fill:index===vertexIndex?'#fef08a':'#14b8a6',stroke:'#ffffff','stroke-width':1.4,tabindex:'0',role:'button','aria-label':'Vértice '+(index+1)},group);n.dataset.kind='vertex';n.dataset.id=target.id;n.dataset.index=String(index);n.style.cursor='move';});
      const loc=project(target.transform.position);
      element('text',{x:loc[0]+7,y:loc[1]+8,fill:'#ccfbf1','font-size':12},group).textContent=target.text;
    }});});
    scene.pieces.forEach(piece=>{const p=project(assemblyPlacementTransform(scene,piece.id)?.position??piece.initialTransform.position);sortItems.push({depth:p[2],run:()=>{
      const active=selected.kind==='piece'&&selected.id===piece.id;
      const node=element('g',{'data-kind':'piece','data-id':piece.id});const box=element('rect',{x:p[0]-12,y:p[1]-12,width:24,height:24,rx:5,fill:active?'#fcd34d':'#60a5fa',stroke:'#e2e8f0','stroke-width':active?2:1},node);box.dataset.kind='piece';box.dataset.id=piece.id;box.style.cursor='move';element('text',{x:p[0]+16,y:p[1]+5,fill:'#eff6ff','font-size':12},node).textContent=piece.text;
    }});});
    sortItems.sort((a,b)=>b.depth-a.depth).forEach(item=>item.run());
  }
  function fieldset(label,values,onEdit,options={}){
    const wrap=$('div','a3-property'),cap=$('span','a3-panel-title',label),row=$('div','a3-fields');
    values.forEach((value,i)=>{const field=$('label');field.append($('span',null,['X','Y','Z'][i]));field.append(numeric(value,n=>onEdit(i,n),options));row.append(field);});
    wrap.append(cap,row);return wrap;
  }
  function propertyPanel(){
    props.replaceChildren($('strong',null,'Propiedades'));
    const obj=selected.kind==='piece'?scene.pieces.find(x=>x.id===selected.id):scene.targets.find(x=>x.id===selected.id);
    if(!obj){props.append($('p','a3-hint','Selecciona una pieza o destino.'));return}
    props.append($('div','a3-panel-title',(selected.kind==='piece'?'Pieza · ':'Destino · ')+obj.id));
    const name=$('label');name.append($('span',null,'Nombre educativo'));const nameInput=$('input');nameInput.type='text';nameInput.maxLength=100;nameInput.value=obj.text;nameInput.addEventListener('change',()=>apply(()=>{obj.text=nameInput.value.trim()||obj.text}));name.append(nameInput);props.append(name);
    if(selected.kind==='target'){
      const t=obj.transform;
      props.append(fieldset('Posición de la caja (m)',t.position,(axis,n)=>apply(()=>{t.position[axis]=n}),{step:0.1}));
      props.append(fieldset('Rotación de la caja (°)',quatEuler(t.rotation),(axis,n)=>apply(()=>{const xyz=quatEuler(t.rotation);xyz[axis]=n;t.rotation=eulerQuat(xyz)}),{min:-180,max:180,step:5}));
      props.append(fieldset('Escala de la caja',t.scale,(axis,n)=>apply(()=>{t.scale[axis]=n}),{min:0.001,max:100,step:0.1}));
      props.append($('p','a3-hint','La pieza asociada se ve dentro de esta caja. Arrastra la caja y la pieza seguirá el mismo destino; cambia los vértices para ajustar el volumen.'));

      const pick=$('label');pick.append($('span',null,'Vértice editable'));
      const sel=$('select');obj.vertices.forEach((v,i)=>{const o=$('option');o.value=String(i);o.textContent='V'+(i+1);o.selected=vertexIndex===i;sel.append(o);});sel.addEventListener('change',()=>{vertexIndex=Number(sel.value);drawScene();propertyPanel();});pick.append(sel);props.append(pick);
      props.append(fieldset('Vértice V'+(vertexIndex+1)+' (local)',obj.vertices[vertexIndex],(axis,n)=>apply(()=>{obj.vertices[vertexIndex][axis]=n}),{min:-100,max:100,step:0.1}));
      const vis=$('label');vis.append($('span',null,'Ayuda visual al alumno'));const vs=$('select');[['outline','Contorno'],['hint','Pista al aproximarse'],['hidden','Invisible']].forEach(([id,label])=>{const o=$('option');o.value=id;o.textContent=label;o.selected=obj.visibility===id;vs.append(o);});vs.addEventListener('change',()=>apply(()=>{obj.visibility=vs.value}));vis.append(vs);props.append(vis);
    }else{
      const pairedEntry=paired(obj.id),link=pairedEntry?.link;
      if(link){
        const pose=link.placement;
        props.append($('p','a3-hint','Encaje final dentro de «'+pairedEntry.target.text+'». Edita aquí el volumen y la colocación real; la posición de inicio del alumno se guarda aparte.'));
        if(pose){
          props.append(fieldset('Centro dentro de la caja (XYZ)',pose.offset,(axis,n)=>apply(()=>{pose.offset[axis]=n}),{min:-100,max:100,step:0.05}));
          props.append(fieldset('Giro dentro de la caja (°)',quatEuler(pose.rotation),(axis,n)=>apply(()=>{const xyz=quatEuler(pose.rotation);xyz[axis]=n;pose.rotation=eulerQuat(xyz)}),{min:-180,max:180,step:2}));
          props.append(fieldset('Tamaño de la pieza',pose.scale,(axis,n)=>apply(()=>{pose.scale[axis]=n}),{min:0.001,max:100,step:0.05}));
        }else props.append($('p','a3-hint','Elige «Ajustar pieza dentro de la caja» para medir el modelo y definir su encaje.'));
        const fitButton=btn('Medir y encajar automáticamente',()=>fitSelected());
        props.append(fitButton);
        if(pose){
          const result=assemblyFitStatus(scene,obj.id,assemblyPlacementTransform(scene,obj.id));
          props.append($('p','a3-hint',result.ok?'El modelo encaja dentro del volumen configurado.':'Ajusta la caja o la pieza: '+result.reason));
        }
      }
      const initial=$('details'),summary=$('summary',null,'Posición de salida del alumno (distinta del encaje)');
      initial.append(summary);
      const t=obj.initialTransform;
      initial.append(fieldset('Salida: posición',t.position,(axis,n)=>apply(()=>{t.position[axis]=n}),{step:0.1}));
      initial.append(fieldset('Salida: rotación',quatEuler(t.rotation),(axis,n)=>apply(()=>{const xyz=quatEuler(t.rotation);xyz[axis]=n;t.rotation=eulerQuat(xyz)}),{min:-180,max:180,step:5}));
      initial.append(fieldset('Salida: escala',t.scale,(axis,n)=>apply(()=>{t.scale[axis]=n}),{min:0.001,max:100,step:0.05}));
      props.append(initial);
      const assetLabel=$('label');assetLabel.append($('span',null,'Modelo GLB de la pieza'));const sel=$('select');
      [['','Forma básica'] ,...scene.assets.map(a=>[a.id,a.name])].forEach(([id,text])=>{const o=$('option');o.value=id;o.textContent=text;o.selected===(obj.assetId??'');sel.append(o);});
      sel.addEventListener('change',()=>apply(()=>{obj.assetId=sel.value||null;obj.nodeId=null;const link=scene.links.find(l=>l.pieceId===obj.id);if(link)delete link.placement;}));assetLabel.append(sel);props.append(assetLabel);
      const asset=scene.assets.find(x=>x.id===obj.assetId);
      if(asset?.nodes?.length){
        const m=$('label');m.append($('span',null,'Submalla del modelo'));const nodeSel=$('select');[['','Modelo completo'],...asset.nodes.map(x=>[x.nodeId,x.name])].forEach(([id,text])=>{const o=$('option');o.value=id;o.textContent=text;o.selected===(obj.nodeId??'');nodeSel.append(o);});nodeSel.addEventListener('change',()=>apply(()=>{obj.nodeId=nodeSel.value||null;const link=scene.links.find(l=>l.pieceId===obj.id);if(link)delete link.placement;}));m.append(nodeSel);props.append(m);
      }
      if(link){
        const targetField=$('label');targetField.append($('span',null,'Destino correcto'));const selects=$('select');scene.targets.forEach(x=>{const o=$('option');o.value=x.id;o.textContent=x.text;o.selected=x.id===link.targetId;selects.append(o)});selects.addEventListener('change',()=>apply(()=>{link.targetId=selects.value;delete link.placement;}));targetField.append(selects);props.append(targetField);
        props.append(fieldset('Tolerancias', [link.positionTolerance,link.rotationToleranceDeg,0],(axis,n)=>{if(axis===2)return;apply(()=>{if(axis===0)link.positionTolerance=n;else link.rotationToleranceDeg=n})},{min:0,max:180,step:0.05}));
        const prerequisites=$('label');prerequisites.append($('span',null,'Requiere colocar primero'));
        const dep=$('select');[['','Ninguna'],...scene.pieces.filter(x=>x.id!==obj.id).map(x=>[x.id,x.text])].forEach(([v,name])=>{const o=$('option');o.value=v;o.textContent=name;o.selected===(link.prerequisites[0]??'');dep.append(o);});dep.addEventListener('change',()=>apply(()=>{link.prerequisites=dep.value?[dep.value]:[]}));prerequisites.append(dep);props.append(prerequisites);
      }
    }
  }
  function treePanel(){
    entries.replaceChildren();
    for(const [name,kind,items] of [['Piezas','piece',scene.pieces],['Destinos','target',scene.targets]]){
      entries.append($('strong',null,name));
      items.forEach(p=>{const b=btn(p.text,()=>{selected={kind,id:p.id};vertexIndex=0;tree.open=false;drawAll();syncThreeVisibility();focusSelection();});b.setAttribute('aria-pressed',selected.kind===kind&&selected.id===p.id?'true':'false');entries.append(b);});
    }
    const importLabel=$('label');importLabel.append($('strong',null,'Importar modelo GLB'));
    const file=$('input');file.type='file';file.accept='.glb,model/gltf-binary';file.setAttribute('aria-label','Importar modelo 3D GLB');
    file.addEventListener('change',async()=>{const selectedFile=file.files?.[0];if(!selectedFile)return;try{
      if(selectedFile.size>24*1024*1024)throw Error('Archivo GLB demasiado grande (máximo 24 MiB)');
      const bytes=new Uint8Array(await selectedFile.arrayBuffer());
      const metadata=inspectAssemblyGLB(bytes);
      const resource=await model.addAssemblyAsset({bytes,filename:selectedFile.name});
      apply(()=>{if(!scene.assets.some(a=>a.id===resource.id))scene.assets.push({id:resource.id,path:resource.path,name:selectedFile.name,size:resource.size,nodes:metadata.nodes});
        const piece=scene.pieces.find(p=>p.id===selected.id);if(piece){piece.assetId=resource.id;piece.nodeId=metadata.nodes.length===1?metadata.nodes[0].nodeId:null;const link=scene.links.find(l=>l.pieceId===piece.id);if(link)delete link.placement;}
      });
    }catch(error){message(error.message||String(error));}finally{file.value='';}});
    importLabel.append(file);entries.append(importLabel);
    const reference=$('label');reference.append($('span',null,'Modelo base (referencia)'));const refSelect=$('select');
    [['','Sin modelo base'],...scene.assets.map(a=>[a.id,a.name])].forEach(([id,text])=>{const o=$('option');o.value=id;o.textContent=text;o.selected=== (scene.referenceAssetId??'');refSelect.append(o);});
    refSelect.addEventListener('change',()=>apply(()=>{scene.referenceAssetId=refSelect.value||null}));reference.append(refSelect);entries.append(reference);
    entries.append($('small','a3-hint','El archivo GLB se incorpora al curso. Si contiene varios nodos, selecciona qué submalla corresponde a cada pieza. Las jaulas son los destinos, no una copia del modelo.'));
  }
  const paired=(id)=>{
    const link=scene.links.find(l=>l.pieceId===id||l.targetId===id);
    return link?{link,piece:scene.pieces.find(p=>p.id===link.pieceId),target:scene.targets.find(t=>t.id===link.targetId)}:null;
  };
  function fitSelected({silent=false}={}){
    const pair=paired(selected.id);
    if(!pair?.piece||!pair.target)return false;
    const {piece,target,link}=pair;
    const bounds=threeRuntime?.getObjectLocalBounds?.('author-piece:'+piece.id);
    if(piece.assetId&&!bounds){
      if(!silent)message('Para ajustar el modelo real, primero tiene que cargarse en el visor 3D.');
      return false;
    }
    const measured=bounds??{min:[-0.625,-0.45,-0.5],max:[0.625,0.45,0.5]};
    const success=apply(()=>{
      link.placement=fitAssemblyBounds(target,measured);
      piece.initialTransform.scale=[...link.placement.scale];
    });
    if(success){selected={kind:'piece',id:piece.id};drawAll();syncThreeVisibility();focusSelection();}
    return success;
  }
  function focusSelection(){
    if(!threeRuntime)return;
    const pair=paired(selected.id);
    if(!pair?.target)return;
    const target=pair.target,coords=target.vertices.map(v=>toWorld(v,target.transform));
    const extent=Math.max(0.8,...coords.map(v=>Math.hypot(...v.map((n,i)=>n-target.transform.position[i]))));
    threeRuntime.focusOn(target.transform.position,Math.max(3.8,extent*2.8));
  }
  function drawAll(){if(!svg.hidden)drawScene();treePanel();propertyPanel();}

  // Interactive Three.js view shares the exact same scene/GLB loader that
  // Player uses. The SVG editor remains usable when WebGL is unavailable.
  const assetSignature=()=>JSON.stringify({
    pieces:scene.pieces.map(p=>[p.id,p.assetId,p.nodeId]),
    targets:scene.targets.map(t=>t.id),
    reference:scene.referenceAssetId??null,
  });
  function syncThreeVisibility(){
    if(!threeRuntime)return;
    const current=paired(selected.id);
    for(const target of scene.targets){
      const active=current?.target?.id===target.id;
      threeRuntime.setObjectVisibility('author-target:'+target.id,showAll||active);
      threeRuntime.setCageHandlesVisible('author-target:'+target.id,active);
    }
    for(const piece of scene.pieces){
      threeRuntime.setObjectVisibility('author-piece:'+piece.id,showAll||current?.piece?.id===piece.id);
    }
  }
  function syncThreeTransforms(){
    if(!threeRuntime)return;
    for(const target of scene.targets){
      threeRuntime.updateCage('author-target:'+target.id,target.vertices,target.transform);
    }
    for(const piece of scene.pieces){
      threeRuntime.setTransform('author-piece:'+piece.id,assemblyPlacementTransform(scene,piece.id)??piece.initialTransform);
    }
    if(scene.referenceAssetId)threeRuntime.setTransform('author-reference',scene.referenceTransform??{
      position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1],
    });
    syncThreeVisibility();
  }
  async function rebuildThree(){
    const runtime=threeRuntime;
    if(!runtime||threeDestroyed)return;
    const generation=++threeGeneration;
    threeSignature=assetSignature();
    runtime.reset();
    const targets=[...scene.targets],pieces=[...scene.pieces],assets=[...scene.assets];
    for(const target of targets)runtime.addCage({
      id:'author-target:'+target.id,vertices:target.vertices,position:target.transform.position,
      rotation:target.transform.rotation,scale:target.transform.scale,editable:true,
      interaction:{kind:'assembly-editor-target',id:target.id},visibility:'outline',
    });
    let fittedAny=false;
    for(const piece of pieces){
      if(generation!==threeGeneration||threeDestroyed)return;
      const asset=assets.find(a=>a.id===piece.assetId);
      const id='author-piece:'+piece.id;
      let modelLoaded=!asset;
      if(asset){
        try{
          const bytes=await model.readAssemblyAsset(asset.path);
          if(generation!==threeGeneration||threeDestroyed)return;
          const fittedPose=assemblyPlacementTransform(scene,piece.id)??piece.initialTransform;
          await runtime.addModel({
            id,assetId:asset.id,bytes,nodeId:piece.nodeId??null,
            position:fittedPose.position,rotation:fittedPose.rotation,scale:fittedPose.scale,
            interaction:{kind:'assembly-editor-piece',id:piece.id},
          });
          if(generation!==threeGeneration||threeDestroyed)return;
          modelLoaded=true;
        }catch(error){
          if(generation!==threeGeneration||threeDestroyed)return;
          message('No se pudo mostrar '+asset.name+': '+String(error.message||error));
          runtime.addBox({id,text:piece.text,position:(assemblyPlacementTransform(scene,piece.id)??piece.initialTransform).position,
            dynamic:false,physicsEnabled:false,size:[1.25,0.9,1],
            interaction:{kind:'assembly-editor-piece',id:piece.id}});
        }
      }else runtime.addBox({id,text:piece.text,position:(assemblyPlacementTransform(scene,piece.id)??piece.initialTransform).position,
        dynamic:false,physicsEnabled:false,size:[1.25,0.9,1],
        interaction:{kind:'assembly-editor-piece',id:piece.id}});
      // Use measured GLB geometry for the initial correct pose. The saved
      // student start position stays separate; the editor shows the fit.
      const pair=paired(piece.id),bounds=runtime.getObjectLocalBounds?.(id);
      if(pair&&modelLoaded&&!pair.link.placement&&bounds){
        try{
          pair.link.placement=fitAssemblyBounds(pair.target,bounds);
          piece.initialTransform.scale=[...pair.link.placement.scale];
          fittedAny=true;
        }catch(error){message('Revisa las dimensiones de '+piece.text+': '+error.message);}
      }
    }
    const ref=assets.find(a=>a.id===scene.referenceAssetId);
    if(ref){
      try{
        const bytes=await model.readAssemblyAsset(ref.path);
        if(generation!==threeGeneration||threeDestroyed)return;
        const t=scene.referenceTransform??{position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]};
        await runtime.addModel({id:'author-reference',assetId:ref.id,bytes,
          position:t.position,rotation:t.rotation,scale:t.scale,opacity:0.4});
      }catch(error){if(generation===threeGeneration)message('Modelo base no visible: '+String(error.message||error));}
    }
    if(generation!==threeGeneration||threeDestroyed)return;
    if(fittedAny){
      validateAssembly(scene,{requireReady:false});
      syncQuestion(question);commit();snapshot();
    }
    syncThreeTransforms();
    focusSelection();
  }
  function scheduleThreeSync(){
    if(!threeRuntime||threeDestroyed||threePending)return;
    threePending=true;
    queueMicrotask(()=>{
      threePending=false;
      if(!threeRuntime||threeDestroyed)return;
      if(threeSignature!==assetSignature())void rebuildThree().catch(error=>message('No se pudo actualizar la escena 3D: '+error.message));
      else syncThreeTransforms();
    });
  }
  function selectThree(meta){
    if(meta.kind==='assembly-editor-vertex'){
      selected={kind:'target',id:meta.id};vertexIndex=meta.index;
    }else if(meta.kind==='assembly-editor-target')selected={kind:'target',id:meta.id};
    else if(meta.kind==='assembly-editor-piece')selected={kind:'piece',id:meta.id};
    treePanel();propertyPanel();syncThreeVisibility();
    return true;
  }
  function onThreeInteraction(meta){
    if(!meta?.kind?.startsWith('assembly-editor-'))return;
    selectThree(meta);
  }
  function onThreeDrag(meta,phase,{position=null,hit=null}={}){
    if(!meta?.kind?.startsWith('assembly-editor-'))return false;
    if(phase==='start'){
      selectThree(meta);
      const target=scene.targets.find(t=>t.id===meta.id),piece=scene.pieces.find(p=>p.id===meta.id);
      if(!target&&!piece)return false;
      const startPose=piece?(assemblyPlacementTransform(scene,piece.id)??piece.initialTransform):target.transform;
      threeDrag={
        meta,initial:JSON.stringify(scene),
        point:position??hit?.point?.toArray()??[...startPose.position],
        start:[...startPose.position],changed:false,
      };
      return true;
    }
    if(!threeDrag||threeDrag.meta.id!==meta.id||threeDrag.meta.kind!==meta.kind)return false;
    if(phase==='move'){
      if(!position)return true;
      const target=scene.targets.find(t=>t.id===meta.id),piece=scene.pieces.find(p=>p.id===meta.id);
      if(meta.kind==='assembly-editor-vertex'){
        if(!target)return false;
        const candidate=toLocal(position,target.transform),previous=target.vertices[meta.index];
        if(candidate.every(v=>Number.isFinite(v)&&Math.abs(v)<=1000)){
          target.vertices[meta.index]=candidate;
          if(validCage(target.vertices))threeDrag.changed=true;
          else target.vertices[meta.index]=previous;
          threeRuntime?.updateCage('author-target:'+target.id,target.vertices,target.transform);
        }
      }else{
        const moved=threeDrag.start.map((n,i)=>n+position[i]-threeDrag.point[i]);
        if(moved.every(n=>Number.isFinite(n)&&Math.abs(n)<=1000)){
          if(piece){
            const pair=paired(piece.id),pose=pair?.link?.placement;
            if(!pose)return false;
            const final=assemblyPlacementTransform(scene,piece.id);
            const anchor=pose.bounds?[0,1,2].map(i=>(pose.bounds.min[i]+pose.bounds.max[i])/2):[0,0,0];
            pose.offset=toLocal(toWorld(anchor,{...final,position:moved}),pair.target.transform);
            threeRuntime?.setTransform('author-piece:'+piece.id,assemblyPlacementTransform(scene,piece.id));
          }else if(target){
            target.transform.position=moved;
            syncThreeTransforms();
          }else return false;
          threeDrag.changed=true;
        }
      }
      propertyPanel();return true;
    }
    const state=threeDrag;threeDrag=null;
    if(phase==='cancel'||!state.changed){
      if(phase==='cancel'){
        const previous=JSON.parse(state.initial);
        Object.assign(scene,previous);syncThreeTransforms();drawAll();
      }
      return true;
    }
    try{
      validateAssembly(scene,{requireReady:false});
      syncQuestion(question);commit();snapshot();
      syncThreeTransforms();drawAll();
      const candidate=meta.kind==='assembly-editor-piece'?
        assemblyFitStatus(scene,meta.id,assemblyPlacementTransform(scene,meta.id)):null;
      message(candidate&&!candidate.ok?'La pieza no queda dentro del encaje: '+candidate.reason:'');
      return true;
    }catch(error){
      const previous=JSON.parse(state.initial);
      Object.assign(scene,previous);
      syncThreeTransforms();drawAll();message(error.message||'La modificación no es válida');
      return true;
    }
  }
  async function startThree(){
    if(typeof createScene!=='function'||threeDestroyed)return;
    canvas.hidden=false;svg.hidden=true;
    try{
      const runtime=await createScene(canvas,{onInteraction:onThreeInteraction,onDrag:onThreeDrag});
      if(threeDestroyed||!root.isConnected){runtime.destroy();return;}
      threeRuntime=runtime;
      note.textContent='La pieza está en su caja: arrástrala para afinar · Puntos: ajustar volumen · Rueda: zoom';
      await rebuildThree();
    }catch(error){
      threeRuntime?.destroy();threeRuntime=null;svg.hidden=false;canvas.hidden=true;
      if(canvas.isConnected)canvas.replaceWith(svg);
      drawScene();note.textContent='Sin WebGL: vista geométrica alternativa del mismo encaje';
      message('Vista 3D no disponible: '+String(error.message||error));
    }
  }
  let detachObserver=null;
  function destroy(){
    if(threeDestroyed)return;
    threeDestroyed=true;++threeGeneration;
    detachObserver?.disconnect();detachObserver=null;
    threeRuntime?.destroy();threeRuntime=null;
    root.remove();
  }
  queueMicrotask(()=>{
    if(!root.isConnected||threeDestroyed)return;
    detachObserver=new MutationObserver(()=>{
      if(!root.isConnected)destroy();
    });
    detachObserver.observe(root.getRootNode(),{subtree:true,childList:true});
    if(typeof createScene==='function')void startThree();
    else {canvas.hidden=true;svg.hidden=false;if(canvas.isConnected)canvas.replaceWith(svg);drawScene();message('WebGL no está disponible: edición de zonas mediante la vista geométrica.');}
  });
  svg.addEventListener('pointerdown',e=>{
    if(e.button!==0&&e.pointerType==='mouse')return;
    const kind=e.target?.dataset?.kind,id=e.target?.dataset?.id,index=Number(e.target?.dataset?.index??-1),p=pointer(e);
    if(kind==='vertex'){selected={kind:'target',id};vertexIndex=index;}
    else if(kind==='piece'||kind==='target')selected={kind,id};
    drag={kind:kind??'orbit',id,index,initial:p,last:p,changed:false,original:JSON.stringify(scene)};
    svg.setPointerCapture?.(e.pointerId);drawAll();e.preventDefault();
  });
  svg.addEventListener('pointermove',e=>{
    if(!drag)return;
    const p=pointer(e),dx=p[0]-drag.last[0],dy=p[1]-drag.last[1];drag.last=p;
    if(Math.abs(dx)+Math.abs(dy)<0.1)return;
    if(drag.kind==='orbit'){yaw+=dx*0.008;pitch=clamp(pitch-dy*0.006,0.28,1.35);drawScene();return;}
    const worldDelta=deltaWorld(dx,dy,e.shiftKey);
    const obj=drag.kind==='piece'?scene.pieces.find(x=>x.id===drag.id):scene.targets.find(x=>x.id===drag.id);
    if(!obj)return;
    if(drag.kind==='vertex'){
      const target=scene.targets.find(x=>x.id===drag.id);
      const p0=toWorld(target.vertices[drag.index],target.transform);
      const local=toLocal(p0.map((x,i)=>x+worldDelta[i]),target.transform);
      const before=[...target.vertices[drag.index]];target.vertices[drag.index]=local;
      if(!validCage(target.vertices))target.vertices[drag.index]=before;else drag.changed=true;
    }else{
      if(drag.kind==='piece'){
        const pair=paired(obj.id),pose=pair?.link?.placement;
        if(pose){
          const final=assemblyPlacementTransform(scene,obj.id);
          const moved=final.position.map((n,i)=>n+worldDelta[i]);
          const anchor=pose.bounds?[0,1,2].map(i=>(pose.bounds.min[i]+pose.bounds.max[i])/2):[0,0,0];
          pose.offset=toLocal(toWorld(anchor,{...final,position:moved}),pair.target.transform);
          drag.changed=true;
        }
      }else{
        obj.transform.position=obj.transform.position.map((n,i)=>n+worldDelta[i]);
        drag.changed=true;
      }
    }
    drawScene();e.preventDefault();
  });
  const finishDrag=(e,cancel=false)=>{if(!drag)return;
    const original=JSON.parse(drag.original),changed=drag.changed;drag=null;
    if(cancel){for(const k of Object.keys(scene))delete scene[k];Object.assign(scene,original);drawAll();return;}
    if(changed){try{validateAssembly(scene,{requireReady:false});syncQuestion(question);commit();snapshot();message('');}catch(error){for(const k of Object.keys(scene))delete scene[k];Object.assign(scene,original);message(error.message);}}
    drawAll();
    if(e){try{svg.releasePointerCapture?.(e.pointerId);}catch{}}
  };
  svg.addEventListener('pointerup',e=>finishDrag(e));
  svg.addEventListener('pointercancel',e=>finishDrag(e,true));
  svg.addEventListener('wheel',e=>{e.preventDefault();zoom=clamp(zoom*(e.deltaY>0?0.93:1.07),18,130);drawScene();},{passive:false});
  svg.addEventListener('keydown',e=>{if(!selected.id||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
    e.preventDefault();const step=e.shiftKey?0.2:0.05,axis=e.shiftKey?1:(e.key==='ArrowLeft'||e.key==='ArrowRight'?0:2),amount=e.key==='ArrowLeft'||e.key==='ArrowDown'?-step:step;
    apply(()=>{const obj=selected.kind==='piece'?scene.pieces.find(x=>x.id===selected.id):scene.targets.find(x=>x.id===selected.id);const t=selected.kind==='piece'?obj.initialTransform:obj.transform;t.position[axis]+=amount;});
  });
  drawAll();
  return {destroy};
}
