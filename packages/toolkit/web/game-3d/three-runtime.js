import * as THREE from '../vendor/three.module.js';
import {createRapierPhysicsWorld} from './physics/rapier-adapter.js';
import {createNoPhysicsWorld} from './physics/no-physics.js';

const PALETTE=['#38bdf8','#a78bfa','#34d399','#f59e0b','#fb7185','#22d3ee','#c084fc'];

function createRopeState(from,to,total=24){
  const count=Math.max(12,Math.floor(total));
  const current=new Float32Array(count*3);
  const previous=new Float32Array(count*3);
  const distance=from.distanceTo(to);
  const segment=Math.max(0.12,(distance*1.06)/(count-1));
  const sag=Math.min(0.75,Math.max(0.16,distance*0.045));
  for(let i=0;i<count;i+=1){
    const t=i/(count-1);
    const x=from.x+(to.x-from.x)*t;
    const y=Math.max(0.07,from.y+(to.y-from.y)*t-Math.sin(Math.PI*t)*sag);
    const z=from.z+(to.z-from.z)*t;
    const o=i*3;
    current[o]=previous[o]=x;
    current[o+1]=previous[o+1]=y;
    current[o+2]=previous[o+2]=z;
  }
  return {current,previous,count,segment};
}

function simulateRope(state,from,to,delta){
  const dt=Math.min(1/30,Math.max(1/240,delta));
  const {current,previous,count}=state;
  const setPoint=(index,p)=>{
    const o=index*3;
    current[o]=p.x;current[o+1]=p.y;current[o+2]=p.z;
  };
  const setPrevious=(index,p)=>{
    const o=index*3;
    previous[o]=p.x;previous[o+1]=p.y;previous[o+2]=p.z;
  };
  setPoint(0,from);setPrevious(0,from);
  setPoint(count-1,to);setPrevious(count-1,to);
  const wanted=Math.max(0.12,(from.distanceTo(to)*1.065)/(count-1));
  state.segment+=(wanted-state.segment)*(1-Math.exp(-dt*7));
  for(let i=1;i<count-1;i+=1){
    const o=i*3;
    const vx=(current[o]-previous[o])*0.985;
    const vy=(current[o+1]-previous[o+1])*0.985;
    const vz=(current[o+2]-previous[o+2])*0.985;
    previous[o]=current[o];previous[o+1]=current[o+1];previous[o+2]=current[o+2];
    current[o]+=vx;current[o+1]+=vy-6.8*dt*dt;current[o+2]+=vz;
    if(current[o+1]<0.065) current[o+1]=0.065;
  }
  for(let iteration=0;iteration<8;iteration+=1){
    setPoint(0,from);setPoint(count-1,to);
    for(let i=0;i<count-1;i+=1){
      const a=i*3,b=(i+1)*3;
      const dx=current[b]-current[a],dy=current[b+1]-current[a+1],dz=current[b+2]-current[a+2];
      const d=Math.hypot(dx,dy,dz)||1e-6;
      const correction=(d-state.segment)/d;
      const firstFixed=i===0,secondFixed=i+1===count-1;
      if(firstFixed&&!secondFixed){
        current[b]-=dx*correction;current[b+1]-=dy*correction;current[b+2]-=dz*correction;
      }else if(!firstFixed&&secondFixed){
        current[a]+=dx*correction;current[a+1]+=dy*correction;current[a+2]+=dz*correction;
      }else if(!firstFixed&&!secondFixed){
        const half=correction*0.5;
        current[a]+=dx*half;current[a+1]+=dy*half;current[a+2]+=dz*half;
        current[b]-=dx*half;current[b+1]-=dy*half;current[b+2]-=dz*half;
      }
      if(i>0&&current[a+1]<0.065) current[a+1]=0.065;
      if(i+1<count-1&&current[b+1]<0.065) current[b+1]=0.065;
    }
  }
  setPoint(0,from);setPoint(count-1,to);
}

