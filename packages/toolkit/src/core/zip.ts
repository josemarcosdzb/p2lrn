import {deflateRawSync, inflateRawSync} from 'node:zlib';
import {ValidationError} from './errors.js';
import {baseMediaType} from './integrity.js';
import {constants as fsConstants} from 'node:fs';
import {lstat,mkdir,mkdtemp,open as openFile,readFile,realpath,rename,rm} from 'node:fs/promises';
import {basename,dirname,join,resolve,sep} from 'node:path';

// Deflated ZIP members are expanded synchronously: never let attacker-controlled
// headers allocate multi-gigabyte buffers. Large media should be STORED or multipart.
const MAX_IN_MEMORY_DEFLATE_BYTES=512*1024*1024;
const SIG = Object.freeze({LOCAL:0x04034b50, CENTRAL:0x02014b50, EOCD:0x06054b50, ZIP64_EOCD:0x06064b50, ZIP64_LOCATOR:0x07064b50});
const decoder = new TextDecoder('utf-8', {fatal:true});
const encoder = new TextEncoder();
export interface ZipLimits { entries:number; entryBytes:number; totalUncompressedBytes:number; centralDirectoryBytes:number; compressionRatio:number; }
export const DEFAULT_ZIP_LIMITS: ZipLimits = Object.freeze({entries:5000, entryBytes:16*1024*1024*1024, totalUncompressedBytes:128*1024*1024*1024, centralDirectoryBytes:64*1024*1024, compressionRatio:250});
export interface ZipEntry {name:string; flags:number; method:number; crc:number; compressedSize:number; uncompressedSize:number; localOffset:number; externalAttributes:number;}

function u16(v:DataView,o:number):number{return v.getUint16(o,true);} function u32(v:DataView,o:number):number{return v.getUint32(o,true);}
function u64(v:DataView,o:number):number{const lo=BigInt(v.getUint32(o,true)), hi=BigInt(v.getUint32(o+4,true)); const n=(hi<<32n)|lo; if(n>BigInt(Number.MAX_SAFE_INTEGER)) throw new ValidationError('ZIP64 value exceeds JavaScript safe integer range'); return Number(n);}
function put16(v:DataView,o:number,n:number){v.setUint16(o,n,true);} function put32(v:DataView,o:number,n:number){v.setUint32(o,n>>>0,true);}
function put64(v:DataView,o:number,n:number){const b=BigInt(n); v.setUint32(o,Number(b&0xffffffffn),true); v.setUint32(o+4,Number((b>>32n)&0xffffffffn),true);}
function concat(parts:Uint8Array[]):Uint8Array{const size=parts.reduce((n,p)=>n+p.byteLength,0); const out=new Uint8Array(size); let o=0; for(const p of parts){out.set(p,o);o+=p.byteLength;} return out;}

export export function safeZipPath(name:string):string{
  if(!name || name.includes('\0') || name.includes('\\') || name.startsWith('/')) throw new ValidationError(`unsafe ZIP path: ${JSON.stringify(name)}`);
  const parts=name.split('/');
  if(parts.length>32 || parts.some((p)=>!p||p==='.'||p==='..')) throw new ValidationError(`unsafe ZIP path component: ${JSON.stringify(name)}`);
  if(/^[A-Za-z]:/.test(parts[0]??'')) throw new ValidationError(`Windows drive path not allowed: ${JSON.stringify(name)}`);
  return name;
}
let crcTable:Uint32Array|undefined;
function table():Uint32Array{if(crcTable)return crcTable; const t=new Uint32Array(256); for(let n=0;n<256;n++){let c=n; for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1); t[n]=c>>>0;} crcTable=t; return t;}
export function crc32(bytes:Uint8Array):number{let c=0xffffffff; const t=table(); for(const b of bytes)c=t[(c^b)&0xff]!^(c>>>8); return (c^0xffffffff)>>>0;}

