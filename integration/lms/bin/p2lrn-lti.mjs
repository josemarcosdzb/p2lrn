#!/usr/bin/env node
// CLI installs and configures existing P2LRN LTI server, not a second runtime.
import {createInterface} from 'node:readline/promises';
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {
 LTI_SQL_ENGINES,LTI_DEFAULT_DIR,installLti,startLti,readInstallation,
 testLtiDatabase,publicHttpsDoctor,publicLmsEndpoints,serviceInstructions,
 rotateAdministrator,exportRecovery,importRecovery,acknowledgeRestoredData,enableSystemdUserService
} from '../lti-installer.mjs';

const HELP=[
 'P2LRN LTI Provider - instalador de consola',
 '',
 'p2lrn-lti init                      Instalacion guiada inicial',
 'p2lrn-lti start                     Iniciar Provider',
 'p2lrn-lti doctor [--public]         Comprobar SQL y HTTPS publico',
 'p2lrn-lti endpoints                 URLs para conectar cualquier LMS',
 'p2lrn-lti service                   Instrucciones de servicio en el host',
 'p2lrn-lti service --enable --yes    Activa servicio systemd de usuario en Linux',
 'p2lrn-lti rotate-admin              Revocar credencial anterior',
 'p2lrn-lti export-recovery           Exportar identidad cifrada, SIN datos',
 'p2lrn-lti import-recovery           Restaurar SOLO identidad en ruta nueva',
 'p2lrn-lti restore-complete          Confirmar que el tecnico repuso los datos',
 '',
 'Opciones: --directory, --domain, --database, --db-url-file, --proxy, --port,',
 '          --input, --output, --yes, --json, --public, --enable',
 'No instala servicios al hacer npm install; no crea backups de cursos ni bases de datos.'
].join('\n');

