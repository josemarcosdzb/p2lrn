#!/usr/bin/env node
// @ts-nocheck
import {readFileSync,writeFileSync,readdirSync,statSync} from 'node:fs';
import {join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {contentDigest,computeContentRoot,sha256} from '../core/integrity.js';
import {canonicalizeJsonIdentifiers,FORMAT} from '../core/constants.js';
import {writeZip} from '../core/zip.js';
import {validatePackageBytes} from '../core/validator.js';
import {parse,opt,printJson,fail,CliExit,flag,isMain} from '../cli/util.js';
const td=new TextDecoder('utf-8'),enc=new TextEncoder();
const pretty=(x:any)=>enc.encode(JSON.stringify(x,null,2)+'\n');
function walk(dir:string):string[]{const out:string[]=[];for(const name of readdirSync(dir)){const p=join(dir,name),s=statSync(p);if(s.isDirectory())out.push(...walk(p));else if(s.isFile())out.push(p);}return out;}
function isJson(mediaType:string|undefined){const m=String(mediaType??'').split(';',1)[0]!.trim().toLowerCase();return m==='application/json'||m.endsWith('+json');}
export function rebuildExample(root:string,name:string,outputDir=join(root,'examples')){
  const d=join(root,'examples',name),mp=join(d,'META-INF/manifest.json'),gp=join(d,'content/graph.json');
  const legacy=JSON.parse(td.decode(readFileSync(mp)));
  const m:any=canonicalizeJsonIdentifiers(legacy);m.format=FORMAT;
  const graph=canonicalizeJsonIdentifiers(JSON.parse(td.decode(readFileSync(gp))));
  const gb=pretty(graph);
  m.graph.size=gb.byteLength;m.graph.byteDigest=sha256(gb);m.graph.contentDigest=contentDigest(gb,'application/json','graph');
  const payloads=new Map<string,Uint8Array>();
  for(const f of m.files){
    let data=readFileSync(join(d,f.path));
    if(isJson(f.mediaType)){try{data=pretty(canonicalizeJsonIdentifiers(JSON.parse(td.decode(data))));}catch{/* non-JSON declared data will be rejected by validation */}}
    payloads.set(f.path,data);f.size=data.byteLength;f.byteDigest=sha256(data);f.contentDigest=contentDigest(data,f.mediaType,f.path);
  }
  m.integrity.contentRoot=computeContentRoot(m);
  const out=join(outputDir,name==='minimal'?'minimal-course.p2lrn':'web-course.p2lrn');
  const entries=[{path:'META-INF/manifest.json',data:pretty(m),mediaType:'application/json'},{path:'content/graph.json',data:gb,mediaType:'application/json'},...m.files.map((f:any)=>({path:f.path,data:payloads.get(f.path),mediaType:f.mediaType}))];
  const bytes=writeZip(entries);writeFileSync(out,bytes);
  return{name,output:out,validation:validatePackageBytes(bytes,{strictProfiles:true,validateProfilePayloads:true}).summary};
}
export function main(argv=process.argv.slice(2)){try{const p=parse(argv);if(flag(p,'help')){process.stdout.write('Usage: p2lrn-rebuild-examples [--root DIR] [--output DIR]\n');return;}const explicitRoot=opt(p,'root');const root=resolve(explicitRoot??fileURLToPath(new URL('../../',import.meta.url)));const outputDir=resolve(opt(p,'output')??(explicitRoot?join(root,'examples'):process.cwd()));printJson([rebuildExample(root,'minimal',outputDir),rebuildExample(root,'web',outputDir)]);}catch(e){if(e instanceof CliExit)return;fail('P2LRN Rebuild examples error',e);}}
if(isMain(import.meta.url))main();