function findEocd(bytes:Uint8Array):number{if(bytes.byteLength<22)throw new ValidationError('ZIP end-of-central-directory not found'); const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength); for(let o=bytes.byteLength-22;o>=Math.max(0,bytes.byteLength-65633);o--){if(u32(v,o)!==SIG.EOCD)continue; const len=u16(v,o+20); if(o+22+len===bytes.byteLength)return o;} throw new ValidationError('ZIP end-of-central-directory not found');}
function parseZip64Extra(extra:Uint8Array, need:{uncompressed:boolean;compressed:boolean;localOffset:boolean;disk:boolean}):Partial<ZipEntry>&{diskStart?:number}{const v=new DataView(extra.buffer,extra.byteOffset,extra.byteLength); let o=0; while(o+4<=extra.byteLength){const id=u16(v,o), size=u16(v,o+2), end=o+4+size; if(end>extra.byteLength)throw new ValidationError('truncated ZIP extra field'); if(id===1){let c=o+4; const out:any={}; const r64=()=>{if(c+8>end)throw new ValidationError('truncated ZIP64 extra field'); const n=u64(v,c); c+=8; return n;}; if(need.uncompressed)out.uncompressedSize=r64(); if(need.compressed)out.compressedSize=r64(); if(need.localOffset)out.localOffset=r64(); if(need.disk){if(c+4>end)throw new ValidationError('truncated ZIP64 disk field');out.diskStart=u32(v,c);} return out;} o=end;} throw new ValidationError('ZIP64 extended information extra field is missing');}

