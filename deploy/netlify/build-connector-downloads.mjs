import {createHash} from 'node:crypto';
import {readdir,readFile,mkdir,writeFile} from 'node:fs/promises';
import {join,relative,resolve} from 'node:path';
import {deflateRawSync,inflateRawSync} from 'node:zlib';

// Bundles the actual versioned MCP source and LTI contracts used by P2LRN.
// No fabricated HTTPS endpoints, client tokens, or compiled server binaries.
const root=resolve(process.cwd());
const out=join(root,'.netlify-cdn','downloads');
const text=string=>Buffer.from(string,'utf8');

async function collect(directory){
  const found=[];
  const walk=async folder=>{
    for(const item of await readdir(folder,{withFileTypes:true})){
      if(item.isSymbolicLink())throw new Error('Refusing symlink in connector package: '+item.name);
      if(item.isDirectory())await walk(join(folder,item.name));
      else if(item.isFile()){
        const absolute=join(folder,item.name);
        const key=relative(root,absolute).replaceAll('\\','/');
        if(key.includes('/node_modules/')||key.includes('/.generated/'))throw new Error('Unsafe file in connector package: '+key);
        found.push({path:key,contents:await readFile(absolute)});
      }
    }
  };
  await walk(join(root,...directory.split('/')));
  return found;
}
const file=async path=>({path,contents:await readFile(join(root,...path.split('/')))});
const note=(path,message)=>({path,contents:text(message)});

// ZIP32 with UTF-8 names, fixed timestamps and CRC32. No third-party install
// dependency is introduced into the Netlify website build.
const crcTable=Uint32Array.from({length:256},(_,index)=>{
  let crc=index;
  for(let i=0;i<8;i++)crc=(crc&1) ? (0xedb88320^(crc>>>1)) : crc>>>1;
  return crc>>>0;
});
const crc32=bytes=>{
  let crc=0xffffffff;
  for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);
  return (crc^0xffffffff)>>>0;
};
function archive(files,folder){
  const names=new Set(),local=[],central=[];
  let offset=0,centralSize=0;
  const ordered=files.slice().sort((a,b)=>a.path.localeCompare(b.path,'en'));
  if(!ordered.length||ordered.length>65535)throw new Error('Unsupported connector ZIP entry count');
  for(const entry of ordered){
    if(!entry.path||entry.path.startsWith('/')||entry.path.includes('..')||entry.path.includes('\\'))
      throw new Error('Invalid connector ZIP path: '+entry.path);
    const filename=folder+'/'+entry.path,raw=entry.contents;
    if(names.has(filename))throw new Error('Duplicate connector ZIP member: '+filename);
    names.add(filename);
    const name=text(filename),compressed=deflateRawSync(raw,{level:7});
    const packed=compressed.length<raw.length?compressed:raw;
    const method=packed===compressed?8:0;
    if(!packed.equals(raw)&&!inflateRawSync(packed).equals(raw))
      throw new Error('Connector ZIP member did not round-trip: '+filename);
    if(offset+30+name.length+packed.length>0xffffffff||raw.length>0xffffffff)
      throw new Error('Connector ZIP exceeds ZIP32 limits');
    const crc=crc32(raw);
    const localHeader=Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50,0);
    localHeader.writeUInt16LE(20,4);
    localHeader.writeUInt16LE(0x0800,6);
    localHeader.writeUInt16LE(method,8);
    localHeader.writeUInt16LE(0,10);
    localHeader.writeUInt16LE(0x0021,12);
    localHeader.writeUInt32LE(crc,14);
    localHeader.writeUInt32LE(packed.length,18);
    localHeader.writeUInt32LE(raw.length,22);
    localHeader.writeUInt16LE(name.length,26);
    local.push(localHeader,name,packed);
    const header=Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50,0);
    header.writeUInt16LE(20,4);
    header.writeUInt16LE(20,6);
    header.writeUInt16LE(0x0800,8);
    header.writeUInt16LE(method,10);
    header.writeUInt16LE(0,12);
    header.writeUInt16LE(0x0021,14);
    header.writeUInt32LE(crc,16);
    header.writeUInt32LE(packed.length,20);
    header.writeUInt32LE(raw.length,24);
    header.writeUInt16LE(name.length,28);
    header.writeUInt32LE(offset,42);
    central.push(header,name);
    offset+=localHeader.length+name.length+packed.length;
    centralSize+=header.length+name.length;
  }
  const end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);
  end.writeUInt16LE(ordered.length,8);
  end.writeUInt16LE(ordered.length,10);
  end.writeUInt32LE(centralSize,12);
  end.writeUInt32LE(offset,16);
  return {buffer:Buffer.concat([...local,...central,end]),members:names};
}

