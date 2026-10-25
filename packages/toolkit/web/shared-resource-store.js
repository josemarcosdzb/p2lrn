const encoder=new TextEncoder();

function bytesOf(value){
  if(value instanceof Uint8Array)return value.slice();
  if(value instanceof ArrayBuffer)return new Uint8Array(value.slice(0));
  if(ArrayBuffer.isView(value))return new Uint8Array(value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength));
  if(typeof value==='string')return encoder.encode(value);
  throw new TypeError('Shared resource bytes must be ArrayBuffer, typed bytes or string.');
}

async function sha256(bytes){
  if(!globalThis.crypto?.subtle)throw new Error('Web Crypto SHA-256 is required for the reference shared resource store.');
  const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
  return 'sha256:'+Array.from(new Uint8Array(digest),(value)=>value.toString(16).padStart(2,'0')).join('');
}

function normalizeDigest(value){
  const digest=String(value??'').trim().toLowerCase();
  if(!/^sha256:[0-9a-f]{64}$/.test(digest))throw new TypeError('Shared resource digest must be sha256:<64 hex>.');
  return digest;
}

export function createMemorySharedResourceStore(){
  const objects=new Map();
  const objectUrls=new Map();

  const api={
    async put(value,{mediaType='application/octet-stream'}={}){
      const bytes=bytesOf(value);
      const digest=await sha256(bytes);
      if(!objects.has(digest))objects.set(digest,Object.freeze({digest,bytes,mediaType:String(mediaType||'application/octet-stream'),size:bytes.byteLength}));
      const item=objects.get(digest);
      return Object.freeze({digest:item.digest,mediaType:item.mediaType,size:item.size,deduplicated:item.bytes!==bytes});
    },
    has(digest){return objects.has(normalizeDigest(digest));},
    get(digest){
      const item=objects.get(normalizeDigest(digest));if(!item)return null;
      return Object.freeze({digest:item.digest,mediaType:item.mediaType,size:item.size,bytes:item.bytes.slice()});
    },
    list(){return Object.freeze([...objects.values()].map((item)=>Object.freeze({digest:item.digest,mediaType:item.mediaType,size:item.size})));},
    delete(digest){
      const key=normalizeDigest(digest),url=objectUrls.get(key);
      if(url){try{URL.revokeObjectURL(url);}catch{}objectUrls.delete(key);}
      return objects.delete(key);
    },
    clear(){
      for(const url of objectUrls.values())try{URL.revokeObjectURL(url);}catch{}
      objectUrls.clear();objects.clear();
    },
    async resolve(request){
      if(request?.kind!=='remote'||!request?.expectedDigest)return null;
      const digest=normalizeDigest(request.expectedDigest),item=objects.get(digest);
      if(!item)return null;
      if(!objectUrls.has(digest)){
        if(typeof Blob==='undefined'||typeof URL?.createObjectURL!=='function')return null;
        objectUrls.set(digest,URL.createObjectURL(new Blob([item.bytes],{type:item.mediaType})));
      }
      return Object.freeze({url:objectUrls.get(digest),verified:true,seekable:true});
    },
  };
  return Object.freeze(api);
}