function parse(args){
 const [command='help',...tail]=args;
 const options={},positional=[];
 const boolean=new Set(['yes','public','json','enable']);
 const known=new Set(['directory','domain','database','db-url-file','proxy','port','yes','public','output','input','json','enable']);
 for(let i=0;i<tail.length;i++){
  const part=tail[i];
  if(!part.startsWith('--')){positional.push(part);continue}
  const cut=part.indexOf('='),key=part.slice(2,cut<0?undefined:cut);
  if(!known.has(key))throw new Error('Opcion desconocida: '+key);
  let value;
  if(boolean.has(key)){
   if(cut>=0)throw new Error('Opcion booleana no admite valor: '+key);
   value=true;
  }else{
   value=cut>=0?part.slice(cut+1):tail[++i];
   if(!value||value.startsWith('--'))throw new Error('Falta el valor de --'+key);
  }
  if(Object.hasOwn(options,key))throw new Error('Opcion duplicada: '+key);
  options[key]=value;
 }
 if(positional.length)throw new Error('Argumentos no previstos: '+positional.join(' '));
 return {command,options};
}
async function promptText(label,fallback){
 if(!process.stdin.isTTY)throw new Error('Indica las opciones requeridas con --yes');
 const rl=createInterface({input:process.stdin,output:process.stdout});
 try{
  const text=await rl.question(label+(fallback?' ['+fallback+']':'')+': ');
  return text.trim()||fallback;
 }finally{rl.close()}
}
async function promptChoice(label,choices,defaultValue){
 console.log(choices.map(c=>'  - '+c).join('\n'));
 for(let n=0;n<3;n++){
  const answer=(await promptText(label,defaultValue)).toLowerCase();
  if(choices.includes(answer))return answer;
  console.log('Opcion incorrecta.');
 }
 throw new Error('Demasiados intentos incorrectos');
}
async function promptHidden(label){
 if(!process.stdin.isTTY||typeof process.stdin.setRawMode!=='function')
  throw new Error('Los secretos solo se solicitan desde una terminal interactiva');
 return new Promise((ok,fail)=>{
  process.stdout.write(label+': ');
  let value='';
  const done=(err)=>{
   process.stdin.removeListener('data',onData);
   process.stdin.setRawMode(false);process.stdin.pause();
   process.stdout.write('\n');
   if(err)fail(err);else ok(value);
  };
  const onData=buffer=>{
   for(const char of buffer.toString('utf8')){
    if(char==='\r'||char==='\n'){done();return}
    if(char==='\u0003'){done(new Error('Cancelado'));return}
    if(char==='\u007f'||char==='\b'){value=value.slice(0,-1);continue}
    if(char>=' '&&char!=='\u007f')value+=char;
   }
  };
  process.stdin.setRawMode(true);process.stdin.resume();
  process.stdin.on('data',onData);
 });
}
function show(data,json){console.log(json?JSON.stringify(data,null,2):data)}
async function initialize(options){
 const directory=options.directory||LTI_DEFAULT_DIR;
 if(!options.json)console.log('P2LRN LTI - instalacion unica para todos los LMS');
 const domain=options.domain||await promptText('Dominio publico HTTPS (sin rutas)');
 const engine=options.database||await promptChoice('Base de datos',LTI_SQL_ENGINES,'sqlite');
 const proxy=options.proxy||await promptChoice('Quien gestiona HTTPS?',['existing','caddy'],'existing');
 const port=options.port||37891;
 let databaseUrl;
 if(engine!=='sqlite'){
  if(options['db-url-file'])
   databaseUrl=String(await readFile(resolve(options['db-url-file']),'utf8')).trim();
  else if(process.env.P2LRN_LTI_DB_URL)databaseUrl=process.env.P2LRN_LTI_DB_URL;
  else databaseUrl=await promptHidden('URL SQL (oculta)');
 }
 if(!options.json)console.log([
  'Instalacion privada: '+resolve(directory),'Dominio: '+domain,'Motor: '+engine,
  'HTTPS: '+proxy,'Se probara el SQL real y se crearan tablas en esa base.',
  'Las copias de cursos y bases de datos pertenecen a la plataforma/tecnico.'
 ].join('\n'));
 if(!options.yes){
  const answer=await promptText('Confirmar instalacion? Escribe SI');
  if(answer!=='SI')throw new Error('Instalacion cancelada');
 }
 const result=await installLti({domain,engine,proxy,directory,port,databaseUrl});
 if(options.json)return show(result,true);
 console.log('Proveedor instalado. RSA y claves administrativas guardadas de forma privada.');
 console.log('Credencial inicial: '+join(result.directory,'administrator-secret.txt'));
 console.log('RSA privada: '+join(result.directory,'tool-key.pem'));
 console.log('No se imprimen ni envian secretos a servicios externos.');
 console.log('El dominio requiere DNS y un proxy HTTPS activo antes de conectar LMS.');
 if(proxy==='caddy')console.log('Plantilla HTTPS: '+join(result.directory,'Caddyfile'));
 console.log('Arrancar: p2lrn-lti start --directory '+JSON.stringify(directory));
 console.log('Comprobar: p2lrn-lti doctor --public --directory '+JSON.stringify(directory));
 console.log('Conectar LMS: p2lrn-lti endpoints --directory '+JSON.stringify(directory));
 console.log('Servicio: p2lrn-lti service --directory '+JSON.stringify(directory));
 console.log('Recuperacion de identidad (opcional): p2lrn-lti export-recovery');
 if(process.stdin.isTTY&&!options.yes){
  const save=(await promptText('Guardar ahora una copia CIFRADA solo de claves y configuracion? (s/N)','N')).toLowerCase();
  if(save==='s'||save==='si'||save==='sí'){
   const location=await promptText('Destino del archivo cifrado',
    join(result.directory,'credentials.recovery.json'));
   const passphrase=await promptHidden('Frase de cifrado (minimo 16 caracteres)');
   if(passphrase!==await promptHidden('Repetir frase de cifrado'))throw new Error('Frases diferentes');
   const backup=await exportRecovery(result.directory,location,passphrase);
   console.log('Identidad cifrada guardada en '+backup.path+
    '. NO contiene base de datos ni cursos.');
  }
  if(process.platform==='linux'){
   const enable=(await promptText('Activar arranque automatico systemd de usuario? (s/N)','N')).toLowerCase();
   if(enable==='s'||enable==='si'||enable==='sí'){
    await enableSystemdUserService(result.directory);
    console.log('Servicio de usuario activo. El tecnico debe configurar HTTPS y persistencia tras reinicio.');
   }
  }
 }
}
async function main(){
 const {command,options}=parse(process.argv.slice(2));
 const directory=options.directory||LTI_DEFAULT_DIR;
 if(command==='help'||command==='--help'){console.log(HELP);return}
 if(command==='init'||command==='install'){await initialize(options);return}
 if(command==='start'){
  const running=await startLti(directory);
  console.log('Provider P2LRN en 127.0.0.1:'+running.port+' / '+running.domain);
  const stop=()=>{
   running.gateway.close().then(()=>process.exit(0)).catch(()=>process.exit(1));
  };
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  return;
 }
 if(command==='endpoints'){
  const {config}=await readInstallation(directory);
  const urls=publicLmsEndpoints(config.domain);
  return show(options.json?urls:Object.entries(urls).map(([k,v])=>k+': '+v).join('\n'),options.json);
 }
 if(command==='doctor'){
  const database=await testLtiDatabase(directory);
  const https=options.public?await publicHttpsDoctor(directory):
   {checked:false,note:'Use --public para verificar DNS y certificado HTTPS'};
  const report={database,publicHttps:https,backups:'host-or-technician'};
  return show(options.json?report:'SQL: '+database.engine+' conectado\nHTTPS: '+
   (https.healthy?'verificado':https.checked===false?'no comprobado':'pendiente o fallido'),options.json);
 }
 if(command==='service'){
  if(options.enable){
   if(!options.yes){
    const reply=await promptText('Habilitar servicio systemd? Escribe SI');
    if(reply!=='SI')throw new Error('Cancelado');
   }
   const result=await enableSystemdUserService(directory);
   return show(options.json?result:'Servicio P2LRN activo y habilitado. Revisa la configuracion HTTPS del host.',options.json);
  }
  const result=serviceInstructions(directory);
  return show(options.json?result:result.note||result.commands?.join('\n')||JSON.stringify(result,null,2),options.json);
 }
 if(command==='rotate-admin'){
  if(!options.yes){
   const answer=await promptText('Revocar credencial anterior? Escribe SI');
   if(answer!=='SI')throw new Error('Cancelado');
  }
  const result=await rotateAdministrator(directory);
  return show(options.json?result:'Clave administrativa renovada en '+result.credentialFile+
   '. Reinicia el servicio para activar la nueva.',options.json);
 }
 if(command==='export-recovery'){
  const output=options.output||await promptText('Ruta para archivo CIFRADO de identidad');
  const passphrase=await promptHidden('Frase de recuperacion (16 caracteres o mas)');
  if(passphrase!==await promptHidden('Repetir frase'))throw new Error('Frases diferentes');
  const result=await exportRecovery(directory,output,passphrase);
  return show(options.json?result:'Identidad cifrada guardada en '+result.path+
   '. La base de datos y los cursos NO estan incluidos.',options.json);
 }
 if(command==='import-recovery'){
  const archive=options.input||await promptText('Archivo cifrado de identidad');
  const passphrase=await promptHidden('Frase de recuperacion');
  const result=await importRecovery(archive,directory,passphrase);
  return show(options.json?result:
   'Identidad recuperada en '+result.directory+
   '. Antes de arrancar, el tecnico debe restaurar cursos y datos de la plataforma.'+
   '\nDespués: p2lrn-lti restore-complete --directory '+JSON.stringify(directory),options.json);
 }
 if(command==='restore-complete'){
  if(!options.yes){
   const confirmation=await promptText(
    'Confirmas que la plataforma ha restaurado la base de datos y archivos de cursos? Escribe SI');
   if(confirmation!=='SI')throw new Error('Cancelado');
  }
  const result=await acknowledgeRestoredData(directory);
  return show(options.json?result:
   'Estado de restauracion confirmado. Ejecuta doctor antes de abrir el servicio al LMS.',options.json);
 }
 throw new Error('Comando desconocido: '+command+'\n'+HELP);
}
main().catch(err=>{
 console.error('P2LRN LTI: '+String(err?.message||'Error desconocido')
  .replace(/([a-z]+:\/\/)[^\s@]+@/ig,'$1[redacted]@'));
 process.exitCode=1;
});