function labelTexture(text,{background='#0f172a',foreground='#f8fafc',border='#38bdf8'}={}) {
  const canvas=document.createElement('canvas');
  canvas.width=768;
  canvas.height=224;
  const ctx=canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle=background;
  ctx.strokeStyle=border;
  ctx.lineWidth=10;
  ctx.beginPath();
  ctx.roundRect(8,8,canvas.width-16,canvas.height-16,28);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle=foreground;
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  ctx.font='700 42px system-ui, sans-serif';
  const words=String(text).trim().split(/\s+/u);
  const lines=[];
  let current='';
  for (const word of words) {
    const candidate=current?`${current} ${word}`:word;
    if (ctx.measureText(candidate).width<660 || !current) current=candidate;
    else { lines.push(current); current=word; }
    if (lines.length===2) break;
  }
  if (current && lines.length<3) lines.push(current);
  const lineHeight=48;
  const start=canvas.height/2-((lines.length-1)*lineHeight)/2;
  lines.slice(0,3).forEach((line,index)=>ctx.fillText(line,canvas.width/2,start+index*lineHeight));
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=THREE.LinearFilter;
  texture.magFilter=THREE.LinearFilter;
  texture.needsUpdate=true;
  return texture;
}

function disposeObject(object) {
  object.traverse?.((child)=>{
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((material)=>{material.map?.dispose?.();material.dispose?.();});
    else { child.material?.map?.dispose?.(); child.material?.dispose?.(); }
  });
}

function normalizePosition(value=[0,0,0]) {
  return [Number(value[0])||0,Number(value[1])||0,Number(value[2])||0];
}

