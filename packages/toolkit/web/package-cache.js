export const PACKAGE_CACHE_VERSION = '1';
export const DEFAULT_PACKAGE_CACHE_NAME = 'p2lrn-package-cache-v1';
const CONTENT_ROOT_RE = /^sha256:[0-9a-f]{64}$/;

function cloneBuffer(value) {
  if (value instanceof ArrayBuffer) return value.slice(0);
  if (ArrayBuffer.isView(value)) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  throw new TypeError('P2LRN package cache bytes must be an ArrayBuffer or typed array.');
}

function normalizeUrl(value) {
  const base = globalThis.location?.href ?? 'http://127.0.0.1/';
  const url = new URL(String(value), base);
  if (!['http:','https:'].includes(url.protocol)) throw new TypeError('P2LRN package cache only accepts HTTP(S) source URLs.');
  url.hash = '';
  return url.href;
}

function normalizeEntry(value) {
  if (!value || typeof value !== 'object') throw new TypeError('P2LRN package cache entry must be an object.');
  const sourceUrl = normalizeUrl(value.sourceUrl);
  const contentRoot = String(value.contentRoot ?? '');
  if (!CONTENT_ROOT_RE.test(contentRoot)) throw new TypeError('P2LRN package cache contentRoot is invalid.');
  const packageId = String(value.packageId ?? '').trim();
  if (!packageId) throw new TypeError('P2LRN package cache packageId is required.');
  const bytes = cloneBuffer(value.bytes);
  const cachedAt = String(value.cachedAt ?? new Date().toISOString());
  return Object.freeze({sourceUrl, contentRoot, packageId, bytes, size:bytes.byteLength, cachedAt});
}

export function createMemoryPackageCache() {
  const entries = new Map();
  return Object.freeze({
    async put(entry) { const normalized=normalizeEntry(entry); entries.set(normalized.sourceUrl, normalized); return normalized; },
    async getByUrl(url) { const entry=entries.get(normalizeUrl(url)); return entry ? normalizeEntry(entry) : null; },
    async getByContentRoot(root) { const value=String(root); for(const entry of entries.values()) if(entry.contentRoot===value) return normalizeEntry(entry); return null; },
    async list() { return [...entries.values()].map(normalizeEntry).map(({bytes,...meta})=>Object.freeze(meta)); },
    async deleteByUrl(url) { return entries.delete(normalizeUrl(url)); },
    async deleteByContentRoot(root) { let removed=false; for(const [url,entry] of entries) if(entry.contentRoot===String(root)){entries.delete(url);removed=true;} return removed; },
    async clear() { entries.clear(); },
  });
}

function cacheHeaders(entry) {
  return new Headers({
    'Content-Type':'application/vnd.p2lrn.package+zip',
    'Content-Length':String(entry.size),
    'X-P2LRN-Cache-Version':PACKAGE_CACHE_VERSION,
    'X-P2LRN-Content-Root':entry.contentRoot,
    'X-P2LRN-Package-Id':encodeURIComponent(entry.packageId),
    'X-P2LRN-Cached-At':entry.cachedAt,
    'Cache-Control':'private, max-age=31536000, immutable',
    'X-Content-Type-Options':'nosniff',
  });
}

async function responseEntry(sourceUrl, response) {
  if (!response) return null;
  const contentRoot=response.headers.get('X-P2LRN-Content-Root') ?? '';
  const version=response.headers.get('X-P2LRN-Cache-Version') ?? '';
  if(version!==PACKAGE_CACHE_VERSION || !CONTENT_ROOT_RE.test(contentRoot)) return null;
  const packageId=decodeURIComponent(response.headers.get('X-P2LRN-Package-Id') ?? '');
  if(!packageId) return null;
  const bytes=await response.arrayBuffer();
  return normalizeEntry({sourceUrl,contentRoot,packageId,bytes,cachedAt:response.headers.get('X-P2LRN-Cached-At') ?? undefined});
}

