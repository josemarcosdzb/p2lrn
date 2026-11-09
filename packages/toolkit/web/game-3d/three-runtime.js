import * as THREE from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/loaders/GLTFLoader.js';
import {clone as cloneRig} from '../vendor/utils/SkeletonUtils.js';
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

function labelTexture(text,{background='#f8fafc',foreground='#0f172a',border='#38bdf8'}={}) {
  // High-resolution opaque ink laid directly onto the geometry's vertical
  // faces, not a camera-facing sprite floating above the game piece.
  const canvas=document.createElement('canvas');
  canvas.width=1280;
  canvas.height=480;
  const ctx=canvas.getContext('2d');
  if(!ctx)return null;
  ctx.fillStyle=background;
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle=border;
  ctx.lineWidth=16;
  ctx.strokeRect(9,9,canvas.width-18,canvas.height-18);
  const content=String(text??'').trim()||'—';
  const words=content.split(/\s+/u);
  const maxWidth=canvas.width-130;
  let fontSize=178;
  let lines=[];
  // Preserve whole authored labels and expand short words substantially.
  for(let size=178;size>=68;size-=5){
    ctx.font=`800 ${size}px system-ui, sans-serif`;
    const candidate=[];
    let line='';
    for(const word of words){
      const next=line?line+' '+word:word;
      if(!line||ctx.measureText(next).width<=maxWidth)line=next;
      else{candidate.push(line);line=word;}
    }
    if(line)candidate.push(line);
    fontSize=size;
    lines=candidate;
    if(candidate.length<=4&&candidate.length*size*1.12<=canvas.height-54)break;
  }
  ctx.font=`800 ${fontSize}px system-ui, sans-serif`;
  ctx.fillStyle=foreground;
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  const lineHeight=fontSize*1.12;
  const start=(canvas.height-(lines.length-1)*lineHeight)/2;
  lines.forEach((line,index)=>ctx.fillText(line,canvas.width/2,start+index*lineHeight,maxWidth));
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=THREE.LinearFilter;
  texture.magFilter=THREE.LinearFilter;
  texture.anisotropy=4;
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

export async function createThreeGameScene(canvas,{onInteraction=()=>{},onDrag=()=>false,physics='rapier',authoring=false}={}) {
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
  scene.fog=authoring?null:new THREE.Fog('#050b16',24,62);

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
  player.visible=!authoring;
  scene.add(player);
  if(authoring){
    const grid=new THREE.GridHelper(40,40,'#42728c','#1f3447');
    grid.position.y=0.005;
    scene.add(grid);
  }

  const movement={forward:false,back:false,left:false,right:false};
  // Analog movement comes from the touch joystick; keyboard remains available on desktop.
  const analogMovement={x:0,y:0};
  function setMovementVector(x=0,y=0){
    analogMovement.x=Number.isFinite(x)?Math.max(-1,Math.min(1,x)):0;
    analogMovement.y=Number.isFinite(y)?Math.max(-1,Math.min(1,y)):0;
  }
  let cameraYaw=authoring?0.55:0;
  let cameraPitch=authoring?0.51:-0.05;
  let cameraDrag=null;
  const orbitFocus=new THREE.Vector3(0,1,0);
  let orbitDistance=14;
  const authorDragPlane=new THREE.Plane();

  const meshes=new Map();
  const modelCache=new Map();
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
  let sceneEpoch=0;
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
    if(authoring){
      const elevation=clamp(cameraPitch,-1.38,1.38),slope=Math.cos(elevation);
      camera.position.set(
        orbitFocus.x+Math.sin(cameraYaw)*orbitDistance*slope,
        orbitFocus.y+Math.sin(elevation)*orbitDistance,
        orbitFocus.z+Math.cos(cameraYaw)*orbitDistance*slope,
      );
      camera.lookAt(orbitFocus);
      return;
    }
    const previous=player.position.clone();
    const forward=new THREE.Vector3(-Math.sin(cameraYaw),0,-Math.cos(cameraYaw));
    const right=new THREE.Vector3(Math.cos(cameraYaw),0,-Math.sin(cameraYaw));
    const velocity=new THREE.Vector3();
    if(movement.forward)velocity.add(forward);
    if(movement.back)velocity.sub(forward);
    if(movement.left)velocity.sub(right);
    if(movement.right)velocity.add(right);
    velocity.addScaledVector(forward,analogMovement.y);
    velocity.addScaledVector(right,analogMovement.x);
    if(velocity.lengthSq()>0){
      // Preserve the stick's analog speed and never make diagonals faster.
      velocity.clampLength(0,1).multiplyScalar(4.3*delta);
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
    sceneEpoch+=1;
    for (const object of [...stage.children]) {
      stage.remove(object);
      disposeObject(object);
    }
    for (const id of bodies) physicsWorld.remove(id);
    bodies.clear();
    meshes.clear();
    modelCache.clear();
    interactables.length=0;
    connectors.length=0;
    carried.clear();
    dragPointer.set(0,0.78,0);
  }

  function addFaceLabel(parent,text,size,options={}) {
    const texture=labelTexture(text,options);
    if(!texture)return;
    const material=new THREE.MeshBasicMaterial({
      map:texture,side:THREE.DoubleSide,toneMapped:false,
      polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,
    });
    const add=(width,height,x,y,z,angleY=0)=>{
      const face=new THREE.Mesh(new THREE.PlaneGeometry(width,height),material);
      face.position.set(x,y,z);
      face.rotation.y=angleY;
      face.name='p2lrn-box-face-label';
      face.renderOrder=1;
      parent.add(face);
    };
    const surface=0.016;
    // Keep the text attached to the front and side faces when blocks rotate.
    add(size[0]*0.93,size[1]*0.82,0,0,size[2]/2+surface);
    add(size[0]*0.93,size[1]*0.82,0,0,-size[2]/2-surface,Math.PI);
    add(size[2]*0.90,size[1]*0.82,size[0]/2+surface,0,0,Math.PI/2);
    add(size[2]*0.90,size[1]*0.82,-size[0]/2-surface,0,0,-Math.PI/2);
  }

  function addPlatformLabel(parent,text,size,options={}) {
    const texture=labelTexture(text,options);
    if(!texture)return;
    const face=new THREE.Mesh(
      new THREE.PlaneGeometry(size[0]*0.88,size[2]*0.78),
      new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,toneMapped:false}),
    );
    face.rotation.x=-Math.PI/2;
    face.position.y=size[1]/2+0.018;
    face.name='p2lrn-platform-surface-label';
    face.renderOrder=1;
    parent.add(face);
  }

  function addBox({id,text,position=[0,1,0],size=[2.05,1.12,1.55],color=null,dynamic=true,physicsEnabled=true,interaction=null}={}) {
    const keyId=String(id);
    const p=normalizePosition(position);
    const geometry=new THREE.BoxGeometry(size[0],size[1],size[2]);
    const material=new THREE.MeshStandardMaterial({color:color??PALETTE[meshes.size%PALETTE.length],roughness:0.58,metalness:0.1});
    const mesh=new THREE.Mesh(geometry,material);
    mesh.position.set(...p);
    mesh.castShadow=true;
    mesh.receiveShadow=true;
    mesh.userData.p2lrnInteraction=interaction;
    addFaceLabel(mesh,text,size);
    stage.add(mesh);
    meshes.set(keyId,mesh);
    if (interaction) interactables.push(mesh);
    if(physicsEnabled){
      physicsWorld.createBox?.({id:keyId,position:p,halfExtents:[size[0]/2,size[1]/2,size[2]/2],dynamic});
      bodies.add(keyId);
    }
    return mesh;
  }

  function addZone({id,text,position=[0,0.12,0],size=[3.2,0.22,2.5],color='#1d4ed8',interaction=null}={}) {
    const material=new THREE.MeshStandardMaterial({color,roughness:0.8,metalness:0.12,transparent:true,opacity:0.88});
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material);
    mesh.position.set(...normalizePosition(position));
    mesh.receiveShadow=true;
    mesh.userData.p2lrnInteraction=interaction;
    addPlatformLabel(mesh,text,size,{border:color});
    stage.add(mesh);
    meshes.set(String(id),mesh);
    if (interaction) interactables.push(mesh);
    return mesh;
  }

  function addNode({id,text,position=[0,1,0],color='#334155',interaction=null}={}) {
    const size=[2.55,1.12,1.5];
    const mesh=new THREE.Mesh(
      new THREE.BoxGeometry(...size),
      new THREE.MeshStandardMaterial({color,roughness:0.48,metalness:0.16}),
    );
    mesh.position.set(...normalizePosition(position));
    mesh.castShadow=true;
    mesh.receiveShadow=true;
    mesh.userData.p2lrnInteraction=interaction;
    addFaceLabel(mesh,text,size,{border:color});
    stage.add(mesh);
    meshes.set(String(id),mesh);
    if (interaction) interactables.push(mesh);
    physicsWorld.createBox?.({id:String(id),position:normalizePosition(position),halfExtents:[size[0]/2,size[1]/2,size[2]/2],dynamic:true});
    bodies.add(String(id));
    return mesh;
  }


  async function addModel({id,assetId,bytes,nodeId=null,position=[0,0.9,0],rotation=[0,0,0,1],scale=[1,1,1],interaction=null,opacity=1}={}) {
    const requestedEpoch=sceneEpoch;
    if(!bytes || !assetId)throw new Error('Modelo 3D no disponible dentro del paquete');
    let loading=modelCache.get(assetId);
    if(!loading){
      const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
      loading=(new GLTFLoader()).parseAsync(buffer,'');
      modelCache.set(assetId,loading);
      loading.catch(()=>{if(modelCache.get(assetId)===loading)modelCache.delete(assetId);});
    }
    const gltf=await loading;
    if(!alive||requestedEpoch!==sceneEpoch)return null;
    const source=nodeId===null?gltf.scene:await gltf.parser.getDependency('node',Number(nodeId));
    if(!source)throw new Error('Submalla GLB inexistente: '+String(nodeId));
    if(!alive||requestedEpoch!==sceneEpoch)return null;
    const root=new THREE.Group();
    // SkeletonUtils preserves the internal skeleton references for skinned GLBs.
    const visible=cloneRig(source);
    visible.traverse((part)=>{if(part.isMesh){
      part.castShadow=true;part.receiveShadow=true;
      // Keep GPU geometry and texture buffers shared, but material state
      // independent so highlighting a piece never recolors every instance.
      part.material=Array.isArray(part.material)?part.material.map(m=>m.clone()):part.material.clone();
    }});
    root.add(visible);
    root.position.fromArray(normalizePosition(position));
    root.quaternion.fromArray(rotation);
    root.scale.fromArray(scale);
    root.userData.p2lrnInteraction=interaction;
    if(opacity<1)visible.traverse(part=>{if(part.isMesh){const materials=Array.isArray(part.material)?part.material:[part.material];materials.forEach(m=>{m.transparent=true;m.opacity=opacity;m.depthWrite=false;});}});
    stage.add(root);
    meshes.set(String(id),root);
    if(interaction)interactables.push(root);
    return root;
  }

  function addCage({id,vertices,position=[0,1,0],rotation=[0,0,0,1],scale=[1,1,1],interaction=null,visibility='outline',editable=false}={}){
    const group=new THREE.Group();
    const edges=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
    const coords=edges.flatMap(([a,b])=>[...vertices[a],...vertices[b]]);
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));
    const line=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:'#5eead4',transparent:true,opacity:visibility==='hidden'?0:visibility==='hint'?0.2:0.68}));
    line.visible=visibility!=='hidden';
    group.add(line);
    // Invisible volume for pointer picking; the actual acceptance test uses
    // the authored oriented convex polyhedron, never this rough AABB.
    const lows=[0,1,2].map(i=>Math.min(...vertices.map(p=>p[i]))),highs=[0,1,2].map(i=>Math.max(...vertices.map(p=>p[i])));
    const box=new THREE.Mesh(new THREE.BoxGeometry(...highs.map((v,i)=>Math.max(0.02,v-lows[i]))),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));
    box.position.fromArray(highs.map((v,i)=>(v+lows[i])/2));
    group.add(box);
    const handles=[];
    if(editable){
      const geometry=new THREE.SphereGeometry(0.105,10,8);
      const material=new THREE.MeshBasicMaterial({color:'#22d3ee',depthTest:false});
      vertices.forEach((point,index)=>{
        const handle=new THREE.Mesh(geometry,material);
        handle.position.fromArray(point);
        handle.renderOrder=4;
        handle.userData.p2lrnInteraction={kind:'assembly-editor-vertex',id:String(id),index};
        group.add(handle);
        handles.push(handle);
      });
    }
    group.userData.p2lrnCage={line,box,handles};
    group.position.fromArray(normalizePosition(position));
    group.quaternion.fromArray(rotation);
    group.scale.fromArray(scale);
    group.userData.p2lrnInteraction=interaction;
    stage.add(group);
    meshes.set(String(id),group);
    if(interaction)interactables.push(group);
    return group;
  }


  function updateCage(id,vertices,transform=null){
    const group=meshes.get(String(id)),data=group?.userData?.p2lrnCage;
    if(!data||!Array.isArray(vertices)||vertices.length!==8)return false;
    const edges=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
    const attr=data.line.geometry.getAttribute('position');
    edges.forEach(([a,b],i)=>{attr.setXYZ(i*2,...vertices[a]);attr.setXYZ(i*2+1,...vertices[b]);});
    attr.needsUpdate=true;
    data.line.geometry.computeBoundingSphere();
    data.handles.forEach((handle,index)=>handle.position.fromArray(vertices[index]));
    const lows=[0,1,2].map(i=>Math.min(...vertices.map(p=>p[i]))),highs=[0,1,2].map(i=>Math.max(...vertices.map(p=>p[i])));
    data.box.geometry.dispose();
    data.box.geometry=new THREE.BoxGeometry(...highs.map((v,i)=>Math.max(0.02,v-lows[i])));
    data.box.position.fromArray(highs.map((v,i)=>(v+lows[i])/2));
    if(transform)setTransform(id,transform);
    return true;
  }

  function setTransform(id,transform){
    const mesh=meshes.get(String(id));
    if(!mesh||!transform)return false;
    if(transform.position)mesh.position.fromArray(normalizePosition(transform.position));
    if(transform.rotation)mesh.quaternion.fromArray(transform.rotation);
    if(transform.scale)mesh.scale.fromArray(transform.scale);
    return true;
  }

  function focusOn(position=[0,1,0],radius=14){
    if(!authoring)return false;
    orbitFocus.fromArray(normalizePosition(position));
    orbitDistance=clamp(Number(radius)||14,2.5,350);
    camera.far=Math.max(120,orbitDistance*12);
    camera.updateProjectionMatrix();
    return true;
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
    if(material&&!Array.isArray(material)&&'emissive' in material){material.emissive.set(active?'#1d4ed8':'#000000');material.emissiveIntensity=active?0.55:0;}
    else mesh?.traverse?.(part=>{if(!part.isMesh)return;for(const mat of (Array.isArray(part.material)?part.material:[part.material])){if(mat?.emissive){mat.emissive.set(active?'#0e7490':'#000000');mat.emissiveIntensity=active?0.35:0;}}});
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
    const hit=raycaster.ray.intersectPlane(authoring?authorDragPlane:dragPlane,dragWorld);
    if(!hit)return null;
    return authoring?[hit.x,hit.y,hit.z]:[clamp(hit.x,-11.2,11.2),0.78,clamp(hit.z,-12,12)];
  }
  function onPointerDown(event){
    if(event.button!==0&&event.pointerType==='mouse')return;
    // Clicking the scene enters keyboard mode without pointer lock, so users
    // can still select, drag and connect objects directly.
    canvas.focus({preventScroll:true});
    if(cameraDrag)return;
    const hit=raycastInteraction(event,{dispatch:false});
    const draggable=hit&&(
      ['ordering-object','classification-object','matching-left','assembly-piece'].includes(hit.meta.kind)||
      (authoring&&['assembly-editor-piece','assembly-editor-target','assembly-editor-vertex'].includes(hit.meta.kind))
    );
    if(authoring&&hit)authorDragPlane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()),hit.point);
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
      cameraYaw-=dx*(authoring?0.008:0.006);
      cameraPitch=authoring?clamp(cameraPitch+dy*0.006,-1.38,1.38):clamp(cameraPitch-dy*0.004,-0.58,0.24);
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
  function onWheel(event){
    if(!authoring)return;
    event.preventDefault();
    orbitDistance=clamp(orbitDistance*Math.exp(event.deltaY*0.001),2.5,350);
    camera.far=Math.max(120,orbitDistance*12);
    camera.updateProjectionMatrix();
  }
  function onPointerCancel(event){
    if(!cameraDrag||cameraDrag.pointerId!==event.pointerId)return;
    if(cameraDrag.mode==='object')onDrag(cameraDrag.source,'cancel',{event});
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

  function clearKeys(){for(const key of Object.keys(movement))movement[key]=false;}
  canvas.tabIndex=0;
  canvas.addEventListener('blur',clearKeys);
  globalThis.addEventListener?.('blur',clearKeys);
  canvas.addEventListener('pointerdown',onPointerDown);
  canvas.addEventListener('pointermove',onPointerMove);
  canvas.addEventListener('pointerup',onPointerUp);
  canvas.addEventListener('pointercancel',onPointerCancel);
  if(authoring)canvas.addEventListener('wheel',onWheel,{passive:false});
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
    addCage,
    addModel,
    setTransform,
    updateCage,
    focusOn,
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
    setMovementVector,
    destroy() {
      alive=false;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown',onPointerDown);
      canvas.removeEventListener('pointermove',onPointerMove);
      canvas.removeEventListener('pointerup',onPointerUp);
      canvas.removeEventListener('pointercancel',onPointerCancel);
      if(authoring)canvas.removeEventListener('wheel',onWheel);
      canvas.removeEventListener('keydown',onKeyDown);
      canvas.removeEventListener('keyup',onKeyUp);
      canvas.removeEventListener('blur',clearKeys);
      globalThis.removeEventListener?.('blur',clearKeys);
      setMovementVector(0,0);
      clearKeys();
      clearStage();
      physicsWorld.destroy?.();
      renderer.dispose();
      disposeObject(ground);
      disposeObject(player);
    },
  };
}
