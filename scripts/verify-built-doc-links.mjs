import {access,readFile,readdir} from 'node:fs/promises';
import {join,relative,resolve,sep} from 'node:path';

const root=resolve(process.cwd(),'.netlify-cdn');
const failures=[];
async function exists(path){try{await access(path);return true}catch{return false}}
async function walk(dir){
  const out=[];
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const full=join(dir,entry.name);
    if(entry.isDirectory())out.push(...await walk(full));
    else if(entry.isFile()&&entry.name.endsWith('.html'))out.push(full);
  }
  return out;
}
const htmlFiles=await walk(root);
let checked=0;
for(const file of htmlFiles){
  const rel=relative(root,file).replaceAll('\\','/');
  if(rel.includes('/source/'))continue;
  const html=await readFile(file,'utf8');
  for(const match of html.matchAll(/href=["']([^"']+)["']/gi)){
    const href=match[1];
    if(!href.startsWith('/')||href.startsWith('//'))continue;
    const rawPath=href.split(/[?#]/,1)[0];
    if(!rawPath)continue;
    let decoded;
    try{decoded=decodeURIComponent(rawPath)}catch{failures.push(rel+': malformed href '+href);continue}
    const normalized=decoded.replace(/^\/+/, '').replaceAll('/',sep);
    const direct=resolve(root,normalized);
    if(direct!==root&&!direct.startsWith(root+sep)){failures.push(rel+': href escapes publish root '+href);continue}
    const candidates=decoded.endsWith('/')?[join(direct,'index.html')]:[direct,join(direct,'index.html')];
    checked++;
    if(!(await Promise.all(candidates.map(exists))).some(Boolean))failures.push(rel+': broken published href '+href);
  }
}
if(failures.length)throw new Error('Built-site link audit failed:\n'+failures.join('\n'));
console.log(JSON.stringify({ok:true,htmlFiles:htmlFiles.length,internalLinksChecked:checked,publishRoot:'.netlify-cdn'},null,2));