export class ZipArchive {
  readonly entries=new Map<string,ZipEntry>(); readonly zip64:boolean; readonly bytes:Uint8Array;
  private constructor(bytes:Uint8Array,zip64:boolean){this.bytes=bytes;this.zip64=zip64;}
  static open(input:Uint8Array, limits:ZipLimits=DEFAULT_ZIP_LIMITS):ZipArchive{
    const bytes=input.byteOffset===0&&input.byteLength===input.buffer.byteLength?input:new Uint8Array(input);
    const e=findEocd(bytes), v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength); const disk=u16(v,e+4), cdDisk=u16(v,e+6); if(disk!==0||cdDisk!==0)throw new ValidationError('multi-disk ZIP is not supported');
    let entries=u16(v,e+10), cdSize=u32(v,e+12), cdOffset=u32(v,e+16), is64=false;
    if(entries===0xffff||cdSize===0xffffffff||cdOffset===0xffffffff){is64=true; const loc=e-20; if(loc<0||u32(v,loc)!==SIG.ZIP64_LOCATOR)throw new ValidationError('ZIP64 locator is missing'); const zoff=u64(v,loc+8); if(zoff+56>bytes.byteLength||u32(v,zoff)!==SIG.ZIP64_EOCD)throw new ValidationError('ZIP64 EOCD is invalid'); const zdisk=u32(v,zoff+16), zcd=u32(v,zoff+20); if(zdisk||zcd)throw new ValidationError('multi-disk ZIP64 is not supported'); entries=u64(v,zoff+32); cdSize=u64(v,zoff+40); cdOffset=u64(v,zoff+48);}
    if(entries>limits.entries)throw new ValidationError(`ZIP has more than ${limits.entries} entries`); if(cdSize>limits.centralDirectoryBytes)throw new ValidationError('ZIP central directory exceeds safety limit'); if(cdOffset+cdSize>bytes.byteLength)throw new ValidationError('invalid ZIP central directory bounds');
    const archive=new ZipArchive(bytes,is64); let o=cdOffset,total=0; for(let i=0;i<entries;i++){
      if(o+46>cdOffset+cdSize||u32(v,o)!==SIG.CENTRAL)throw new ValidationError('invalid ZIP central directory entry'); const flags=u16(v,o+8),method=u16(v,o+10),crc=u32(v,o+16); let cs=u32(v,o+20),us=u32(v,o+24); const nl=u16(v,o+28),el=u16(v,o+30),cl=u16(v,o+32); let diskStart=u16(v,o+34),lo=u32(v,o+42); const external=u32(v,o+38); const end=o+46+nl+el+cl; if(end>cdOffset+cdSize)throw new ValidationError('truncated ZIP central directory entry');
      if(flags&1)throw new ValidationError('encrypted ZIP entries are not allowed'); if(method!==0&&method!==8)throw new ValidationError(`unsupported ZIP compression method ${method}`); let name:string; try{name=decoder.decode(bytes.slice(o+46,o+46+nl));}catch{throw new ValidationError('ZIP entry name is not valid UTF-8');}
      const extra=bytes.slice(o+46+nl,o+46+nl+el); const need={uncompressed:us===0xffffffff,compressed:cs===0xffffffff,localOffset:lo===0xffffffff,disk:diskStart===0xffff}; if(Object.values(need).some(Boolean)){const z=parseZip64Extra(extra,need); if(need.uncompressed)us=z.uncompressedSize!; if(need.compressed)cs=z.compressedSize!; if(need.localOffset)lo=z.localOffset!; if(need.disk)diskStart=z.diskStart!;}
      if(diskStart!==0)throw new ValidationError('multi-disk ZIP entry is not supported'); const directory=name.endsWith('/'); const normalized=directory?name.slice(0,-1):name; if(normalized)safeZipPath(normalized); if(!directory){if(archive.entries.has(name))throw new ValidationError(`duplicate ZIP entry: ${name}`); if(us>limits.entryBytes)throw new ValidationError(`ZIP entry exceeds read limit: ${name}`); if(cs>0&&us/cs>limits.compressionRatio)throw new ValidationError(`ZIP compression ratio exceeds ${limits.compressionRatio}: ${name}`); total+=us; if(total>limits.totalUncompressedBytes)throw new ValidationError('ZIP total uncompressed size exceeds safety limit'); const mode=(external>>>16)&0xffff; if((mode&0xf000)===0xa000)throw new ValidationError(`symbolic links are not allowed: ${name}`); archive.entries.set(name,{name,flags,method,crc,compressedSize:cs,uncompressedSize:us,localOffset:lo,externalAttributes:external});} o=end;
    }
    if(o!==cdOffset+cdSize)throw new ValidationError('ZIP central directory size mismatch'); return archive;
  }
  names():string[]{return [...this.entries.keys()];}
  read(name:string):Uint8Array{const e=this.entries.get(name); if(!e)throw new ValidationError(`ZIP entry not found: ${name}`); const v=new DataView(this.bytes.buffer,this.bytes.byteOffset,this.bytes.byteLength),o=e.localOffset; if(o+30>this.bytes.byteLength||u32(v,o)!==SIG.LOCAL)throw new ValidationError(`invalid local ZIP header: ${name}`); const flags=u16(v,o+6),method=u16(v,o+8),nl=u16(v,o+26),el=u16(v,o+28); if(flags&1)throw new ValidationError(`encrypted local ZIP entry: ${name}`); if(method!==e.method)throw new ValidationError(`ZIP compression method mismatch: ${name}`); let local:string; try{local=decoder.decode(this.bytes.slice(o+30,o+30+nl));}catch{throw new ValidationError(`invalid local ZIP name: ${name}`);} if(local!==name)throw new ValidationError(`local/central ZIP name mismatch: ${name}`); const ds=o+30+nl+el,de=ds+e.compressedSize; if(de>this.bytes.byteLength)throw new ValidationError(`truncated ZIP payload: ${name}`); const compressed=this.bytes.slice(ds,de);
    if(e.method===8&&e.uncompressedSize>MAX_IN_MEMORY_DEFLATE_BYTES)
      throw new ValidationError(`ZIP DEFLATE entry exceeds in-memory safety limit: ${name}`);
    let result:Uint8Array;
    if(e.method===0)result=compressed;
    else{
      try{
        // Node >=22 supports maxOutputLength; the project's @types/node 22.10
        // exposes a narrower inflateRawSync overload. Keep the runtime bound.
        const boundedInflate=inflateRawSync as unknown as (bytes:Uint8Array,options:{maxOutputLength:number})=>Buffer;
        result=boundedInflate(compressed,{maxOutputLength:Math.max(1,e.uncompressedSize)});
      }
      catch{throw new ValidationError(`ZIP decompression exceeded declared size or is malformed: ${name}`);}
    }
    if(result.byteLength!==e.uncompressedSize)throw new ValidationError(`ZIP size mismatch after decompression: ${name}`); if(crc32(result)!==e.crc)throw new ValidationError(`ZIP CRC mismatch: ${name}`); return new Uint8Array(result);}
}

