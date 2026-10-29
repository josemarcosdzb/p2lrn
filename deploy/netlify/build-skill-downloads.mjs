import {createHash} from 'node:crypto';
import {readFile,lstat,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {deflateRawSync,inflateRawSync} from 'node:zlib';

const root=resolve(process.cwd());
const src=join(root,'skills','p2lrn-creator');
const dest=join(root,'.netlify-cdn','downloads','skills');
const utf8=(s)=>Buffer.from(s,'utf8');
const names=['NOTICE.md','CORE-INSTRUCTIONS.md','scripts/p2lrn_package.py','scripts/test_p2lrn_package.py',
 'references/blueprint.md','references/toolkit-parity.md','references/plataformas.md','assets/ejemplo-curso.json',
 'assets/icon.svg','agents/openai.yaml'];
const assets=new Map();
for(const name of names){
 const path=join(src,...name.split('/'));
 const info=await lstat(path);
 if(!info.isFile()||info.isSymbolicLink())throw Error('Unsafe Skill source: '+name);
 assets.set(name,await readFile(path));
}
const body=assets.get('CORE-INSTRUCTIONS.md').toString('utf8')
 .replace('# Creador directo de P2LRN para ChatGPT','# Creador de cursos educativos P2LRN con IA')
 .replace('a esta conversación','al usuario')
 .replace('Esta habilidad utiliza únicamente los archivos y las herramientas de ejecución disponibles en el entorno de ChatGPT.','Esta habilidad utiliza únicamente los archivos y herramientas autorizados de este entorno.')
 .replace('En ChatGPT con archivos locales, comparte la ruta de sandbox validada.','Entrega una descarga real comprobada mediante las herramientas de archivos del entorno.');
const platforms={
 chatgpt:{file:'p2lrn-chatgpt-plugin.zip',prefix:'skills/p2lrn-creator/',
  about:'Instalar como Skill de ChatGPT/Codex o enviar el plugin Skills only a revisión de OpenAI. La importación no supone aprobación ni publicación pública.',
  desc:'Crear y verificar paquetes educativos .p2lrn con Python para ChatGPT o Codex.'},
 claude:{file:'p2lrn-claude-skill.zip',prefix:'p2lrn-creator/',
  about:'Importar este ZIP como Skill personalizada donde Claude admita la función, o extraer la carpeta para Claude Code. Python 3.10+ y permisos de archivos son necesarios.',
  desc:'Crear cursos educativos .p2lrn mediante una Skill Python en Claude.'},
 gemini:{file:'p2lrn-gemini-skill.zip',prefix:'',
  about:'Extraer esta Skill en .gemini/skills/p2lrn-creator/ para Gemini CLI. La importación web está sujeta a disponibilidad y no garantiza la ejecución Python.',
  desc:'Generar y validar cursos .p2lrn con Python en Gemini CLI y entornos compatibles.'},
 grok:{file:'p2lrn-grok-skill.zip',prefix:'.grok/skills/p2lrn-creator/',
  about:'Extraer el ZIP en la raíz de un proyecto con Grok Build y comprobar el descubrimiento de .grok/skills/p2lrn-creator/. Grok web tiene funciones separadas.',
  desc:'Crear y verificar cursos .p2lrn con la Skill de Grok Build y Python.'}
};
const table=Uint32Array.from({length:256},(_,v)=>{for(let k=0;k<8;k++)v=(v&1)?(0xedb88320^(v>>>1)):(v>>>1);return v>>>0;});
function crc32(bytes){let v=0xffffffff;for(const b of bytes)v=table[(v^b)&255]^(v>>>8);return (v^0xffffffff)>>>0;}
function zip(entries){
 const local=[],central=[],seen=new Set();let at=0,totalCentral=0;
 for(const item of [...entries].sort((a,b)=>a.path.localeCompare(b.path,'en'))){
  const path=item.path;
  if(!path||path.startsWith('/')||path.includes('..')||path.includes('\\')||seen.has(path))throw Error('Invalid ZIP entry: '+path);
  seen.add(path);
  const name=utf8(path),raw=Buffer.from(item.bytes),compressed=deflateRawSync(raw,{level:8});
  const packed=compressed.length<raw.length?compressed:raw,method=packed===compressed?8:0;
  if(method===8&&!inflateRawSync(packed).equals(raw))throw Error('ZIP integrity: '+path);
  const crc=crc32(raw),h=Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(0x0800,6);
  h.writeUInt16LE(method,8);h.writeUInt16LE(0x0021,12);h.writeUInt32LE(crc,14);
  h.writeUInt32LE(packed.length,18);h.writeUInt32LE(raw.length,22);h.writeUInt16LE(name.length,26);
  local.push(h,name,packed);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);
  c.writeUInt16LE(20,6);c.writeUInt16LE(0x0800,8);c.writeUInt16LE(method,10);c.writeUInt16LE(0x0021,14);
  c.writeUInt32LE(crc,16);c.writeUInt32LE(packed.length,20);c.writeUInt32LE(raw.length,24);
  c.writeUInt16LE(name.length,28);c.writeUInt32LE(at,42);
  central.push(c,name);at+=h.length+name.length+packed.length;totalCentral+=c.length+name.length;
 }
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);
 end.writeUInt32LE(totalCentral,12);end.writeUInt32LE(at,16);
 const bytes=Buffer.concat([...local,...central,end]);if(bytes.length>25*1024*1024)throw Error('Skill archive is too large');
 return bytes;
}
const common=['NOTICE.md','scripts/p2lrn_package.py','scripts/test_p2lrn_package.py','references/blueprint.md',
 'references/toolkit-parity.md','references/plataformas.md','assets/ejemplo-curso.json','assets/icon.svg'];