export async function createThreeGameScene(canvas,{onInteraction=()=>{},onDrag=()=>false,physics='rapier'}={}) {
  let physicsWorld;
  try {
    physicsWorld=physics==='none'?await createNoPhysicsWorld():await createRapierPhysicsWorld();
  } catch (error) {
    console.warn('P2LRN 3D physics fallback:',error);
    physicsWorld=await createNoPhysicsWorld();
  }

  let renderer;
  try{
    renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  }catch(error){
    physicsWorld.destroy?.();
    throw error;
  }
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,2));
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;

  const scene=new THREE.Scene();
  scene.background=new THREE.Color('#050b16');
  scene.fog=new THREE.Fog('#050b16',24,62);

  const camera=new THREE.PerspectiveCamera(48,2,0.1,120);
  camera.position.set(0,8.2,15.5);
  camera.lookAt(0,0.9,0);

  scene.add(new THREE.HemisphereLight('#b9dcff','#08111f',1.5));
  const key=new THREE.DirectionalLight('#ffffff',2.1);
  key.position.set(7,14,9);
  key.castShadow=true;
  key.shadow.mapSize.set(2048,2048);
  scene.add(key);

  const ground=new THREE.Mesh(
    new THREE.BoxGeometry(24,0.3,26),
    new THREE.MeshStandardMaterial({color:'#111c2f',roughness:0.88,metalness:0.08}),
  );
  ground.position.set(0,-0.15,0);
  ground.receiveShadow=true;
  scene.add(ground);
  physicsWorld.createGround?.({position:[0,-0.15,0],halfExtents:[12,0.15,13]});
  // Invisible perimeter colliders stop movable boxes falling beyond the floor.
  for(const [position,halfExtents] of [
    [[-12,2,0],[0.3,2,13]],[[12,2,0],[0.3,2,13]],
    [[0,2,-13],[12,2,0.3]],[[0,2,13],[12,2,0.3]],
  ])physicsWorld.createGround?.({position,halfExtents});

  const stage=new THREE.Group();
  scene.add(stage);

  const player=new THREE.Group();
  const playerBody=new THREE.Mesh(
    new THREE.CylinderGeometry(0.42,0.52,1.15,18),
    new THREE.MeshStandardMaterial({color:'#e2e8f0',roughness:0.7,metalness:0.05}),
  );
  playerBody.position.y=0.78;
  playerBody.castShadow=true;
  const playerHead=new THREE.Mesh(
    new THREE.SphereGeometry(0.3,18,14),
    new THREE.MeshStandardMaterial({color:'#38bdf8',roughness:0.58,metalness:0.12}),
  );
  playerHead.position.y=1.55;
  playerHead.castShadow=true;
  player.add(playerBody,playerHead);
  player.position.set(0,0,6.5);
  scene.add(player);

  const movement={forward:false,back:false,left:false,right:false};
  let cameraYaw=0;
  let cameraPitch=-0.05;
  let cameraDrag=null;

  const meshes=new Map();
  const bodies=new Set();
  const interactables=[];
  const connectors=[];
  const carried=new Map();
  const raycaster=new THREE.Raycaster();
  const pointer=new THREE.Vector2();
  const dragPlane=new THREE.Plane(new THREE.Vector3(0,1,0),-0.78);
  const dragWorld=new THREE.Vector3();
  const dragPointer=new THREE.Vector3();
  let alive=true;
  let raf=0;
  let last=performance.now();

  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
  function playerDistanceTo(id){
    const mesh=meshes.get(String(id));
    if(!mesh)return Infinity;
    return Math.hypot(mesh.position.x-player.position.x,mesh.position.z-player.position.z);
  }
  function resetPlayer(){
    player.position.set(0,0,6.5);
    cameraYaw=0;
    cameraPitch=-0.05;
  }
  function nudgePlayer(direction,amount=0.85){
    const forward=new THREE.Vector3(-Math.sin(cameraYaw),0,-Math.cos(cameraYaw));
    const right=new THREE.Vector3(Math.cos(cameraYaw),0,-Math.sin(cameraYaw));
    const delta=new THREE.Vector3();
    if(direction==='forward')delta.add(forward);
    if(direction==='back')delta.sub(forward);
    if(direction==='left')delta.sub(right);
    if(direction==='right')delta.add(right);
    if(delta.lengthSq()>0)delta.normalize().multiplyScalar(amount);
    player.position.add(delta);
    player.position.x=clamp(player.position.x,-10.2,10.2);
    player.position.z=clamp(player.position.z,-7.8,11.8);
  }
  function updatePlayer(delta){
    const previous=player.position.clone();
    const forward=new THREE.Vector3(-Math.sin(cameraYaw),0,-Math.cos(cameraYaw));
    const right=new THREE.Vector3(Math.cos(cameraYaw),0,-Math.sin(cameraYaw));
    const velocity=new THREE.Vector3();
    if(movement.forward)velocity.add(forward);
    if(movement.back)velocity.sub(forward);
    if(movement.left)velocity.sub(right);
    if(movement.right)velocity.add(right);
    if(velocity.lengthSq()>0){
      velocity.normalize().multiplyScalar(4.3*delta);
      player.position.add(velocity);
      player.position.x=clamp(player.position.x,-10.2,10.2);
      player.position.z=clamp(player.position.z,-7.8,11.8);
      player.rotation.y=Math.atan2(-velocity.x,-velocity.z);
    }
    const playerDelta=player.position.clone().sub(previous);
    const playerSpeed=delta>0?playerDelta.length()/delta:0;
    if(playerSpeed>0.01){
      for(const id of bodies){
        const mesh=meshes.get(String(id));
        if(!mesh)continue;
        const dx=mesh.position.x-player.position.x;
        const dz=mesh.position.z-player.position.z;
        const distance=Math.hypot(dx,dz);
        if(distance>=1.12)continue;
        const inv=distance>0.0001?1/distance:1;
        const nx=distance>0.0001?dx*inv:1;
        const nz=distance>0.0001?dz*inv:0;
        const impulse=Math.min(7.2,0.9+playerSpeed*0.78+(1.12-distance)*4.5);
        physicsWorld.applyImpulse?.(id,[nx*impulse,0,nz*impulse],(playerDelta.x*nz-playerDelta.z*nx)*0.09);
      }
    }
    const forwardLook=new THREE.Vector3(-Math.sin(cameraYaw),0,-Math.cos(cameraYaw));
    const height=5.4+Math.sin(Math.abs(cameraPitch))*2.6;
    const distance=9.8-Math.sin(Math.abs(cameraPitch))*1.8;
    const targetCamera=player.position.clone().add(new THREE.Vector3(0,height,0)).add(forwardLook.clone().multiplyScalar(-distance));
    camera.position.lerp(targetCamera,1-Math.exp(-delta*7.5));
    const lookAt=player.position.clone().add(forwardLook.multiplyScalar(4.2)).add(new THREE.Vector3(0,1.2+cameraPitch*1.8,0));
    camera.lookAt(lookAt);
  }

  function resize() {
    const width=Math.max(320,canvas.clientWidth||720);
    const height=Math.max(260,canvas.clientHeight||420);
    const pixelRatio=renderer.getPixelRatio();
    const expectedWidth=Math.floor(width*pixelRatio);
    const expectedHeight=Math.floor(height*pixelRatio);
    if (canvas.width!==expectedWidth || canvas.height!==expectedHeight) {
      renderer.setSize(width,height,false);
      camera.aspect=width/height;
      camera.updateProjectionMatrix();
    }
  }

  function clearStage() {
    for (const object of [...stage.children]) {
      stage.remove(object);
      disposeObject(object);
    }
    for (const id of bodies) physicsWorld.remove(id);
    bodies.clear();
    meshes.clear();
    interactables.length=0;
    connectors.length=0;
    carried.clear();
    dragPointer.set(0,0.78,0);
  }

  function addLabel(parent,text,y=1.2,options={}) {
    const texture=labelTexture(text,options);
    if (!texture) return null;
    const material=new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false});
    const sprite=new THREE.Sprite(material);
    sprite.position.set(0,y,0);
    sprite.scale.set(3.2,0.95,1);
    parent.add(sprite);
    return sprite;
  }

  function addBox({id,text,position=[0,1,0],size=[1.5,0.9,1.5],color=null,dynamic=true,interaction=null}={}) {
    const keyId=String(id);
    const p=normalizePosition(position);
    const geometry=new THREE.BoxGeometry(size[0],size[1],size[2]);
    const material=new THREE.MeshStandardMaterial({color:color??PALETTE[meshes.size%PALETTE.length],roughness:0.58,metalness:0.1});
    const mesh=new THREE.Mesh(geometry,material);
    mesh.position.set(...p);
    mesh.castShadow=true;
    mesh.receiveShadow=true;
    mesh.userData.p2lrnInteraction=interaction;
    addLabel(mesh,text,size[1]/2+0.72);
    stage.add(mesh);
    meshes.set(keyId,mesh);
    if (interaction) interactables.push(mesh);
    physicsWorld.createBox?.({id:keyId,position:p,halfExtents:[size[0]/2,size[1]/2,size[2]/2],dynamic});
    bodies.add(keyId);
    return mesh;
  }

  function addZone({id,text,position=[0,0.12,0],size=[3.2,0.22,2.5],color='#1d4ed8',interaction=null}={}) {
    const material=new THREE.MeshStandardMaterial({color,roughness:0.8,metalness:0.12,transparent:true,opacity:0.88});
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material);
    mesh.position.set(...normalizePosition(position));
    mesh.receiveShadow=true;
    mesh.userData.p2lrnInteraction=interaction;
    addLabel(mesh,text,size[1]/2+0.75,{border:color});
    stage.add(mesh);
    meshes.set(String(id),mesh);
    if (interaction) interactables.push(mesh);
    return mesh;
  }

  function addNode({id,text,position=[0,1,0],color='#334155',interaction=null}={}) {
    const size=[2.55,0.92,1.35];
    const mesh=new THREE.Mesh(
      new THREE.BoxGeometry(...size),
      new THREE.MeshStandardMaterial({color,roughness:0.48,metalness:0.16}),
    );
    mesh.position.set(...normalizePosition(position));
    mesh.castShadow=true;
    mesh.receiveShadow=true;
    mesh.userData.p2lrnInteraction=interaction;
    addLabel(mesh,text,size[1]/2+0.72,{border:color});
    stage.add(mesh);
    meshes.set(String(id),mesh);
    if (interaction) interactables.push(mesh);
    physicsWorld.createBox?.({id:String(id),position:normalizePosition(position),halfExtents:[size[0]/2,size[1]/2,size[2]/2],dynamic:true});
    bodies.add(String(id));
    return mesh;
  }

  function playerHandPosition(distance=0.82,height=1.18) {
    const forward=new THREE.Vector3(-Math.sin(cameraYaw),0,-Math.cos(cameraYaw));
    return player.position.clone().add(forward.multiplyScalar(distance)).add(new THREE.Vector3(0,height,0));
  }

  function carry(id,active=true,{distance=1.18,height=1.42}={}) {
    const keyId=String(id);
    if(!active){carried.delete(keyId);return false;}
    if(!meshes.has(keyId))return false;
    carried.set(keyId,{distance,height});
    return true;
  }

  function syncCarried(delta) {
    for(const [id,options] of carried){
      const mesh=meshes.get(id);if(!mesh){carried.delete(id);continue;}
      const target=playerHandPosition(options.distance,options.height);
      mesh.position.lerp(target,1-Math.exp(-delta*20));
      physicsWorld.setTranslation?.(id,[mesh.position.x,mesh.position.y,mesh.position.z]);
    }
  }

  function connectorTarget(connector) {
    if(connector.toPlayer)return playerHandPosition();
    if(connector.toPointer)return dragPointer;
    return meshes.get(connector.toId)?.position??null;
  }

  function createConnector(fromId,toId,{color='#34d399',toPlayer=false,toPointer=false}={}) {
    const from=meshes.get(String(fromId));
    const to=toPlayer?playerHandPosition():toPointer?dragPointer:meshes.get(String(toId))?.position;
    if(!from||!to)return null;
    const state=createRopeState(from.position,to);
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(state.current,3));
    const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color}));
    line.userData.fromId=String(fromId);
    line.userData.toId=toId===null||toId===undefined?null:String(toId);
    line.userData.toPlayer=toPlayer;
    stage.add(line);
    connectors.push({line,fromId:String(fromId),toId:line.userData.toId,toPlayer,toPointer,state});
    return line;
  }

  function connect(fromId,toId,{color='#34d399'}={}) {
    return createConnector(fromId,toId,{color,toPlayer:false});
  }

  function connectToPlayer(fromId,{color='#c0a270'}={}) {
    return createConnector(fromId,null,{color,toPlayer:true});
  }
  function connectToPointer(fromId,{color='#c0a270'}={}) {
    dragPointer.copy(playerHandPosition());
    return createConnector(fromId,null,{color,toPointer:true});
  }
  function setPointerTarget(position) {
    dragPointer.set(...normalizePosition(position));
  }

  function disconnect(line) {
    const index=connectors.findIndex((item)=>item.line===line);
    if(index<0)return false;
    const [connector]=connectors.splice(index,1);
    stage.remove(connector.line);
    disposeObject(connector.line);
    return true;
  }

  function syncConnectors(delta){
    for(const connector of connectors){
      const from=meshes.get(connector.fromId);
      const to=connectorTarget(connector);
      if(!from||!to) continue;
      simulateRope(connector.state,from.position,to,delta);
      connector.line.geometry.attributes.position.needsUpdate=true;
      connector.line.geometry.computeBoundingSphere();
    }
  }
  function setTranslation(id,position) {
    const mesh=meshes.get(String(id));
    if (!mesh) return false;
    const p=normalizePosition(position);
    mesh.position.set(...p);
    physicsWorld.setTranslation?.(id,p);
    return true;
  }

  function highlight(id,active=true) {
    const mesh=meshes.get(String(id));
    const material=mesh?.material;
    if (!material || Array.isArray(material) || !('emissive' in material)) return;
    material.emissive.set(active?'#1d4ed8':'#000000');
    material.emissiveIntensity=active?0.55:0;
  }

  function syncPhysics() {
    for (const id of bodies) {
      const transform=physicsWorld.transform?.(id);
      const mesh=meshes.get(String(id));
      if (!transform || !mesh) continue;
      const t=transform.translation;
      const r=transform.rotation;
      mesh.position.set(t.x,t.y,t.z);
      mesh.quaternion.set(r.x,r.y,r.z,r.w);
    }
  }

  function frame(now) {
    if (!alive) return;
    resize();
    const delta=Math.min(0.05,Math.max(1/240,(now-last)/1000));
    last=now;
    updatePlayer(delta);
    physicsWorld.step?.(delta);
    syncPhysics();
    syncCarried(delta);
    syncConnectors(delta);
    renderer.render(scene,camera);
    raf=requestAnimationFrame(frame);
  }

  function raycastInteraction(event,{dispatch=true,exclude=null}={}) {
    const rect=canvas.getBoundingClientRect();
    if(!rect.width||!rect.height)return null;
    pointer.x=((event.clientX-rect.left)/rect.width)*2-1;
    pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;
    raycaster.setFromCamera(pointer,camera);
    const hits=raycaster.intersectObjects(interactables,true);
    for(const hit of hits){
      let node=hit.object;
      while(node&&!node.userData?.p2lrnInteraction)node=node.parent;
      const meta=node?.userData?.p2lrnInteraction;
      if(!meta)continue;
      if(exclude&&meta.kind===exclude.kind&&meta.id===exclude.id)continue;
      const info={point:hit.point,event,playerDistance:player.position.distanceTo(hit.point)};
      if(dispatch)onInteraction(meta,info);
      return {meta,...info};
    }
    return null;
  }
  function pointerWorldPosition(event){
    const rect=canvas.getBoundingClientRect();
    if(!rect.width||!rect.height)return null;
    pointer.x=((event.clientX-rect.left)/rect.width)*2-1;
    pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;
    raycaster.setFromCamera(pointer,camera);
    const hit=raycaster.ray.intersectPlane(dragPlane,dragWorld);
    if(!hit)return null;
    return [clamp(hit.x,-11.2,11.2),0.78,clamp(hit.z,-12,12)];
  }
  function onPointerDown(event){
    if(event.button!==0&&event.pointerType==='mouse')return;
    const hit=raycastInteraction(event,{dispatch:false});
    const draggable=hit&&['ordering-object','classification-object','matching-left'].includes(hit.meta.kind);
    const objectDrag=Boolean(draggable&&onDrag(hit.meta,'start',{position:pointerWorldPosition(event),event,hit}));
    cameraDrag={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,moved:false,
      mode:objectDrag?'object':'camera',source:objectDrag?hit.meta:null};
    canvas.setPointerCapture?.(event.pointerId);
  }
  function onPointerMove(event){
    const drag=cameraDrag;
    if(!drag||drag.pointerId!==event.pointerId)return;
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>6)drag.moved=true;
    if(drag.mode==='object'){
      if(drag.moved)onDrag(drag.source,'move',{position:pointerWorldPosition(event),event});
    } else if(drag.moved) {
      cameraYaw-=dx*0.006;
      cameraPitch=clamp(cameraPitch-dy*0.004,-0.58,0.24);
    }
    drag.x=event.clientX;drag.y=event.clientY;
  }
  function onPointerUp(event){
    const drag=cameraDrag;
    if(!drag||drag.pointerId!==event.pointerId)return;
    if(drag.mode==='object'){
      if(drag.moved){
        const hit=raycastInteraction(event,{dispatch:false,exclude:drag.source});
        onDrag(drag.source,'end',{position:pointerWorldPosition(event),target:hit?.meta??null,event});
      }else{
        onDrag(drag.source,'cancel',{event});
        raycastInteraction(event);
      }
    }else if(!drag.moved)raycastInteraction(event);
    cameraDrag=null;
    try{canvas.releasePointerCapture?.(event.pointerId);}catch{}
  }
  function onPointerCancel(event){
    if(cameraDrag?.mode==='object')onDrag(cameraDrag.source,'cancel',{event});
    cameraDrag=null;
  }
  function onKeyDown(event){
    const code=event.code;
    if(!['KeyW','KeyS','KeyA','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(code))return;
    event.preventDefault();
    if(code==='KeyW'||code==='ArrowUp')movement.forward=true;
    if(code==='KeyS'||code==='ArrowDown')movement.back=true;
    if(code==='KeyA'||code==='ArrowLeft')movement.left=true;
    if(code==='KeyD'||code==='ArrowRight')movement.right=true;
  }
  function onKeyUp(event){
    const code=event.code;
    if(code==='KeyW'||code==='ArrowUp')movement.forward=false;
    if(code==='KeyS'||code==='ArrowDown')movement.back=false;
    if(code==='KeyA'||code==='ArrowLeft')movement.left=false;
    if(code==='KeyD'||code==='ArrowRight')movement.right=false;
  }

  canvas.tabIndex=0;
  canvas.addEventListener('pointerdown',onPointerDown);
  canvas.addEventListener('pointermove',onPointerMove);
  canvas.addEventListener('pointerup',onPointerUp);
  canvas.addEventListener('pointercancel',onPointerCancel);
  canvas.addEventListener('keydown',onKeyDown);
  canvas.addEventListener('keyup',onKeyUp);
  raf=requestAnimationFrame(frame);

  return {
    physics:physicsWorld.kind,
    scene,
    camera,
    reset:clearStage,
    addBox,
    addZone,
    addNode,
    connect,
    connectToPlayer,
    connectToPointer,
    setPointerTarget,
    disconnect,
    carry,
    setTranslation,
    highlight,
    playerDistanceTo,
    playerPosition:()=>[player.position.x,player.position.y,player.position.z],
    resetPlayer,
    nudgePlayer,
    destroy() {
      alive=false;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown',onPointerDown);
      canvas.removeEventListener('pointermove',onPointerMove);
      canvas.removeEventListener('pointerup',onPointerUp);
      canvas.removeEventListener('pointercancel',onPointerCancel);
      canvas.removeEventListener('keydown',onKeyDown);
      canvas.removeEventListener('keyup',onKeyUp);
      clearStage();
      physicsWorld.destroy?.();
      renderer.dispose();
      disposeObject(ground);
      disposeObject(player);
    },
  };
}
