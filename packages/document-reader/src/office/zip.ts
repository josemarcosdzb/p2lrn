import JSZip from 'jszip';

export interface ZipReadLimits {
  maxFiles?:number;
  maxEntryBytes?:number;
  maxUncompressedBytes?:number;
  maxCompressionRatio?:number;
  maxNameBytes?:number;
  maxPathDepth?:number;
}
const DEFAULTS:Required<ZipReadLimits>={
  maxFiles:5000,
  maxEntryBytes:512*1024*1024,
  maxUncompressedBytes:2*1024*1024*1024,
  maxCompressionRatio:250,
  maxNameBytes:2048,
  maxPathDepth:32,
};

type JSZipEntry=JSZip.JSZipObject & {_data?:{uncompressedSize?:number;compressedSize?:number}};

function safeName(name:string,limits:Required<ZipReadLimits>):string{
  if(!name||Buffer.byteLength(name,'utf8')>limits.maxNameBytes)throw new Error('ZIP contains an invalid internal path.');
  const normalized=name.normalize('NFC').replace(/\\/g,'/');
  const parts=normalized.split('/').filter(Boolean);
  if(name.includes('\0')||name.includes('\\')||normalized.startsWith('/')||/^[A-Za-z]:\//.test(normalized)||parts.some(p=>p==='.'||p==='..')||parts.length>limits.maxPathDepth)throw new Error(`ZIP contains a forbidden internal path: ${name}`);
  return normalized.replace(/^\.\//,'').replace(/\/{2,}/g,'/');
}
function declared(entry:JSZipEntry,key:'uncompressedSize'|'compressedSize'):number{
  const value=Number(entry._data?.[key]??0);return Number.isSafeInteger(value)&&value>=0?value:0;
}
function ratioOk(name:string,compressed:number,uncompressed:number,limit:number):void{
  if(compressed>0&&uncompressed/compressed>limit)throw new Error(`ZIP entry exceeds compression-ratio limit: ${name}`);
}

export async function readZipEntries(bytes:Uint8Array,options:ZipReadLimits={}):Promise<Map<string,Uint8Array>>{
  const limits={...DEFAULTS,...options};
  let zip:JSZip;
  try{zip=await JSZip.loadAsync(bytes,{checkCRC32:false});}catch{throw new Error('ZIP cannot be opened or is damaged.');}
  const entries=(Object.values(zip.files) as JSZipEntry[]).filter(e=>!e.dir&&!e.name.includes('__MACOSX/'));
  if(entries.length>limits.maxFiles)throw new Error(`ZIP exceeds file-count limit: ${limits.maxFiles}`);
  const names=new Set<string>();let declaredTotal=0;
  for(const entry of entries){
    const name=safeName(entry.name,limits),key=name.toLocaleLowerCase('en-US');
    if(names.has(key))throw new Error(`ZIP contains a duplicate internal path: ${name}`);names.add(key);
    const raw=declared(entry,'uncompressedSize'),compressed=declared(entry,'compressedSize');
    if(raw>limits.maxEntryBytes)throw new Error(`ZIP entry exceeds size limit: ${name}`);
    ratioOk(name,compressed,raw,limits.maxCompressionRatio);
    declaredTotal+=raw;if(declaredTotal>limits.maxUncompressedBytes)throw new Error('ZIP exceeds uncompressed-size limit.');
  }
  const result=new Map<string,Uint8Array>();let total=0;
  for(const entry of entries){
    const name=safeName(entry.name,limits),compressed=declared(entry,'compressedSize');
    const data=await entry.async('uint8array');
    if(data.byteLength>limits.maxEntryBytes)throw new Error(`ZIP entry exceeds size limit after extraction: ${name}`);
    ratioOk(name,compressed,data.byteLength,limits.maxCompressionRatio);
    total+=data.byteLength;if(total>limits.maxUncompressedBytes)throw new Error('ZIP exceeds uncompressed-size limit after extraction.');
    result.set(name,data);
  }
  return result;
}

export function bytesText(entries:Map<string,Uint8Array>,path:string):string{
  const bytes=entries.get(path);return bytes?new TextDecoder('utf-8',{fatal:false}).decode(bytes):'';
}
