const DIGEST_RE=/^sha256:[0-9a-f]{64}$/;
export const RESOURCE_LIBRARY_VERSION='1';
export const RESOURCE_LIBRARY_CAPABILITY_ID='resource.library';
export const DEFAULT_RESOURCE_LIBRARY_CACHE='p2lrn-resource-library-v1';
export const DEFAULT_RESOURCE_LIBRARY_MAX_BYTES=1024*1024*1024;

function cloneBuffer(value){
  if(value instanceof ArrayBuffer)return value.slice(0);
  if(ArrayBuffer.isView(value))return value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength);
  throw new TypeError('P2LRN resource library bytes must be an ArrayBuffer or typed array.');
}
function digestValue(value){
  const text=String(value??'').toLowerCase();
  if(!DIGEST_RE.test(text))throw new TypeError('P2LRN resource digest must be sha256:<64 lowercase hex>.');
  return text;
}
function mediaType(value){const text=String(value??'application/octet-stream').trim();return text||'application/octet-stream';}
function boundedBytes(bytes,maxBytes){
  const copy=cloneBuffer(bytes);
  if(copy.byteLength>maxBytes)throw new RangeError('P2LRN resource exceeds resource library limit ('+maxBytes+' bytes).');
  return copy;
}
async function sha256(bytes){
  if(!globalThis.crypto?.subtle?.digest)throw new Error('Web Crypto SHA-256 is unavailable.');
  const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
  return 'sha256:'+Array.from(new Uint8Array(digest),(x)=>x.toString(16).padStart(2,'0')).join('');
}
function normalizeEntry(value,maxBytes){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError('P2LRN resource library entry must be an object.');
  const digest=digestValue(value.digest);
  const bytes=boundedBytes(value.bytes,maxBytes);
  const href=value.href==null?null:new URL(String(value.href)).href;
  return Object.freeze({digest,mediaType:mediaType(value.mediaType),bytes,size:bytes.byteLength,storedAt:String(value.storedAt??new Date().toISOString()),href});
}
function syntheticUrl(digest){
  const origin=globalThis.location?.origin&&globalThis.location.origin!=='null'?globalThis.location.origin:'https://p2lrn.invalid';
  return new URL('/__p2lrn_resource_library__/'+digest.slice(7),origin).href;
}

export function createMemoryResourceLibrary({maxBytes=DEFAULT_RESOURCE_LIBRARY_MAX_BYTES}={}){
  const entries=new Map();
  return Object.freeze({
    async put(entry){const normalized=normalizeEntry(entry,maxBytes);entries.set(normalized.digest,normalized);return normalized;},
    async get(digest){const item=entries.get(digestValue(digest));return item?normalizeEntry(item,maxBytes):null;},
    async has(digest){return entries.has(digestValue(digest));},
    async delete(digest){return entries.delete(digestValue(digest));},
    async list(){return [...entries.values()].map(({bytes,...meta})=>Object.freeze({...meta}));},
    async clear(){entries.clear();},
  });
}

export function createCacheStorageResourceLibrary({name=DEFAULT_RESOURCE_LIBRARY_CACHE,cacheStorage=globalThis.caches,maxBytes=DEFAULT_RESOURCE_LIBRARY_MAX_BYTES}={}){
  if(!cacheStorage||typeof cacheStorage.open!=='function')throw new Error('Cache Storage is unavailable for P2LRN resource library.');
  const cachePromise=cacheStorage.open(String(name));
  return Object.freeze({
    async put(entry){
      const normalized=normalizeEntry(entry,maxBytes),cache=await cachePromise;
      const headers=new Headers({
        'Content-Type':normalized.mediaType,
        'Content-Length':String(normalized.size),
        'X-P2LRN-Resource-Library-Version':RESOURCE_LIBRARY_VERSION,
        'X-P2LRN-Digest':normalized.digest,
        'X-P2LRN-Stored-At':normalized.storedAt,
        ...(normalized.href?{'X-P2LRN-Source-URL':normalized.href}:{}),
        'Cache-Control':'private, max-age=31536000, immutable',
        'X-Content-Type-Options':'nosniff',
      });
      await cache.put(syntheticUrl(normalized.digest),new Response(normalized.bytes.slice(0),{status:200,headers}));
      return normalized;
    },
    async get(digest){
      const normalized=digestValue(digest),cache=await cachePromise,response=await cache.match(syntheticUrl(normalized));
      if(!response||response.headers.get('X-P2LRN-Digest')!==normalized)return null;
      const bytes=await response.arrayBuffer();
      if(bytes.byteLength>maxBytes){await cache.delete(syntheticUrl(normalized));throw new RangeError('Cached P2LRN resource exceeds resource library limit.');}
      return normalizeEntry({digest:normalized,mediaType:response.headers.get('Content-Type'),bytes,storedAt:response.headers.get('X-P2LRN-Stored-At'),href:response.headers.get('X-P2LRN-Source-URL')},maxBytes);
    },
    async has(digest){const normalized=digestValue(digest),cache=await cachePromise;return Boolean(await cache.match(syntheticUrl(normalized)));},
    async delete(digest){const normalized=digestValue(digest),cache=await cachePromise;return cache.delete(syntheticUrl(normalized));},
    async list(){
      const cache=await cachePromise,out=[];
      for(const request of await cache.keys()){
        const response=await cache.match(request),digest=response?.headers.get('X-P2LRN-Digest');
        if(!DIGEST_RE.test(String(digest??'')))continue;
        out.push(Object.freeze({
          digest,
          mediaType:response.headers.get('Content-Type')??'application/octet-stream',
          size:Number(response.headers.get('Content-Length'))||null,
          storedAt:response.headers.get('X-P2LRN-Stored-At')??null,
          href:response.headers.get('X-P2LRN-Source-URL')??null,
        }));
      }
      return out;
    },
    async clear(){const cache=await cachePromise;await Promise.all((await cache.keys()).map((request)=>cache.delete(request)));},
  });
}

