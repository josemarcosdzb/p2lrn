const encoder=new TextEncoder();

function canonicalize(value){
  if(value===null||typeof value==='boolean'||typeof value==='string')return JSON.stringify(value);
  if(typeof value==='number'){
    if(!Number.isFinite(value))throw new Error('Non-finite JSON number.');
    if(Number.isInteger(value)&&!Number.isSafeInteger(value))throw new Error('Unsafe JSON integer.');
    return JSON.stringify(value);
  }
  if(Array.isArray(value))return '['+value.map(canonicalize).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map((key)=>JSON.stringify(key)+':'+canonicalize(value[key])).join(',')+'}';
  throw new Error('Unsupported JSON value.');
}
function jsonBytes(value){return encoder.encode(JSON.stringify(value,null,2)+'\n');}
function concat(parts){
  const size=parts.reduce((sum,part)=>sum+part.byteLength,0);
  const out=new Uint8Array(size);let offset=0;
  for(const part of parts){out.set(part,offset);offset+=part.byteLength;}
  return out;
}
function put16(view,offset,value){view.setUint16(offset,value,true);}
function put32(view,offset,value){view.setUint32(offset,value>>>0,true);}
let crcTable=null;
function table(){
  if(crcTable)return crcTable;
  const out=new Uint32Array(256);
  for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);out[n]=c>>>0;}
  crcTable=out;return out;
}
function crc32(bytes){
  let c=0xffffffff;const t=table();
  for(const byte of bytes)c=t[(c^byte)&0xff]^(c>>>8);
  return(c^0xffffffff)>>>0;
}
async function sha256(bytes){
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  return 'sha256:'+Array.from(digest,(byte)=>byte.toString(16).padStart(2,'0')).join('');
}
function baseMedia(mediaType){return String(mediaType??'application/octet-stream').split(';',1)[0].trim().toLowerCase();}
async function contentDigest(bytes,mediaType){
  const media=baseMedia(mediaType);
  if(media==='application/json'||media.endsWith('+json')){
    const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    return sha256(encoder.encode(canonicalize(value)));
  }
  return sha256(bytes);
}
async function descriptor(path,bytes,mediaType,schema){
  const out={path,mediaType,size:bytes.byteLength,byteDigest:await sha256(bytes),contentDigest:await contentDigest(bytes,mediaType)};
  if(schema)out.schema=schema;
  return out;
}
function normalizedIntegrityInput(manifest){
  const compare=(a,b)=>{const x=String(a??''),y=String(b??'');return x<y?-1:x>y?1:0;};
  const tuple=(a,b,keys)=>{for(const key of keys){const value=compare(a[key],b[key]);if(value)return value;}return 0;};
  return {
    format:manifest.format,
    formatVersion:manifest.formatVersion,
    entrypoints:manifest.entrypoints.map(({id,type,role})=>({id,type,role})).sort((a,b)=>tuple(a,b,['role','type','id'])),
    graph:{schema:manifest.graph.schema,mediaType:manifest.graph.mediaType,contentDigest:manifest.graph.contentDigest},
    profiles:manifest.profiles.map(({id,version,requirement})=>({id,version,requirement})).sort((a,b)=>tuple(a,b,['id','version','requirement'])),
    files:manifest.files.map(({path,mediaType,contentDigest})=>({path,mediaType,contentDigest})).sort((a,b)=>compare(a.path,b.path)),
  };
}
function writeStoredZip(entries){
  if(entries.length>=0xffff)throw new Error('Studio browser export currently supports fewer than 65535 files.');
  const localParts=[],centralParts=[];
  let offset=0;
  for(const entry of entries){
    const name=encoder.encode(entry.path),data=entry.data;
    if(data.byteLength>=0xffffffff||offset>=0xffffffff)throw new Error('Studio browser export does not write ZIP64 packages.');
    const crc=crc32(data);
    const local=new Uint8Array(30+name.byteLength);
    const lv=new DataView(local.buffer);
    put32(lv,0,0x04034b50);put16(lv,4,20);put16(lv,6,0x0800);put16(lv,8,0);put16(lv,10,0);put16(lv,12,0x21);
    put32(lv,14,crc);put32(lv,18,data.byteLength);put32(lv,22,data.byteLength);put16(lv,26,name.byteLength);put16(lv,28,0);local.set(name,30);
    const central=new Uint8Array(46+name.byteLength);
    const cv=new DataView(central.buffer);
    put32(cv,0,0x02014b50);put16(cv,4,20);put16(cv,6,20);put16(cv,8,0x0800);put16(cv,10,0);put16(cv,12,0);put16(cv,14,0x21);
    put32(cv,16,crc);put32(cv,20,data.byteLength);put32(cv,24,data.byteLength);put16(cv,28,name.byteLength);put16(cv,30,0);put16(cv,32,0);
    put16(cv,34,0);put16(cv,36,0);put32(cv,38,0o100644<<16);put32(cv,42,offset);central.set(name,46);
    localParts.push(local,data);centralParts.push(central);offset+=local.byteLength+data.byteLength;
  }
  const locals=concat(localParts),central=concat(centralParts);
  if(locals.byteLength>=0xffffffff||central.byteLength>=0xffffffff)throw new Error('Studio browser export does not write ZIP64 packages.');
  const end=new Uint8Array(22),ev=new DataView(end.buffer);
  put32(ev,0,0x06054b50);put16(ev,4,0);put16(ev,6,0);put16(ev,8,entries.length);put16(ev,10,entries.length);
  put32(ev,12,central.byteLength);put32(ev,16,locals.byteLength);put16(ev,20,0);
  return concat([locals,central,end]);
}

export async function exportP2LRNPackage(document){
  if(!document?.package||!document?.manifest||!document?.graph)throw new TypeError('Studio document is required.');
  const manifest=structuredClone(document.manifest);
  const graph=structuredClone(document.graph);
  const rootId=document.rootId;
  const course=graph.entities.find((entity)=>entity.id===rootId&&entity.type==='course');
  if(course&&document.dirty&&Number.isInteger(course.revision))course.revision+=1;

  const graphBytes=jsonBytes(graph);
  manifest.graph=await descriptor(manifest.graph.path,graphBytes,manifest.graph.mediaType,manifest.graph.schema);

  const payloads=new Map();
  const files=[];
  for(const original of manifest.files){
    const bytes=document.payloadOverrides.has(original.path)
      ?document.payloadOverrides.get(original.path)
      :await document.package.zip.read(original.path);
    payloads.set(original.path,bytes);
    files.push(await descriptor(original.path,bytes,original.mediaType,original.schema));
  }
  files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  manifest.files=files;
  manifest.integrity={algorithm:'sha256',contentRoot:await sha256(encoder.encode(canonicalize(normalizedIntegrityInput(manifest))))};
  manifest.packageId='urn:uuid:'+crypto.randomUUID();
  const manifestBytes=jsonBytes(manifest);

  const entries=[
    {path:'META-INF/manifest.json',data:manifestBytes},
    {path:manifest.graph.path,data:graphBytes},
    ...files.map((file)=>({path:file.path,data:payloads.get(file.path)})),
  ];
  return {
    bytes:writeStoredZip(entries),
    manifest,
    graph,
    filename:String(document.sourceName||'curso.p2lrn').replace(/\.p2lrn$/i,'')+(document.createdFromScratch?'':'-editado')+'.p2lrn',
  };
}
