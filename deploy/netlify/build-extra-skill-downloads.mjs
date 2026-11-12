// Generate the three supplemental P2LRN Skills for each supported agent.
// This does not modify the existing p2lrn-creator ZIPs or their manifest.
import {createHash} from 'node:crypto';
import {readFile,lstat,readdir,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve,relative,sep} from 'node:path';
import {deflateRawSync,inflateRawSync} from 'node:zlib';

const root=resolve(process.cwd());
const target=join(root,'.netlify-cdn','downloads','skills');
const slugs=['p2lrn-curso-ilustrado','edicion-visual-con-codigo','entregables-con-codigo'];
const platforms={
  chatgpt:'skills/',codex:'.agents/skills/',claude:'',gemini:'',grok:'.grok/skills/'
};
const table=Uint32Array.from({length:256},(_,v)=>{for(let k=0;k<8;k++)v=(v&1)?(0xedb88320^(v>>>1)):(v>>>1);return v>>>0;});
const crc32=bytes=>{let v=0xffffffff;for(const b of bytes)v=table[(v^b)&255]^(v>>>8);return(v^0xffffffff)>>>0;};
async function collect(dir){
  const files=[];
  async function visit(folder){
    for(const ent of await readdir(folder,{withFileTypes:true})){
      const path=join(folder,ent.name),info=await lstat(path);
      if(info.isSymbolicLink())throw Error('Symlink disallowed: '+path);
      if(info.isDirectory())await visit(path);
      else if(info.isFile()){
        const name=relative(dir,path).split(sep).join('/');
        if(name.startsWith('/')||name.includes('..'))throw Error('Unsafe path: '+name);
        files.push({name,data:await readFile(path)});
      }else throw Error('Non-file entry: '+path);
    }
  }
  await visit(dir);
  return files.sort((a,b)=>a.name.localeCompare(b.name,'en'));
}
function zip(files){
  const locals=[],centrals=[],seen=new Set();let offset=0,centralSize=0;
  for(const {name,data} of files){
    if(!name||seen.has(name)||name.includes('..')||name.startsWith('/')||name.includes('\\'))throw Error('Unsafe ZIP member: '+name);
    seen.add(name);const filename=Buffer.from(name,'utf8'),raw=Buffer.from(data),deflated=deflateRawSync(raw,{level:8});
    const useDeflate=deflated.length<raw.length,packed=useDeflate?deflated:raw,method=useDeflate?8:0;
    if(method===8&&!inflateRawSync(packed).equals(raw))throw Error('Corrupt compression: '+name);
    const crc=crc32(raw),local=Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x0800,6);
    local.writeUInt16LE(method,8);local.writeUInt32LE(0x0021,12);local.writeUInt32LE(crc,14);
    local.writeUInt32LE(packed.length,18);local.writeUInt32LE(raw.length,22);local.writeUInt16LE(filename.length,26);
    locals.push(local,filename,packed);
    const central=Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);
    central.writeUInt16LE(0x0800,8);central.writeUInt16LE(method,10);central.writeUInt32LE(0x0021,14);
    central.writeUInt32LE(crc,16);central.writeUInt32LE(packed.length,20);central.writeUInt32LE(raw.length,24);
    central.writeUInt16LE(filename.length,28);central.writeUInt32LE(offset,42);
    centrals.push(central,filename);offset+=local.length+filename.length+packed.length;
    centralSize+=central.length+filename.length;
  }
  if(files.length>65535)throw Error('ZIP16 member limit');
  const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);
  end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);
  end.writeUInt32LE(centralSize,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,...centrals,end]);
}
await mkdir(target,{recursive:true});
const entries=[];
for(const slug of slugs){
  const sources=await collect(join(root,'skills',slug));
  const required=['SKILL.md','agents/openai.yaml','assets/icon.svg',
    'scripts/check_capabilities.py','references/COMPATIBILIDAD_AGENTES.md'];
  for(const filename of required)if(!sources.some(item=>item.name===filename))
    throw Error('Incomplete Skill '+slug+': '+filename);
  if(slug==='p2lrn-curso-ilustrado')for(const filename of ['scripts/p2lrn_package.py',
    'scripts/p2lrn_official.mjs','references/official-packages.json','references/official-runtime.md']){
    if(!sources.some(item=>item.name===filename))throw Error('Incomplete course Skill: '+filename);
  }
  const rawSkill=sources.find(item=>item.name==='SKILL.md').data.toString('utf8');
  if(!rawSkill.startsWith('---\nname: '+slug+'\n'))throw Error('Invalid Skill frontmatter: '+slug);
  for(const [platform,prefix] of Object.entries(platforms)){
    const members=sources.filter(f=>platform==='chatgpt'||f.name!=='agents/openai.yaml')
      .map(f=>({name:prefix+slug+'/'+f.name,data:f.data}));
    const bytes=zip(members);
    const filename=slug+'-'+platform+'-skill.zip';
    await writeFile(join(target,filename),bytes);
    entries.push({slug,platform,filename,url:'/downloads/skills/'+filename,
      bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),members:members.length});
  }
}
const manifest={schema:'https://p2lrn.org/schema/extra-skill-download-manifest/1',
 source:'skills/',packages:entries};
await writeFile(join(target,'extensions-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('P2LRN_EXTRA_SKILLS_GENERATED '+entries.length);
