// @ts-nocheck
import {readFileSync,statSync} from 'node:fs';
import {extname} from 'node:path';
import {P2LRNReader,CapabilitySet} from './index.js';
import {safeLogicalPath,validateWebContentMapping,WEB_CONTENT_PROFILE} from '../core/web-content.js';
import {ReadError} from '../core/errors.js';

const td=new TextDecoder('utf-8',{fatal:true});
const CAPABILITIES_URL=new URL('../../config/capabilities.json',import.meta.url);
const COMPONENT_CAPABILITIES_URL=new URL('../../config/component-capabilities.json',import.meta.url);
const MIME:Record<string,string>={'.html':'text/html; charset=utf-8','.htm':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.xml':'application/xml','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.mp3':'audio/mpeg','.mp4':'video/mp4','.webm':'video/webm','.pdf':'application/pdf','.zip':'application/zip','.wasm':'application/wasm'};
function readJson(url:URL):any{return JSON.parse(td.decode(readFileSync(url)));}
export function guessReaderMediaType(path:string):string{return MIME[extname(path.split(/[?#]/,1)[0]??'').toLowerCase()]??'application/octet-stream';}
export function b64u(value:string):string{return Buffer.from(value,'utf8').toString('base64url');}
export function b64uDecode(value:string):string{try{return Buffer.from(value,'base64url').toString('utf8');}catch{throw new ReaderSystemError('invalid encoded path');}}
export class ReaderSystemError extends Error{constructor(message:string){super(message);this.name='ReaderSystemError';}}
export interface ViewTarget {status:string;entityId:string;resourceId?:string;representationId?:string;kind?:string;url?:string;mediaType?:string;runtime?:string;reason?:string;metadata:Record<string,unknown>;}

export class P2LRNReadingSystem{
  readonly reader:P2LRNReader; readonly packagePath:string; readonly capabilityDocument:any; readonly capabilities:CapabilitySet; readonly componentCapabilityDocument:any;
  readonly componentCapabilities=new Map<string,any>(); readonly manifestFiles=new Map<string,any>(); private validatedIdentity:{size:number;mtimeMs:number};
  constructor(packagePath:string,options:{validateProfilePayloads?:boolean}={}){
    this.packagePath=packagePath;
    try{this.reader=new P2LRNReader(packagePath,{strictProfiles:true,validateProfilePayloads:options.validateProfilePayloads!==false});}catch(e){throw new ReaderSystemError(e instanceof Error?e.message:String(e));}
    this.capabilityDocument=readJson(CAPABILITIES_URL);this.capabilities=CapabilitySet.fromDocument(this.capabilityDocument);
    this.componentCapabilityDocument=readJson(COMPONENT_CAPABILITIES_URL);
    for(const item of this.componentCapabilityDocument.components??[])if(item?.id&&item?.componentVersion)this.componentCapabilities.set(`${item.id}\0${item.componentVersion}`,item);
    for(const f of this.reader.package.manifest.files??[])this.manifestFiles.set(f.path,f);
    const s=statSync(packagePath);this.validatedIdentity={size:s.size,mtimeMs:s.mtimeMs};
  }
  summary():any{return{...this.reader.summary(this.packagePath),reader:{...this.capabilityDocument.product,roles:this.capabilityDocument.roles,nativeDelivery:['web-content','browser-media','native-questionnaire','native-composite','native-component'],componentImplementations:[...(this.componentCapabilityDocument.components??[])],specializedRuntimes:'plugin-required',networkOnOpen:false}};}
  tree():any{return this.reader.tree();}
  entity(id:string):any{try{return this.reader.entity(id);}catch(e){throw new ReaderSystemError(e instanceof Error?e.message:String(e));}}
  readPlan():any{return this.reader.courseReadPlan(this.capabilities,undefined,'read');}
  importPlan():any{return this.reader.importPlan(this.capabilities);}
  private entityResource(entityId:string):[string,any]{const e=this.entity(entityId);if(e.type==='resource')return[entityId,e];if(e.type==='activity'&&e.resource)return[e.resource,this.entity(e.resource)];throw new ReaderSystemError('entity has no directly viewable resource');}
  viewTarget(entityId:string,token:string):ViewTarget{
    let resourceId:string,resource:any;try{[resourceId,resource]=this.entityResource(entityId);}catch(e){return{status:'not-viewable',entityId,reason:e instanceof Error?e.message:String(e),metadata:{}};}
    const rep=this.reader.chooseRepresentation(resourceId,this.capabilities,'deliver');
    if(!rep){const preserve=this.reader.chooseRepresentation(resourceId,this.capabilities,'preserve');return{status:'runtime-required',entityId,resourceId,reason:'No installed runtime can deliver this representation.'+(preserve?' The original representation can still be preserved and inspected.':''),metadata:{availableProfiles:(resource.representations??[]).map((r:any)=>r.profile),preservable:Boolean(preserve)}};}
    const plan:any=this.reader.representationPlan(rep),kind=String(plan.kind),mediaType=String(plan.mediaType??rep.mediaType??'application/octet-stream');
    if(['native-questionnaire','native-composite','native-component'].includes(kind)){
      let payload:any;try{payload=JSON.parse(td.decode(this.reader.readEmbeddedFile(plan.path,8*1024*1024)));}catch(e){return{status:'not-viewable',entityId,resourceId,representationId:rep.id,kind,mediaType,runtime:plan.runtime,reason:`Native P2LRN payload cannot be opened: ${e instanceof Error?e.message:String(e)}`,metadata:{}};}
      if(kind==='native-component'){
        const c=payload?.component;if(!c||typeof c!=='object'||Array.isArray(c))return{status:'not-viewable',entityId,resourceId,representationId:rep.id,kind,mediaType,runtime:plan.runtime,reason:'Native component payload has no component descriptor.',metadata:{}};
        const installed=this.componentCapabilities.get(`${c.id}\0${c.componentVersion}`),meta={componentId:c.id,componentVersion:c.componentVersion,runtimeContractVersion:c.runtimeContractVersion,dataVersion:c.dataVersion,preservable:true};
        if(!installed)return{status:'runtime-required',entityId,resourceId,representationId:rep.id,kind,mediaType,runtime:plan.runtime,reason:`Native component implementation is not installed: ${c.id} @ ${c.componentVersion}.`,metadata:meta};
        if(c.runtimeContractVersion!==installed.runtimeContractVersion)return{status:'runtime-required',entityId,resourceId,representationId:rep.id,kind,mediaType,runtime:plan.runtime,reason:`Native component runtime contract ${c.runtimeContractVersion} is not supported; installed implementation requires ${installed.runtimeContractVersion}.`,metadata:meta};
        if(!(installed.inputDataVersions??[]).includes(c.dataVersion))return{status:'runtime-required',entityId,resourceId,representationId:rep.id,kind,mediaType,runtime:plan.runtime,reason:`Native component data version is not supported: ${c.dataVersion}.`,metadata:meta};
      }
    }
    if(['embedded-file','native-questionnaire','native-composite','native-component'].includes(kind))return{status:'ready',entityId,resourceId,representationId:rep.id,kind,url:`/content/outer/${b64u(plan.path)}?t=${encodeURIComponent(token)}`,mediaType,runtime:plan.runtime,metadata:plan.metadata??{}};
    if(kind==='package-member'&&(plan.runtime==='passive'||plan.runtime==null))return{status:'ready',entityId,resourceId,representationId:rep.id,kind,url:`/content/package/${b64u(plan.packagePath)}/${String(plan.member).split('/').map(encodeURIComponent).join('/')}?t=${encodeURIComponent(token)}`,mediaType,runtime:plan.runtime,metadata:plan.metadata??{}};
    if(kind==='remote')return{status:'external',entityId,resourceId,representationId:rep.id,kind,mediaType,runtime:plan.runtime,reason:'Remote content is never fetched automatically by the reader.',metadata:{href:plan.href}};
    return{status:'runtime-required',entityId,resourceId,representationId:rep.id,kind,mediaType,runtime:plan.runtime,reason:`This content requires the ${plan.runtime??'profile'} runtime plugin.`,metadata:plan.metadata??{}};
  }
  assertPackageUnchanged():void{const s=statSync(this.packagePath);if(s.size!==this.validatedIdentity.size||s.mtimeMs!==this.validatedIdentity.mtimeMs)throw new ReaderSystemError('package changed on disk after validation; reopen the Reading System');}
  resolveWebAsset(representationId:string,logicalPath:string):string{this.assertPackageUnchanged();const found=this.reader.representations.get(representationId);if(!found)throw new ReaderSystemError(`unknown representation: ${representationId}`);const rep:any=found.representation;if(!isWebContentProfile(rep.profile))throw new ReaderSystemError('representation is not passive web-content');let mapping:any;try{mapping=validateWebContentMapping(rep,new Set(this.manifestFiles.keys()));}catch(e){throw new ReaderSystemError(e instanceof Error?e.message:String(e));}if(!mapping)throw new ReaderSystemError('web-content representation has no relative-asset mapping');const logical=safeLogicalPath(logicalPath),embedded=mapping.assets[logical];if(!embedded)throw new ReaderSystemError(`web-content logical asset is not mapped: ${logical}`);return embedded;}
  virtualOuterInfo(path:string):any{this.assertPackageUnchanged();const d=this.manifestFiles.get(path);if(!d)throw new ReaderSystemError(`embedded path is not inventoried: ${path}`);const e=this.reader.package.archive.entries.get(path);if(!e)throw new ReaderSystemError(`embedded file not found: ${path}`);const bytes=this.reader.package.archive.bytes,v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),o=e.localOffset;if(o+30>bytes.byteLength||v.getUint32(o,true)!==0x04034b50)throw new ReaderSystemError(`invalid local ZIP header for virtual resource: ${path}`);const flags=v.getUint16(o+6,true),method=v.getUint16(o+8,true),nl=v.getUint16(o+26,true),el=v.getUint16(o+28,true);if(flags&1)throw new ReaderSystemError(`encrypted ZIP member cannot be exposed as a virtual resource: ${path}`);if(method!==e.method)throw new ReaderSystemError(`ZIP compression method mismatch for virtual resource: ${path}`);const local=td.decode(bytes.slice(o+30,o+30+nl));if(local!==path)throw new ReaderSystemError(`local/central ZIP filename mismatch for virtual resource: ${path}`);if(e.uncompressedSize!==d.size)throw new ReaderSystemError(`ZIP/manifest size mismatch for virtual resource: ${path}`);return{path,mediaType:d.mediaType??guessReaderMediaType(path),size:d.size,byteDigest:d.byteDigest,contentDigest:d.contentDigest,compressType:e.method,compressedSize:e.compressedSize,dataOffset:o+30+nl+el,seekable:e.method===0};}
  readOuter(path:string,maxBytes=64*1024*1024):[Uint8Array,string]{this.assertPackageUnchanged();const data=this.reader.readEmbeddedFile(path,maxBytes),media=this.manifestFiles.get(path)?.mediaType??guessReaderMediaType(path);return[data,media];}
  readPackageMember(packagePath:string,member:string,maxBytes=64*1024*1024):[Uint8Array,string]{const data=this.reader.readPackageMember(packagePath,member,maxBytes);return[data,guessReaderMediaType(member)];}
}
