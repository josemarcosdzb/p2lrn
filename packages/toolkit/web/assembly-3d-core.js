// Shared, host-independent geometry and authoring contract for 3D assembly.
// No DOM, WebGL, package API or platform-specific state in this module.
export const ASSEMBLY_VERSION=1;
export const ASSEMBLY_MAX_PIECES=48;
export const ASSEMBLY_MAX_ASSET_BYTES=24*1024*1024;
export const CAGE_EDGES=Object.freeze([[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]]);
const FACES=[[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[0,1,5,4],[3,7,6,2]];
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const finite=(n)=>typeof n==='number'&&Number.isFinite(n);
const fail=(message)=>{throw new Error('Ensamblaje 3D: '+message);};
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=(v)=>Math.hypot(...v);
const bounded=(value,min,max)=>finite(value)&&value>=min&&value<=max;
const vec=(v,n,limit=1000)=>Array.isArray(v)&&v.length===n&&v.every(x=>bounded(x,-limit,limit));
const unique=(items,label)=>{const seen=new Set();for(const item of items){if(!item||!ID.test(item.id)||seen.has(item.id))fail(label+' con identificador duplicado o inválido');seen.add(item.id)}return seen};
const validQuat=(q)=>vec(q,4,1)&&Math.abs(norm(q)-1)<0.002;
const safePath=(path)=>typeof path==='string'&&/^content\/resources\/[a-f0-9-]+\.(glb)$/i.test(path);

export function cageVertices(width=1.6,height=1.6,depth=1.6){
  if(![width,height,depth].every(n=>bounded(n,0.02,100)))fail('dimensiones inválidas');
  const x=width/2,y=height/2,z=depth/2;
  return [[-x,-y,-z],[x,-y,-z],[x,y,-z],[-x,y,-z],[-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]];
}
// A convex-hull test allows any individual vertex to move, including
// slanted and non-coplanar original quad faces. No fixed cuboid assumption.
function hullPlanes(vertices){
  const planes=[];
  for(let i=0;i<vertices.length;i++)for(let j=i+1;j<vertices.length;j++)for(let k=j+1;k<vertices.length;k++){
    const a=vertices[i],crossed=cross(sub(vertices[j],a),sub(vertices[k],a)),m=norm(crossed);
    if(m<1e-8)continue;
    let n=crossed.map(v=>v/m),d=dot(n,a);
    const distances=vertices.map(p=>dot(n,p)-d);
    const lo=Math.min(...distances),hi=Math.max(...distances);
    if(lo< -1e-6&&hi>1e-6)continue;
    if(lo>=-1e-6){n=n.map(v=>-v);d=-d;}
    if(planes.some(p=>dot(p.normal,n)>1-1e-7&&Math.abs(p.distance-d)<1e-6))continue;
    planes.push({normal:n,distance:d});
  }
  return planes;
}
export function validCage(vertices){
  if(!Array.isArray(vertices)||vertices.length!==8||!vertices.every(v=>vec(v,3)))return false;
  if(new Set(vertices.map(v=>v.map(n=>n.toFixed(5)).join(','))).size!==8)return false;
  const planes=hullPlanes(vertices);
  if(planes.length<4)return false;
  // Every control vertex must remain on the hull; an internal point is a
  // misleading handle that would not affect the placement collider.
  if(vertices.some(v=>planes.filter(p=>Math.abs(dot(p.normal,v)-p.distance)<1e-5).length<3))return false;
  const values=[];
  for(let a=0;a<vertices.length;a++)for(let b=a+1;b<vertices.length;b++)for(let c=b+1;c<vertices.length;c++)for(let d=c+1;d<vertices.length;d++)
    values.push(Math.abs(dot(sub(vertices[b],vertices[a]),cross(sub(vertices[c],vertices[a]),sub(vertices[d],vertices[a])))/6));
  return Math.max(...values)>1e-5;
}
export function rotateVector(v,q){
  // Quaternion x,y,z,w, v transformed without a matrix allocation.
  const [x,y,z,w]=q,t=cross([x,y,z],v).map(n=>2*n);
  const c=cross([x,y,z],t);
  return v.map((n,i)=>n+w*t[i]+c[i]);
}
export function toWorld(local,transform){
  const scaled=local.map((n,i)=>n*transform.scale[i]);
  return rotateVector(scaled,transform.rotation).map((n,i)=>n+transform.position[i]);
}
export function toLocal(world,transform){
  const q=transform.rotation,inv=[-q[0],-q[1],-q[2],q[3]];
  const rel=world.map((n,i)=>n-transform.position[i]);
  return rotateVector(rel,inv).map((n,i)=>n/transform.scale[i]);
}
export function cageContains(world,target,epsilon=0){
  const point=toLocal(world,target.transform);
  const planes=hullPlanes(target.vertices);
  if(planes.length<4)return false;
  const tolerance=epsilon/Math.min(...target.transform.scale);
  return planes.every(p=>dot(p.normal,point)-p.distance<=tolerance+1e-7);
}
export function rotationErrorDegrees(a,b){
  // q and -q represent the same rotation.
  const d=Math.min(1,Math.abs(dot(a,b)));
  return 2*Math.acos(d)*180/Math.PI;
}
// A piece's correct pose is relative to its destination, never its starting
// transform. Moving or resizing the teacher's cage preserves the fitting pose.
function qmul(a,b){
  const [x,y,z,w]=a,[u,v,t,s]=b;
  return [w*u+x*s+y*t-z*v,w*v-x*t+y*s+z*u,w*t+x*v-y*u+z*s,w*s-x*u-y*v-z*t];
}
const identity=[0,0,0,1];
function boundsCenter(bounds){
  return bounds?[0,1,2].map(i=>(bounds.min[i]+bounds.max[i])/2):[0,0,0];
}
export function assemblyPlacementTransform(scene,pieceId){
  const link=scene.links.find(l=>l.pieceId===pieceId);
  const target=scene.targets.find(t=>t.id===link?.targetId);
  if(!link||!target)return null;
  if(!link.placement)return structuredClone(target.transform);
  const pose=link.placement;
  const rotation=qmul(target.transform.rotation,pose.rotation);
  const scale=[...pose.scale];
  const worldCenter=toWorld(pose.offset,target.transform);
  const anchor=boundsCenter(pose.bounds);
  const centerOffset=rotateVector(anchor.map((v,i)=>v*scale[i]),rotation);
  return {
    position:worldCenter.map((v,i)=>v-centerOffset[i]),
    rotation,scale,
  };
}
export function fitAssemblyBounds(target,bounds,{margin=0.88}={}){
  if(!bounds||!vec(bounds.min,3,100000)||!vec(bounds.max,3,100000)||
    !bounds.min.every((n,i)=>bounds.max[i]-n>1e-6))fail('el modelo no tiene dimensiones 3D válidas');
  if(!bounded(margin,0.2,0.98))fail('margen de ajuste inválido');
  if(!validCage(target.vertices))fail('caja de encaje no válida');
  const lows=[0,1,2].map(i=>Math.min(...target.vertices.map(v=>v[i])));
  const highs=[0,1,2].map(i=>Math.max(...target.vertices.map(v=>v[i])));
  const size=[0,1,2].map(i=>highs[i]-lows[i]);
  const modelSize=[0,1,2].map(i=>bounds.max[i]-bounds.min[i]);
  // Uniform world scaling preserves shape; the cage owns its own rotation.
  const fitted=Math.min(100,...size.map((n,i)=>n*target.transform.scale[i]/modelSize[i]))*margin;
  if(!bounded(fitted,0.001,99))fail('el modelo no se puede ajustar a la caja por sus dimensiones');
  return {
    offset:lows.map((v,i)=>(v+highs[i])/2),
    rotation:[...identity],
    scale:[fitted,fitted,fitted],
    bounds:{min:[...bounds.min],max:[...bounds.max]},
  };
}
export function assemblyFitStatus(scene,pieceId,placement){
  const link=scene.links.find(l=>l.pieceId===pieceId);
  if(!link)return {ok:false,reason:'wrong-target'};
  return evaluateAssemblyPlacement(scene,pieceId,link.targetId,placement??assemblyPlacementTransform(scene,pieceId));
}
export function defaultAssembly(){
  const pieces=[
    {id:'piece-1',text:'Pieza 1',assetId:null,nodeId:null,initialTransform:{position:[-2.5,0.8,2.5],rotation:[0,0,0,1],scale:[1,1,1]}},
    {id:'piece-2',text:'Pieza 2',assetId:null,nodeId:null,initialTransform:{position:[2.5,0.8,2.5],rotation:[0,0,0,1],scale:[1,1,1]}},
  ];
  const targets=[
    {id:'target-1',text:'Destino 1',vertices:cageVertices(),transform:{position:[-1.5,1.15,-2.5],rotation:[0,0,0,1],scale:[1,1,1]},visibility:'outline'},
    {id:'target-2',text:'Destino 2',vertices:cageVertices(),transform:{position:[1.5,1.15,-2.5],rotation:[0,0,0,1],scale:[1,1,1]},visibility:'outline'},
  ];
  return {version:ASSEMBLY_VERSION,units:'m',assets:[],pieces,targets,links:[
    {pieceId:'piece-1',targetId:'target-1',positionTolerance:0.18,rotationToleranceDeg:22,prerequisites:[]},
    {pieceId:'piece-2',targetId:'target-2',positionTolerance:0.18,rotationToleranceDeg:22,prerequisites:[]},
  ],interactionMode:'drag-or-select'};
}
export function validateAssembly(scene,{requireReady=true}={}){
  if(!scene||scene.version!==ASSEMBLY_VERSION||scene.units!=='m')fail('versión o unidades no compatibles');
  if(!Array.isArray(scene.pieces)||scene.pieces.length<2||scene.pieces.length>ASSEMBLY_MAX_PIECES)fail('número de piezas fuera de límites');
  if(!Array.isArray(scene.targets)||scene.targets.length<2||scene.targets.length>ASSEMBLY_MAX_PIECES)fail('número de destinos fuera de límites');
  if(!Array.isArray(scene.assets)||scene.assets.length>ASSEMBLY_MAX_PIECES)fail('activos inválidos');
  const pieceIds=unique(scene.pieces,'pieza'),targetIds=unique(scene.targets,'destino'),assetIds=unique(scene.assets,'modelo');
  for(const asset of scene.assets){
    if(!safePath(asset.path)||typeof asset.name!=='string'||asset.name.length>200)fail('recurso 3D no incrustado o inválido');
    if(!Number.isInteger(asset.size)||asset.size<20||asset.size>ASSEMBLY_MAX_ASSET_BYTES)fail('tamaño de recurso inválido');
  }
  const validTransform=(t)=>t&&vec(t.position,3)&&validQuat(t.rotation)&&vec(t.scale,3,100)&&t.scale.every(n=>n>=0.001);
  if(scene.referenceAssetId!=null&&!assetIds.has(scene.referenceAssetId))fail('modelo base de referencia inexistente');
  if(scene.referenceTransform!=null&&!validTransform(scene.referenceTransform))fail('transformación de referencia inválida');
  for(const p of scene.pieces){
    if(typeof p.text!=='string'||!p.text.trim()||!validTransform(p.initialTransform))fail('pieza con geometría/texto inválidos');
    if(p.assetId!==null&&p.assetId!==undefined&&!assetIds.has(p.assetId))fail('modelo de pieza inexistente');
    if(p.nodeId!==null&&p.nodeId!==undefined&&(typeof p.nodeId!=='string'||p.nodeId.length>160))fail('nodo de modelo inválido');
  }
  for(const t of scene.targets){
    if(typeof t.text!=='string'||!t.text.trim()||!validTransform(t.transform)||!validCage(t.vertices))fail('destino con vértices, volumen o posición inválidos');
    if(t.visibility!==undefined&&!['outline','hidden','hint'].includes(t.visibility))fail('visibilidad de destino inválida');
  }
  if(!['drag-or-select','select','drag'].includes(scene.interactionMode))fail('modo de interacción inválido');
  if(!Array.isArray(scene.links)||scene.links.length!==scene.pieces.length)fail('cada pieza necesita un destino');
  const seen=new Set(),deps=new Map();
  for(const link of scene.links){
    if(!pieceIds.has(link.pieceId)||!targetIds.has(link.targetId)||seen.has(link.pieceId))fail('relación de montaje inexistente o duplicada');
    if(!bounded(link.positionTolerance,0,2)||!bounded(link.rotationToleranceDeg,0,180))fail('tolerancias fuera de límites');
    if(link.scaleTolerance!==undefined&&!bounded(link.scaleTolerance,0,1))fail('tolerancia de escala inválida');
    if(link.placement!==undefined){
      const p=link.placement;
      if(!p||!vec(p.offset,3)||!validQuat(p.rotation)||!vec(p.scale,3,100)||!p.scale.every(v=>v>=0.001))fail('encaje configurado con posición, giro o escala no válidos');
      if(p.bounds&&(!vec(p.bounds.min,3,100000)||!vec(p.bounds.max,3,100000)||!p.bounds.min.every((v,i)=>p.bounds.max[i]-v>1e-6)))fail('dimensiones de la pieza no válidas');
    }
    if(!Array.isArray(link.prerequisites)||link.prerequisites.length>ASSEMBLY_MAX_PIECES||link.prerequisites.some(id=>!pieceIds.has(id)||id===link.pieceId))fail('dependencias inválidas');
    seen.add(link.pieceId);deps.set(link.pieceId,link.prerequisites);
  }
  const visited=new Set(),stack=new Set();
  function walk(id){if(stack.has(id))fail('dependencias circulares');if(visited.has(id))return;stack.add(id);for(const dep of deps.get(id)??[])walk(dep);stack.delete(id);visited.add(id)}
  for(const id of pieceIds)walk(id);
  if(requireReady&&scene.assets.some(asset=>scene.pieces.every(p=>p.assetId!==asset.id)&&scene.referenceAssetId!==asset.id))fail('modelo sin piezas asociadas');
  return scene;
}
export function evaluateAssemblyPlacement(scene,pieceId,targetId,placement,placed={}){
  validateAssembly(scene,{requireReady:false});
  const link=scene.links.find(l=>l.pieceId===pieceId),target=scene.targets.find(t=>t.id===targetId);
  if(!link||!target||link.targetId!==targetId)return {ok:false,reason:'wrong-target'};
  if(link.prerequisites.some(id=>placed[id]!==scene.links.find(l=>l.pieceId===id)?.targetId))return {ok:false,reason:'prerequisite'};
  if(!placement||!vec(placement.position,3)||!validQuat(placement.rotation)||
    (placement.scale!==undefined&&(!vec(placement.scale,3,100)||!placement.scale.every(v=>v>=0.001))))
    return {ok:false,reason:'invalid-transform'};
  const expected=assemblyPlacementTransform(scene,pieceId);
  const pose=link.placement;
  if(pose){
    // Measure the geometric centre, NOT the potentially remote glTF pivot.
    const center=boundsCenter(pose.bounds);
    const actual={...placement,scale:placement.scale??expected.scale};
    const worldCenter=toWorld(center,actual);
    const desiredCenter=toWorld(center,expected);
    if(!cageContains(worldCenter,target,link.positionTolerance))return {ok:false,reason:'outside'};
    if(norm(sub(worldCenter,desiredCenter))>link.positionTolerance+1e-7)return {ok:false,reason:'misaligned'};
    if(rotationErrorDegrees(actual.rotation,expected.rotation)>link.rotationToleranceDeg)return {ok:false,reason:'rotation'};
    const maxScaleError=Math.max(...actual.scale.map((v,i)=>Math.abs(v/expected.scale[i]-1)));
    if(maxScaleError>(link.scaleTolerance??0.12))return {ok:false,reason:'scale'};
    if(pose.bounds){
      // All corners must be inside the authored convex cage, not just its pivot.
      const {min,max}=pose.bounds;
      const corners=[];
      for(const x of [min[0],max[0]])for(const y of [min[1],max[1]])for(const z of [min[2],max[2]])corners.push([x,y,z]);
      if(corners.some(c=>!cageContains(toWorld(c,actual),target,link.positionTolerance)))
        return {ok:false,reason:'outside-volume'};
    }
  }else{
    // Old, unmodified courses retain their original placement semantics.
    if(!cageContains(placement.position,target,link.positionTolerance))return {ok:false,reason:'outside'};
    if(rotationErrorDegrees(placement.rotation,target.transform.rotation)>link.rotationToleranceDeg)return {ok:false,reason:'rotation'};
  }
  return {ok:true,reason:'accepted',snap:expected};
}
export function inspectAssemblyGLB(bytes){
  const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes??[]);
  if(data.byteLength<28||data.byteLength>ASSEMBLY_MAX_ASSET_BYTES)fail('GLB vacío o excesivamente grande');
  const dv=new DataView(data.buffer,data.byteOffset,data.byteLength);
  if(dv.getUint32(0,true)!==0x46546c67||dv.getUint32(4,true)!==2||dv.getUint32(8,true)!==data.byteLength)fail('cabecera GLB 2.0 no válida');
  const jsonSize=dv.getUint32(12,true);
  if(jsonSize<2||jsonSize>3*1024*1024||jsonSize+20>data.byteLength||dv.getUint32(16,true)!==0x4e4f534a)fail('bloque JSON GLB inválido');
  let doc;
  try{doc=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data.subarray(20,20+jsonSize)).trim());}catch{fail('JSON GLB malformado')}
  if(doc.asset?.version!=='2.0'||!Array.isArray(doc.meshes)||!doc.meshes.length)fail('GLB sin mallas glTF 2.0');
  if((doc.extensionsRequired??[]).some(e=>!['KHR_mesh_quantization','KHR_materials_unlit','KHR_texture_transform','KHR_lights_punctual'].includes(e)))fail('compresión o extensión requerida sin decodificador');
  if((doc.buffers??[]).some(b=>b.uri)|| (doc.images??[]).some(i=>i.uri))fail('GLB con dependencias externas; usa un GLB autocontenido');
  if((doc.nodes?.length??0)>4000||(doc.meshes?.length??0)>1200||(doc.images?.length??0)>128)fail('GLB demasiado complejo');
  let offset=12;
  while(offset<data.byteLength){if(offset+8>data.byteLength)fail('chunk GLB truncado');const n=dv.getUint32(offset,true);if(n%4!==0||offset+8+n>data.byteLength)fail('longitud de chunk GLB inválida');offset+=8+n}
  if(offset!==data.byteLength)fail('GLB con bytes residuales');
  const nodes=(doc.nodes??[]).map((n,i)=>n.mesh===undefined?null:{name:String(n.name??'Malla '+(i+1)),nodeId:String(i),mesh:n.mesh}).filter(Boolean);
  return {name:doc.asset?.generator??'Modelo GLB',nodes,meshCount:doc.meshes.length,size:data.byteLength};
}
