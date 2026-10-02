const DB_NAME='p2lrn-studio';
const DB_VERSION=1;
const STORE='drafts';
const LATEST='latest';

function openDb(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error??new Error('No se pudo abrir IndexedDB.'));
  });
}
function withStore(mode,run){
  return openDb().then((db)=>new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,mode);
    const store=tx.objectStore(STORE);
    let result;
    try{result=run(store);}catch(error){db.close();reject(error);return;}
    tx.oncomplete=()=>{db.close();resolve(result);};
    tx.onerror=()=>{db.close();reject(tx.error??new Error('Error de IndexedDB.'));};
    tx.onabort=()=>{db.close();reject(tx.error??new Error('Operación de IndexedDB cancelada.'));};
  }));
}
export async function saveLatestDraft({name,bytes,selectedId=null,contentRoot=null}){
  const view=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  const buffer=view.buffer.slice(view.byteOffset,view.byteOffset+view.byteLength);
  const record={id:LATEST,name:String(name||'curso.p2lrn'),bytes:buffer,selectedId:selectedId?String(selectedId):null,contentRoot:contentRoot?String(contentRoot):null,updatedAt:new Date().toISOString()};
  await withStore('readwrite',(store)=>store.put(record));
  return record;
}
export async function loadLatestDraft(){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readonly');
    const request=tx.objectStore(STORE).get(LATEST);
    request.onsuccess=()=>resolve(request.result??null);
    request.onerror=()=>reject(request.error??new Error('No se pudo leer el borrador local.'));
    tx.oncomplete=()=>db.close();
    tx.onerror=()=>{db.close();reject(tx.error??new Error('Error de IndexedDB.'));};
  });
}
export async function clearLatestDraft(){
  await withStore('readwrite',(store)=>store.delete(LATEST));
}