const license=await file('LICENSE');
const notice=await file('NOTICE.md');
const mcpFiles=[
  'Conectar-P2LRN.cmd','connect-local.mjs','install-client.mjs',
  'local-clients.mjs','server.mjs','service.mjs',
  'prepare-connectors.mjs','package.json','README.md'
];
const mcp=[
  ...await Promise.all(mcpFiles.map(item=>file('integration/mcp/'+item))),
  await file('packages/toolkit/package.json'),
  await file('packages/toolkit/tsconfig.json'),
  ...await collect('packages/toolkit/src'),
  ...await collect('packages/toolkit/web'),
  ...await collect('packages/toolkit/config'),
  ...await collect('profiles'),
  ...await collect('schemas'),
  license,notice,
  note('LEEME-PRIMERO.md',`# Conector MCP P2LRN · Windows y clientes compatibles

1. Descomprime el ZIP completo en una carpeta de tu elección, por ejemplo C:\\P2LRN-MCP.
2. Instala Node.js 22 o posterior. La primera ejecución necesita Internet para instalar las dependencias npm.
3. Abre integration/mcp/Conectar-P2LRN.cmd con doble clic. No abras el .cmd desde dentro del ZIP sin extraerlo.
4. Selecciona sólo la carpeta de cursos que quieres compartir con tu IA y el cliente instalado. Elige lectura al principio.
5. Revisa los cambios antes de confirmar: el asistente guarda copias de seguridad de la configuración existente.
6. Comprueba las herramientas en el cliente: p2lrn_list_courses y p2lrn_validate_course.
7. Para edición, habilita expresamente los borradores. Nunca se sobrescribe el paquete original.

Conectores IA web (ChatGPT, Claude, Grok):
- El ZIP no es un plugin publicado en sus catálogos.
- Un cliente web necesita tu servidor HTTPS autenticado; nunca publiques directamente 127.0.0.1:37871.
- Después de disponer de un endpoint real, ejecuta desde integration/mcp:
  npm install --ignore-scripts
  node prepare-connectors.mjs --endpoint https://TU-DOMINIO-REAL/mcp --out .generated/connectors
- OAuth multiusuario y la distribución pública aún requieren trabajo y revisión.

No hay contraseñas, URLs reales de terceros ni cuentas preconfiguradas en esta descarga.
`)
];
const lti=[
  ...await collect('integration/lms'),
  await file('packages/toolkit/web/host-adapter.js'),
  await file('packages/toolkit/package.json'),
  license,notice,
  note('LEEME-PRIMERO.md',`# Contratos LTI 1.3 para desarrolladores P2LRN

Este ZIP contiene el diseño, el contrato inicial de lanzamiento, el Host Adapter
y pruebas de contrato de P2LRN. No es un módulo LMS listo para instalar.

Para ejecutar las pruebas desde la carpeta descomprimida (Node.js 22+):
  node --test integration/lms/lms-contracts.test.mjs

Pendiente: registro confiable de LMS, OIDC/JWKS/launch firmado, selector Deep Linking,
sesiones verificadas y envío AGS real. No se suministran URLs operativas ni secretos.

La integración con cinco LMS externos se documenta en /docs/conectores/lms/.
`)
];
await mkdir(out,{recursive:true});
const artifacts=[];
for(const [name,folder,entries] of [
  ['p2lrn-conector-mcp.zip','p2lrn-mcp',mcp],
  ['p2lrn-lti-contratos.zip','p2lrn-lti',lti]
]){
  const {buffer,members}=archive(entries,folder);
  await writeFile(join(out,name),buffer);
  artifacts.push({file:name,path:'/downloads/'+name,sha256:createHash('sha256').update(buffer).digest('hex'),bytes:buffer.length,members:members.size});
}
await writeFile(join(out,'manifest.json'),JSON.stringify({format:'p2lrn-connector-downloads/1',artifacts},null,2)+'\n');
console.log(JSON.stringify({downloadPackages:artifacts},null,2));
