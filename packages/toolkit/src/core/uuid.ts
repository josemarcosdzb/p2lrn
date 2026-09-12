import {createHash, randomUUID} from 'node:crypto';

export const URL_NAMESPACE='6ba7b811-9dad-11d1-80b4-00c04fd430c8';
function hexBytes(hex:string):Uint8Array{const clean=hex.replace(/-/g,'');if(!/^[0-9a-fA-F]{32}$/.test(clean))throw new Error(`invalid UUID: ${hex}`);const out=new Uint8Array(16);for(let i=0;i<16;i++)out[i]=parseInt(clean.slice(i*2,i*2+2),16);return out;}
function bytesUuid(bytes:Uint8Array):string{const h=[...bytes].map((b)=>b.toString(16).padStart(2,'0')).join('');return`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
function digestBytes(hex:string):Uint8Array{const out=new Uint8Array(hex.length/2);for(let i=0;i<out.length;i++)out[i]=parseInt(hex.slice(i*2,i*2+2),16);return out;}
export function uuid5(namespace:string,name:string):string{const ns=hexBytes(namespace),text=new TextEncoder().encode(name),all=new Uint8Array(ns.length+text.length);all.set(ns);all.set(text,ns.length);const hash=digestBytes(createHash('sha1').update(all).digest('hex')).slice(0,16);hash[6]=(hash[6]!&0x0f)|0x50;hash[8]=(hash[8]!&0x3f)|0x80;return bytesUuid(hash);}
export function uuidNamespace(projectId:string):string{if(projectId.startsWith('urn:uuid:')){const value=projectId.slice(9);try{hexBytes(value);return value.toLowerCase();}catch{}}return uuid5(URL_NAMESPACE,projectId);}
export function portableUrn(namespace:string,kind:string,key:string):string{return`urn:uuid:${uuid5(namespace,`${kind}:${key}`)}`;}
export function newUrnUuid():string{return`urn:uuid:${randomUUID()}`;}