const STORED=new Set(['application/pdf','application/zip','application/gzip','application/x-gzip','application/x-7z-compressed','application/x-rar-compressed','application/vnd.rar','application/wasm']);
export function prefersStored(mediaType:string|undefined):boolean{const m=baseMediaType(mediaType); return m.startsWith('audio/')||m.startsWith('video/')||(m.startsWith('image/')&&!['image/svg+xml','image/x-icon'].includes(m))||STORED.has(m)||m.endsWith('+zip');}
export interface ZipWriteEntry {path:string; data:Uint8Array; mediaType?:string; method?:0|8;}
export function writeZip(entries:ZipWriteEntry[], options:{forceZip64?:boolean}={}):Uint8Array{
  const seen=new Set<string>(); const localParts:Uint8Array[]=[]; const centralParts:Uint8Array[]=[]; let offset=0; const force64=Boolean(options.forceZip64); for(const item of entries){const path=safeZipPath(item.path); if(seen.has(path))throw new ValidationError(`duplicate ZIP entry: ${path}`);seen.add(path); const name=encoder.encode(path), method=item.method??(prefersStored(item.mediaType)?0:8), raw=item.data, compressed=method===0?raw:new Uint8Array(deflateRawSync(raw,{level:9})), crc=crc32(raw); const use64=force64||raw.byteLength>=0xffffffff||compressed.byteLength>=0xffffffff||offset>=0xffffffff; let lextra=new Uint8Array(0); if(use64){lextra=new Uint8Array(20); const ev=new DataView(lextra.buffer);put16(ev,0,1);put16(ev,2,16);put64(ev,4,raw.byteLength);put64(ev,12,compressed.byteLength);} const lh=new Uint8Array(30+name.byteLength+lextra.byteLength); const lv=new DataView(lh.buffer);put32(lv,0,SIG.LOCAL);put16(lv,4,use64?45:20);put16(lv,6,0x0800);put16(lv,8,method);put16(lv,10,0);put16(lv,12,0x21);put32(lv,14,crc);put32(lv,18,use64?0xffffffff:compressed.byteLength);put32(lv,22,use64?0xffffffff:raw.byteLength);put16(lv,26,name.byteLength);put16(lv,28,lextra.byteLength);lh.set(name,30);lh.set(lextra,30+name.byteLength); localParts.push(lh,compressed);
    let cextra=new Uint8Array(0); if(use64){cextra=new Uint8Array(28);const ev=new DataView(cextra.buffer);put16(ev,0,1);put16(ev,2,24);put64(ev,4,raw.byteLength);put64(ev,12,compressed.byteLength);put64(ev,20,offset);} const ch=new Uint8Array(46+name.byteLength+cextra.byteLength);const cv=new DataView(ch.buffer);put32(cv,0,SIG.CENTRAL);put16(cv,4,use64?45:20);put16(cv,6,use64?45:20);put16(cv,8,0x0800);put16(cv,10,method);put16(cv,12,0);put16(cv,14,0x21);put32(cv,16,crc);put32(cv,20,use64?0xffffffff:compressed.byteLength);put32(cv,24,use64?0xffffffff:raw.byteLength);put16(cv,28,name.byteLength);put16(cv,30,cextra.byteLength);put16(cv,32,0);put16(cv,34,0);put16(cv,36,0);put32(cv,38,0o100644<<16);put32(cv,42,use64?0xffffffff:offset);ch.set(name,46);ch.set(cextra,46+name.byteLength);centralParts.push(ch); offset+=lh.byteLength+compressed.byteLength;
  }
  const central=concat(centralParts), locals=concat(localParts), cdOffset=locals.byteLength, needs64=force64||entries.length>=0xffff||cdOffset>=0xffffffff||central.byteLength>=0xffffffff; const tails:Uint8Array[]=[]; if(needs64){const z=new Uint8Array(56),zv=new DataView(z.buffer);put32(zv,0,SIG.ZIP64_EOCD);put64(zv,4,44);put16(zv,12,45);put16(zv,14,45);put32(zv,16,0);put32(zv,20,0);put64(zv,24,entries.length);put64(zv,32,entries.length);put64(zv,40,central.byteLength);put64(zv,48,cdOffset); const loc=new Uint8Array(20),lv=new DataView(loc.buffer);put32(lv,0,SIG.ZIP64_LOCATOR);put32(lv,4,0);put64(lv,8,cdOffset+central.byteLength);put32(lv,16,1);tails.push(z,loc);} const e=new Uint8Array(22),ev=new DataView(e.buffer);put32(ev,0,SIG.EOCD);put16(ev,4,0);put16(ev,6,0);put16(ev,8,needs64?0xffff:entries.length);put16(ev,10,needs64?0xffff:entries.length);put32(ev,12,needs64?0xffffffff:central.byteLength);put32(ev,16,needs64?0xffffffff:cdOffset);put16(ev,20,0);tails.push(e); return concat([locals,central,...tails]);
}


