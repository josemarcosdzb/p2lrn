import * as THREE from '../vendor/three.module.js';
import {createRapierPhysicsWorld} from './physics/rapier-adapter.js';
import {createNoPhysicsWorld} from './physics/no-physics.js';

const PALETTE=['#38bdf8','#a78bfa','#34d399','#f59e0b','#fb7185','#22d3ee','#c084fc'];

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

export async function createThreeGameScene(canvas,{onInteraction=()=>{},physics='rapier'}={}) {
  let physicsWorld;
  try {
    physicsWorld=physics==='none'?await createNoPhysicsWorld():await createRapierPhysicsWorld();
  } catch (error) {
    console.warn('P2LRN 3D physics fallback:',error);
    physicsWorld=await createNoPhysicsWorld();
  }

  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
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

  const stage=new THREE.Group();
  scene.add(stage);
  const meshes=new Map();
  const bodies=new Set();
  const interactables=[];
  const connectors=[];
  const raycaster=new THREE.Raycaster();
  const pointer=new THREE.Vector2();
  let alive=true;
  let raf=0;
  let last=performance.now();

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
    const mesh=new THREE.Mesh(
      new THREE.SphereGeometry(0.72,28,20),
      new THREE.MeshStandardMaterial({color,roughness:0.48,metalness:0.16}),
    );
    mesh.position.set(...normalizePosition(position));
    mesh.castShadow=true;
    mesh.userData.p2lrnInteraction=interaction;
    addLabel(mesh,text,1.25,{border:color});
    stage.add(mesh);
    meshes.set(String(id),mesh);
    if (interaction) interactables.push(mesh);
    return mesh;
  }

  function connect(fromId,toId,{color='#34d399'}={}) {
    const from=meshes.get(String(fromId));
    const to=meshes.get(String(toId));
    if (!from || !to) return null;
    const geometry=new THREE.BufferGeometry().setFromPoints([from.position.clone(),to.position.clone()]);
    const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color}));
    line.userData.fromId=String(fromId);
    line.userData.toId=String(toId);
    stage.add(line);
    connectors.push(line);
    return line;
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
    physicsWorld.step?.(delta);
    syncPhysics();
    renderer.render(scene,camera);
    raf=requestAnimationFrame(frame);
  }

  function onPointer(event) {
    const rect=canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    pointer.x=((event.clientX-rect.left)/rect.width)*2-1;
    pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;
    raycaster.setFromCamera(pointer,camera);
    const hits=raycaster.intersectObjects(interactables,true);
    for (const hit of hits) {
      let node=hit.object;
      while (node && !node.userData?.p2lrnInteraction) node=node.parent;
      if (node?.userData?.p2lrnInteraction) {
        onInteraction(node.userData.p2lrnInteraction,{point:hit.point,event});
        break;
      }
    }
  }

  canvas.addEventListener('pointerdown',onPointer);
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
    setTranslation,
    highlight,
    destroy() {
      alive=false;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown',onPointer);
      clearStage();
      physicsWorld.destroy?.();
      renderer.dispose();
      disposeObject(ground);
    },
  };
}