export function createCacheStoragePackageCache({name=DEFAULT_PACKAGE_CACHE_NAME, cacheStorage=globalThis.caches}={}) {
  if (!cacheStorage || typeof cacheStorage.open !== 'function') throw new Error('Cache Storage is unavailable for P2LRN package caching.');
  const cachePromise=cacheStorage.open(String(name));
  return Object.freeze({
    async put(entry) {
      const normalized=normalizeEntry(entry);
      const cache=await cachePromise;
      await cache.put(new Request(normalized.sourceUrl,{method:'GET'}),new Response(normalized.bytes.slice(0),{status:200,headers:cacheHeaders(normalized)}));
      return normalized;
    },
    async getByUrl(url) { const sourceUrl=normalizeUrl(url),cache=await cachePromise; return responseEntry(sourceUrl,await cache.match(sourceUrl)); },
    async getByContentRoot(root) {
      const value=String(root); if(!CONTENT_ROOT_RE.test(value)) return null;
      const cache=await cachePromise;
      for(const request of await cache.keys()){ const response=await cache.match(request); if(response?.headers.get('X-P2LRN-Content-Root')===value) return responseEntry(request.url,response); }
      return null;
    },
    async list() {
      const cache=await cachePromise,out=[];
      for(const request of await cache.keys()){const response=await cache.match(request);const root=response?.headers.get('X-P2LRN-Content-Root');if(!CONTENT_ROOT_RE.test(root??''))continue;out.push(Object.freeze({sourceUrl:request.url,contentRoot:root,packageId:decodeURIComponent(response.headers.get('X-P2LRN-Package-Id')??''),size:Number(response.headers.get('Content-Length'))||null,cachedAt:response.headers.get('X-P2LRN-Cached-At')??null}));}
      return out;
    },
    async deleteByUrl(url) { const cache=await cachePromise; return cache.delete(normalizeUrl(url)); },
    async deleteByContentRoot(root) { const cache=await cachePromise; let removed=false; for(const request of await cache.keys()){const response=await cache.match(request);if(response?.headers.get('X-P2LRN-Content-Root')===String(root)){removed=(await cache.delete(request))||removed;}} return removed; },
    async clear() { const cache=await cachePromise; const keys=await cache.keys(); await Promise.all(keys.map((request)=>cache.delete(request))); },
  });
}

export function normalizePackageCache(value) {
  if (value == null) return null;
  for (const method of ['put','getByUrl','getByContentRoot','list','deleteByUrl','deleteByContentRoot']) if(typeof value?.[method]!=='function') throw new TypeError(`P2LRN package cache requires ${method}().`);
  return value;
}

function parseRange(value,size) {
  const text=String(value??'').trim(); if(!text)return null;
  const match=/^bytes=(\d*)-(\d*)$/.exec(text);
  if(!match || (!match[1]&&!match[2]) || size<=0)return {invalid:true};
  let start,end;
  if(!match[1]){const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)return{invalid:true};start=Math.max(0,size-suffix);end=size-1;}
  else {start=Number(match[1]);if(!Number.isSafeInteger(start)||start<0||start>=size)return{invalid:true};end=match[2]?Number(match[2]):size-1;if(!Number.isSafeInteger(end)||end<start)return{invalid:true};end=Math.min(end,size-1);}
  return {start,end};
}

function cachedResponse(entry, options={}) {
  const method=String(options.method??'GET').toUpperCase();
  const headersIn=new Headers(options.headers??{});
  const selected=parseRange(headersIn.get('Range'),entry.size);
  const headers=new Headers({'Content-Type':'application/vnd.p2lrn.package+zip','Accept-Ranges':'bytes','ETag':`"p2lrn-${entry.contentRoot.slice(7)}"`,'Cache-Control':'private, no-store'});
  if(selected?.invalid)return new Response(null,{status:416,headers:{...Object.fromEntries(headers),'Content-Range':`bytes */${entry.size}`}});
  if(selected){
    const bytes=entry.bytes.slice(selected.start,selected.end+1);
    headers.set('Content-Length',String(bytes.byteLength)); headers.set('Content-Range',`bytes ${selected.start}-${selected.end}/${entry.size}`);
    return new Response(method==='HEAD'?null:bytes,{status:206,headers});
  }
  headers.set('Content-Length',String(entry.size));
  return new Response(method==='HEAD'?null:entry.bytes.slice(0),{status:200,headers});
}

export function createPackageCacheFetch({store, networkFetch=globalThis.fetch, networkFirst=true}={}) {
  const cache=normalizePackageCache(store);
  if(!cache)throw new TypeError('P2LRN package cache store is required.');
  const onlineFetch=typeof networkFetch==='function' ? (networkFetch===globalThis.fetch?networkFetch.bind(globalThis):networkFetch) : null;
  return async (url,options={})=>{
    const sourceUrl=normalizeUrl(url);
    if(networkFirst && onlineFetch){
      try{const response=await onlineFetch(sourceUrl,options);if(response?.ok||response?.status===206)return response;}catch{}
    }
    const cached=await cache.getByUrl(sourceUrl);
    if(cached)return cachedResponse(cached,options);
    if(!networkFirst && onlineFetch)return onlineFetch(sourceUrl,options);
    throw new TypeError(`P2LRN package is unavailable from network and cache: ${sourceUrl}`);
  };
}