/**
 * Extract a ZIP-backed .p2lrn into a NEW, private directory. This is the
 * supported disk-extraction boundary; callers never join untrusted ZIP paths
 * themselves. Does not overwrite an existing output directory.
 *
 * The parent directory must be controlled by the host. A hostile process with
 * write privileges to that parent can race a final rename on some filesystems.
 */
export const SAFE_UNPACK_LIMITS:ZipLimits=Object.freeze({
  entries:2000,
  entryBytes:64*1024*1024,
  totalUncompressedBytes:256*1024*1024,
  centralDirectoryBytes:16*1024*1024,
  compressionRatio:100,
});
const MAX_SAFE_ARCHIVE_BYTES=128*1024*1024;
function safeDiskComponent(part:string):void{
  // Portable disk extraction: Windows rejects ADS, devices and ambiguous
  // trailing spaces/dots even when a ZIP reader accepts the logical name.
  if(!part||/[<>:"|?*\x00-\x1f]/.test(part)||/[. ]$/.test(part)||
     /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i.test(part))
    throw new ValidationError('unsafe ZIP filesystem component: '+JSON.stringify(part));
}
async function requireMissing(path:string):Promise<void>{
  try{
    await lstat(path);
    throw new ValidationError('refusing to replace existing extraction target: '+path);
  }catch(error){
    if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
  }
}
async function safeStageDirectory(root:string,components:string[]):Promise<string>{
  let current=root;
  for(const part of components){
    current=join(current,part);
    try{await mkdir(current,{mode:0o700});}
    catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
    const info=await lstat(current);
    if(info.isSymbolicLink()||!info.isDirectory())
      throw new ValidationError('unsafe extraction directory: '+current);
    const actual=await realpath(current);
    if(actual!==root&&!actual.startsWith(root+sep))
      throw new ValidationError('directory escaped extraction root: '+current);
  }
  return current;
}
export async function unpackP2LRNArchive(
  archivePath:string,
  outputDirectory:string,
  options:{limits?:ZipLimits;maxArchiveBytes?:number}={}
):Promise<{directory:string;files:number;totalBytes:number}>{
  const input=resolve(archivePath),target=resolve(outputDirectory);
  const maximum=options.maxArchiveBytes??MAX_SAFE_ARCHIVE_BYTES;
  if(!Number.isSafeInteger(maximum)||maximum<22||maximum>MAX_SAFE_ARCHIVE_BYTES)
    throw new ValidationError('invalid maximum archive size');
  const source=await lstat(input);
  if(!source.isFile()||source.isSymbolicLink()||source.size>maximum)
    throw new ValidationError('unsafe ZIP input file or archive exceeds safety limit');
  const archive=ZipArchive.open(new Uint8Array(await readFile(input)),options.limits??SAFE_UNPACK_LIMITS);
  const parent=await realpath(dirname(target));
  if(target===parent||basename(target)==='.'||basename(target)==='..')
    throw new ValidationError('invalid extraction destination');
  await requireMissing(target);
  const staging=await mkdtemp(join(parent,'.p2lrn-unpack-'));
  let count=0,totalBytes=0;
  try{
    const base=await realpath(staging);
    for(const entry of archive.entries.values()){
      safeZipPath(entry.name);
      const segments=entry.name.split('/');
      for(const part of segments)safeDiskComponent(part);
      const unixType=(entry.externalAttributes>>>16)&0o170000;
      if(unixType!==0&&unixType!==0o100000)
        throw new ValidationError('non-regular ZIP entry is forbidden: '+entry.name);
      const directory=await safeStageDirectory(base,segments.slice(0,-1));
      const filename=join(directory,segments.at(-1)!);
      // O_NOFOLLOW blocks a final-component symlink on supported platforms;
      // O_EXCL prevents clobbering existing files and duplicate aliases.
      const flags=fsConstants.O_WRONLY|fsConstants.O_CREAT|fsConstants.O_EXCL|
        (fsConstants.O_NOFOLLOW??0);
      const handle=await openFile(filename,flags,0o600);
      try{
        const content=archive.read(entry.name); // CRC, size and DEFLATE bound
        await handle.writeFile(content);
        totalBytes+=content.byteLength;
      }finally{await handle.close();}
      count+=1;
    }
    await requireMissing(target);
    await rename(staging,target);
    return {directory:target,files:count,totalBytes};
  }catch(error){
    await rm(staging,{recursive:true,force:true});
    throw error;
  }
}