export function normalizeResourceLibrary(value){
  if(value==null)return null;
  for(const method of ['put','get','has','delete','list'])if(typeof value?.[method]!=='function')throw new TypeError('P2LRN resource library requires '+method+'().');
  return value;
}

export async function verifyResourceBytes(bytes,expectedDigest,{maxBytes=DEFAULT_RESOURCE_LIBRARY_MAX_BYTES}={}){
  const copy=boundedBytes(bytes,maxBytes),expected=digestValue(expectedDigest),actual=await sha256(copy);
  if(actual!==expected){
    const error=new Error('P2LRN shared resource digest mismatch: expected '+expected+', got '+actual);
    error.code='P2LRN_RESOURCE_DIGEST_MISMATCH';
    throw error;
  }
  return Object.freeze({bytes:copy,digest:actual,size:copy.byteLength});
}

export function createResourceLibraryResolver({
  store,
  networkFetch=globalThis.fetch,
  maxBytes=DEFAULT_RESOURCE_LIBRARY_MAX_BYTES,
  createObjectUrl=(blob)=>URL.createObjectURL(blob),
  revokeObjectUrl=(url)=>URL.revokeObjectURL(url),
}={}){
  const library=normalizeResourceLibrary(store);
  if(!library)throw new TypeError('P2LRN resource library store is required.');
  const fetcher=typeof networkFetch==='function'?(networkFetch===globalThis.fetch?networkFetch.bind(globalThis):networkFetch):null;
  const objectUrls=new Map();

  async function loadRemote(request){
    const expected=digestValue(request.expectedDigest);
    let entry=await library.get(expected);
    if(entry)return entry;
    if(!fetcher||!request.href)return null;
    const response=await fetcher(String(request.href),{method:'GET',credentials:'omit',redirect:'follow'});
    if(!response?.ok)throw new Error('P2LRN shared resource fetch failed: HTTP '+String(response?.status??'unknown'));
    const declared=Number(response.headers?.get?.('Content-Length'));
    if(Number.isFinite(declared)&&declared>maxBytes)throw new RangeError('P2LRN shared resource exceeds configured maximum size.');
    const bytes=await response.arrayBuffer();
    const verified=await verifyResourceBytes(bytes,expected,{maxBytes});
    entry=await library.put({digest:verified.digest,mediaType:request.mediaType??response.headers?.get?.('Content-Type'),bytes:verified.bytes,href:request.href});
    return entry;
  }

  return Object.freeze({
    async resolve(request){
      if(!request||typeof request!=='object')return null;
      const expected=request.expectedDigest;
      if(!expected||!DIGEST_RE.test(String(expected).toLowerCase()))return null;
      const entry=await loadRemote({...request,expectedDigest:String(expected).toLowerCase()});
      if(!entry)return null;
      let url=objectUrls.get(entry.digest);
      if(!url){
        url=createObjectUrl(new Blob([entry.bytes],{type:entry.mediaType}));
        objectUrls.set(entry.digest,url);
      }
      return Object.freeze({url,verified:true,seekable:true,digest:entry.digest,source:'resource-library'});
    },
    async prefetch({href,expectedDigest,mediaType:requestedMediaType}){
      const entry=await loadRemote({href,expectedDigest,mediaType:requestedMediaType});
      return entry?Object.freeze({digest:entry.digest,mediaType:entry.mediaType,size:entry.size,storedAt:entry.storedAt}):null;
    },
    async has(digest){return library.has(digest);},
    async list(){return library.list();},
    destroy(){for(const url of objectUrls.values())try{revokeObjectUrl(url);}catch{}objectUrls.clear();},
    store:library,
  });
}



function searchText(value){return String(value??'').normalize('NFKC').toLocaleLowerCase('es').trim();}

export function createResourceLibraryCapabilityProvider({store,id=RESOURCE_LIBRARY_CAPABILITY_ID}={}){
  const library=normalizeResourceLibrary(store);
  if(!library)throw new TypeError('P2LRN resource library capability requires a store.');
  const capabilityId=String(id??'').trim();
  if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(capabilityId))throw new TypeError('Invalid resource library capability id.');
  return Object.freeze({
    id:capabilityId,
    operations:Object.freeze(['search','describe','has']),
    async invoke(operation,input={}){
      if(operation==='has')return{digest:String(input.digest??''),available:await library.has(input.digest)};
      const items=await library.list();
      if(operation==='describe'){
        const digest=digestValue(input.digest);
        const item=items.find((entry)=>entry.digest===digest)??null;
        return item?{...item}:null;
      }
      if(operation==='search'){
        const q=searchText(input.query),media=searchText(input.mediaType),limit=Math.max(1,Math.min(200,Number(input.limit)||50));
        return{items:items.filter((entry)=>{
          if(media&&!searchText(entry.mediaType).includes(media))return false;
          if(!q)return true;
          return searchText([entry.digest,entry.mediaType,entry.href,entry.storedAt].filter(Boolean).join(' ')).includes(q);
        }).slice(0,limit).map((entry)=>({...entry})),total:items.length};
      }
      const error=new Error('Unsupported resource library operation: '+operation);error.code='P2LRN_CAPABILITY_UNAVAILABLE';throw error;
    },
  });
}