const logo=await readFile(join(root,'deploy/netlify/site/favicon.png'));
await mkdir(dest,{recursive:true});
const manifest={schema:'https://p2lrn.org/schema/skill-download-manifest/1',formatVersion:'0.4.0',
 source:'skills/p2lrn-creator/',packages:[]};
for(const [platform,info] of Object.entries(platforms)){
 const heading='---\nname: p2lrn-creator\ndescription: "'+info.desc+'"\n---\n\n';
 const instructions=body.replace('## Contrato de ejecución','## Uso en '+platform+'\n\n'+info.about+
  '\n\nSe requieren Python 3.10+, un espacio de trabajo y capacidad de entregar un archivo. Si faltan, indicarlo sin inventar resultados.\n\n## Contrato de ejecución');
 const files=[{path:info.prefix+'SKILL.md',bytes:utf8(heading+instructions)}];
 for(const name of common)if(platform!=='gemini'||name!=='assets/icon.svg')
  files.push({path:info.prefix+name,bytes:assets.get(name)});
 if(platform==='chatgpt'){
  files.push({path:info.prefix+'agents/openai.yaml',bytes:assets.get('agents/openai.yaml')});
  files.push({path:'NOTICE.md',bytes:assets.get('NOTICE.md')});
  files.push({path:'assets/p2lrn-logo.png',bytes:logo});
  const plugin={$schema:'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',name:'p2lrn-crear-descargar',version:'0.1.2',
   description:'Genera y verifica cursos educativos P2LRN Core 0.4.0 con Python sin MCP.',
   author:{name:'P2LRN',url:'https://github.com/josemarcosfrodo/p2lrn'},
   homepage:'https://p2lrn.netlify.app/skills/',repository:'https://github.com/josemarcosfrodo/p2lrn',
   license:'P2LRN-NCSL-1.0',keywords:['p2lrn','cursos','educacion','quizzes','games'],
   extensions:{'com.openai':{interface:{displayName:'P2LRN – Crear y descargar',shortDescription:'Crear cursos .p2lrn con IA',
    longDescription:'Genera y valida un subconjunto del formato P2LRN Core 0.4.0 con Python. Incluye lecciones, cuestionarios, juegos y derechos, pero no sustituye Studio, MCP ni la ejecución de juegos 3D.',
    developerName:'P2LRN',category:'Education & Research',brandColor:'#4D4D4D',
    composerIcon:'./assets/p2lrn-logo.png',logo:'./assets/p2lrn-logo.png'},
    publication:{release_notes:'Skill autónoma; requiere aprobación de OpenAI antes de publicarse.'}}}};
  files.push({path:'plugin.json',bytes:utf8(JSON.stringify(plugin,null,2)+'\n')});
 }
 if(platform==='grok')files.push({path:'README-GROK.md',
  bytes:utf8('# P2LRN para Grok Build\n\nExtraer en la raíz del proyecto y verificar la ruta .grok/skills/p2lrn-creator/. No implica disponibilidad en Grok web ni publicación global.\n')});
 const bytes=zip(files);await writeFile(join(dest,info.file),bytes);
 manifest.packages.push({platform,filename:info.file,url:'/downloads/skills/'+info.file,bytes:bytes.length,
  sha256:createHash('sha256').update(bytes).digest('hex'),members:files.length});
}
await writeFile(join(dest,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('P2LRN_SKILL_DOWNLOADS '+JSON.stringify(manifest.packages.map(({platform,bytes})=>({platform,bytes}))));
