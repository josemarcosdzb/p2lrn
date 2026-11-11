// Standalone P2LRN LTI command-line installation and lifecycle.
// Only machine identity and connection secrets are managed here. Backups of
// course content and databases belong exclusively to the host/operator.
import {createHash,generateKeyPairSync,randomBytes,createCipheriv,scryptSync,createPublicKey,createPrivateKey} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,rm,lstat,chmod,stat,open} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {homedir,userInfo} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {lookup} from 'node:dns/promises';
import {spawn} from 'node:child_process';
import {createLtiStore} from './lti-store.mjs';

export const LTI_INSTALL_VERSION=1;
export const LTI_SQL_ENGINES=Object.freeze(['sqlite','postgres','mariadb','mysql','sqlserver']);
export const LTI_DEFAULT_DIR=join(homedir(),'.p2lrn','lti');
export const LTI_DEFAULT_PORT=37891;
const ADMIN_PERMISSIONS=['platform:read','platform:write','content:read','content:write',
 'roster:read','grades:read','grades:approve','grades:retry'];
const PROFILE_FILES=Object.freeze({
 config:'config.json',key:'tool-key.pem',master:'bootstrap-secret.txt',
 admin:'administrator-secret.txt',scopes:'administrator-scopes.json',
 database:'database-url.txt',recovery:'credentials.recovery.json'
});
function bad(message){throw new Error('P2LRN_INSTALL_'+message)}
function secret(){return randomBytes(48).toString('base64url')}
const hash=value=>createHash('sha256').update(value).digest('hex');
function ensureDirectoryPath(path){
 const absolute=resolve(String(path||''));
 if(!absolute||absolute===resolve('/')||absolute===resolve(homedir()))
  bad('UNSAFE_INSTALL_DIRECTORY');
 return absolute;
}
async function secureFile(path,value){
 // Exclusive create prevents overwriting a valid private key during setup.
 const fd=await open(path,'wx',0o600);
 try{await fd.writeFile(String(value),'utf8');}finally{await fd.close()}
 if(process.platform!=='win32')await chmod(path,0o600);
}
async function privatePath(path,kind){
 const st=await lstat(path);
 if(st.isSymbolicLink()||(kind==='file'&&!st.isFile())||(kind==='dir'&&!st.isDirectory()))
  bad('UNSAFE_FILE_TYPE');
 if(process.platform!=='win32' && (st.mode&0o077)!==0)
  bad('INSECURE_FILE_PERMISSIONS');
}
export function validateInstallationOptions(options){
 const engine=String(options.engine||'sqlite').toLowerCase();
 if(!LTI_SQL_ENGINES.includes(engine))bad('UNKNOWN_DATABASE');
 let url;
 try{url=new URL(String(options.domain||''));}catch{bad('INVALID_PUBLIC_DOMAIN')}
 if(url.protocol!=='https:'||!url.hostname||url.username||url.password||
    url.pathname!=='/'||url.search||url.hash||url.port)
  bad('HTTPS_DOMAIN_REQUIRED');
 if(/^(localhost|127\.|0\.0\.0\.0|\[::1\])$/i.test(url.hostname))
  bad('PUBLIC_DOMAIN_REQUIRED');
 const port=options.port==null?LTI_DEFAULT_PORT:Number(options.port);
 if(!Number.isInteger(port)||port<1024||port>65535)bad('INVALID_PORT');
 const proxy=String(options.proxy||'existing');
 if(!['existing','caddy'].includes(proxy))bad('UNSUPPORTED_HTTPS_PROXY');
 if(engine!=='sqlite'){
  let db;
  try{db=new URL(String(options.databaseUrl||''));}catch{bad('DATABASE_CONNECTION_REQUIRED')}
  const schemes=engine==='postgres'?['postgres:','postgresql:'] :
   engine==='sqlserver'?['sqlserver:'] :['mysql:','mariadb:'];
  if(!schemes.includes(db.protocol)||!db.hostname||!db.pathname||db.pathname==='/')
   bad('DATABASE_CONNECTION_REQUIRED');
  if(engine==='mysql'&&db.protocol!=='mysql:'||
     engine==='mariadb'&&db.protocol!=='mariadb:')bad('DATABASE_ENGINE_MISMATCH');
 }
 return {engine,domain:url.origin,port,proxy,directory:ensureDirectoryPath(options.directory||LTI_DEFAULT_DIR),
  databaseUrl:engine==='sqlite'?null:String(options.databaseUrl),
  canvasHosts:Array.isArray(options.canvasHosts)?options.canvasHosts:[]};
}
function makeKey(){
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:3072,publicExponent:0x10001});
 const privatePem=privateKey.export({format:'pem',type:'pkcs8'});
 const kid='p2lrn-'+hash(publicKey.export({format:'der',type:'spki'})).slice(0,32);
 return {privatePem,kid};
}
export function publicLmsEndpoints(domain){
 const value=String(domain).replace(/\/$/,'');
 return Object.freeze({
 login:value+'/lti/login',launch:value+'/lti/launch',
 deepLink:value+'/lti/deep-link',jwks:value+'/lti/jwks',
 canvasRegistration:value+'/lti/register/canvas',health:value+'/lti/health'
 });
}
export function caddyConfiguration(domain,port){
 const url=new URL(domain);
 return '# HTTPS is issued by Caddy only when DNS points here and ports 80/443 are reachable.\n'+
 url.hostname+' {\n'+
 '  encode gzip zstd\n'+
 '  header Referrer-Policy "no-referrer"\n'+
 '  reverse_proxy 127.0.0.1:'+port+'\n'+
 '}\n';
}
export function systemdUserService(instanceDirectory){
 const entry=resolve(new URL('./bin/p2lrn-lti.mjs',import.meta.url).pathname);
 const node=process.execPath;
 const quote=v=>'"'+String(v).replace(/[%\\"]/g,x=>x==='%'?'%%':'\\'+x)+'"';
 return '[Unit]\nDescription=P2LRN LTI Provider\nAfter=network-online.target\nWants=network-online.target\n\n'+
 '[Service]\nType=simple\nExecStart='+quote(node)+' '+quote(entry)+' start --directory '+quote(instanceDirectory)+'\n'+
 'Restart=on-failure\nRestartSec=5\nNoNewPrivileges=true\nUMask=0077\n\n'+
 '[Install]\nWantedBy=default.target\n';
}
function requiredName(v){if(typeof v!=='string'||!v.trim()||v.length>256)bad('INVALID_OPTION');return v}
export async function installLti(options){
 const settings=validateInstallationOptions(options);
 if(existsSync(settings.directory))bad('ALREADY_INSTALLED');
 const parent=dirname(settings.directory);
 await mkdir(parent,{recursive:true,mode:0o700});
 if(process.platform!=='win32'){
  // A public/shared parent is not suitable for storing private keys.
  const parentStat=await stat(parent);
  if((parentStat.mode&0o002)!==0)bad('UNSAFE_PARENT_PERMISSIONS');
 }
 const {mkdtemp}=await import('node:fs/promises');
 const staging=await mkdtemp(join(parent,'.p2lrn-lti-install-'));
 if(process.platform!=='win32')await chmod(staging,0o700);
 let moved=false;
 try{
  const tool=makeKey(),master=secret(),admin=secret();
  const expiry=Math.floor(Date.now()/1000)+365*24*3600;
  const config={
   version:LTI_INSTALL_VERSION,domain:settings.domain,engine:settings.engine,
   port:settings.port,host:'127.0.0.1',proxy:settings.proxy,kid:tool.kid,
   createdAt:new Date().toISOString(),canvasHosts:settings.canvasHosts
  };
  await secureFile(join(staging,PROFILE_FILES.key),tool.privatePem);
  await secureFile(join(staging,PROFILE_FILES.master),master+'\n');
  await secureFile(join(staging,PROFILE_FILES.admin),admin+'\n');
  await secureFile(join(staging,PROFILE_FILES.scopes),JSON.stringify([{
   id:'installation-administrator',sha256:hash(admin),tenantId:'*',
   permissions:ADMIN_PERMISSIONS,expiresAt:expiry,revoked:false
  }],null,2)+'\n');
  if(settings.engine!=='sqlite')
   await secureFile(join(staging,PROFILE_FILES.database),settings.databaseUrl+'\n');
  await secureFile(join(staging,PROFILE_FILES.config),JSON.stringify(config,null,2)+'\n');
  await mkdir(join(staging,'data'),{mode:0o700});
  // This is a live connection and schema check against the requested engine,
  // never an optimistic flag or an automatic fallback to another database.
  const store=createLtiStore(join(staging,'data','lti.sqlite'),{
   engine:settings.engine,connectionString:settings.databaseUrl
  });
  try{
   if(typeof store.count!=='function')bad('DATABASE_NOT_READY');
   store.count('platforms');
  }finally{store.close()}
  if(settings.proxy==='caddy')
   await writeFile(join(staging,'Caddyfile'),caddyConfiguration(settings.domain,settings.port),{mode:0o600,flag:'wx'});
  if(process.platform==='linux')
   await writeFile(join(staging,'p2lrn-lti.service'),systemdUserService(settings.directory),{mode:0o600,flag:'wx'});
  await rename(staging,settings.directory);moved=true;
  return {directory:settings.directory,config,administratorExpiresAt:expiry,
   endpoints:publicLmsEndpoints(settings.domain),publicHttpsVerified:false,
   needsProxyConfiguration:true,secretsStoredLocally:true,
   backupsResponsibility:'hosting-platform-or-technician'};
 }finally{
  if(!moved)await rm(staging,{recursive:true,force:true});
 }
}
export async function readInstallation(directory=LTI_DEFAULT_DIR,{includeSecrets=false}={}){
 const root=ensureDirectoryPath(directory);
 await privatePath(root,'dir');
 const configPath=join(root,PROFILE_FILES.config);
 await privatePath(configPath,'file');
 const config=JSON.parse(await readFile(configPath,'utf8'));
 if(config.version!==LTI_INSTALL_VERSION)bad('UNKNOWN_CONFIGURATION_VERSION');
 const normalized=validateInstallationOptions({
  engine:config.engine,domain:config.domain,port:config.port,proxy:config.proxy,
  directory:root,databaseUrl:config.engine==='sqlite'?null:
   includeSecrets?String(await readFile(join(root,PROFILE_FILES.database),'utf8')).trim():
    // A syntax-valid placeholder is only used for public/config inspection.
    config.engine==='postgres'?'postgres://placeholder@localhost/sample':
    config.engine==='sqlserver'?'sqlserver://placeholder@localhost/sample':
    config.engine+'://placeholder@localhost/sample'
 });
 if(!includeSecrets)return {root,config,public:normalized};
 const sensitive={};
 for(const [name,file] of Object.entries(PROFILE_FILES)){
  if(!['key','master','admin','scopes','database'].includes(name)||
     name==='database'&&config.engine==='sqlite')continue;
  const location=join(root,file);
  await privatePath(location,'file');
  sensitive[name]=String(await readFile(location,'utf8')).trim();
 }
 // Private PEM is returned as-is to preserve exact key byte representation.
 return {root,config,public:normalized,secrets:sensitive};
}
export async function testLtiDatabase(directory=LTI_DEFAULT_DIR){
 const instance=await readInstallation(directory,{includeSecrets:true});
 const store=createLtiStore(join(instance.root,'data','lti.sqlite'),{
  engine:instance.config.engine,connectionString:instance.secrets.database
 });
 try{
  const stats={platforms:store.count('platforms'),courses:store.count('catalog'),attempts:store.count('attempts')};
  return {connected:true,engine:instance.config.engine,stats};
 }finally{store.close()}
}
export async function startLti(directory=LTI_DEFAULT_DIR){
 const state=await readInstallation(directory,{includeSecrets:true});
 const {createP2LRNLtiServer}=await import('./lti-server.mjs');
 const {config,secrets,root}=state;
 const gateway=createP2LRNLtiServer({
  baseUrl:config.domain,dataDir:join(root,'data'),dbEngine:config.engine,
  dbUrl:secrets.database,port:config.port,bindHost:'127.0.0.1',
  tool:{privateKeyPem:secrets.key,kid:config.kid},
  adminToken:secrets.master,adminScopes:JSON.parse(secrets.scopes)
 });
 await gateway.listen(config.port,'127.0.0.1');
 return {gateway,port:config.port,domain:config.domain};
}
export async function publicHttpsDoctor(directory=LTI_DEFAULT_DIR){
 const {config}=await readInstallation(directory);
 const host=new URL(config.domain).hostname;
 const report={domain:config.domain,dns:false,https:false,healthy:false};
 try{
  const addresses=await lookup(host,{all:true});
  report.dns=addresses.length>0;
 }catch(err){report.dnsError=err.code||'DNS_LOOKUP_FAILED';return report}
 try{
  const signal=AbortSignal.timeout(6500);
  const health=await fetch(config.domain+'/lti/health',{signal,redirect:'manual'});
  const jwks=await fetch(config.domain+'/lti/jwks',{signal,redirect:'manual'});
  report.https=health.url.startsWith('https:')&&jwks.url.startsWith('https:');
  report.healthy=health.status===200&&jwks.status===200&&
   !!(await jwks.json()).keys?.length;
 }catch(err){report.httpsError=err.code||'HTTPS_CHECK_FAILED'}
 return report;
}
export async function rotateAdministrator(directory=LTI_DEFAULT_DIR){
 const {root,config}=await readInstallation(directory,{includeSecrets:true});
 const token=secret(),expire=Math.floor(Date.now()/1000)+365*24*3600;
 const policy=[{id:'installation-administrator',sha256:hash(token),tenantId:'*',
  permissions:ADMIN_PERMISSIONS,expiresAt:expire,revoked:false}];
 const admin=join(root,PROFILE_FILES.admin),scopes=join(root,PROFILE_FILES.scopes);
 // Store both originals privately before touching either; the caller must
 // restart the service to activate new keys. Never print the actual token.
 const backup=await readFile(admin),backupScopes=await readFile(scopes);
 try{
  await writeFile(admin,token+'\n',{mode:0o600,flag:'w'});
  await writeFile(scopes,JSON.stringify(policy,null,2)+'\n',{mode:0o600,flag:'w'});
 }catch(e){
  await writeFile(admin,backup,{mode:0o600});
  await writeFile(scopes,backupScopes,{mode:0o600});throw e;
 }
 return {rotated:true,expiresAt:expire,requiresServiceRestart:true,credentialFile:admin};
}
export async function exportRecovery(directory,output,passphrase){
 const state=await readInstallation(directory,{includeSecrets:true});
 if(typeof passphrase!=='string'||passphrase.length<16||passphrase.length>4096)
  bad('STRONG_RECOVERY_PASSPHRASE_REQUIRED');
 const location=resolve(requiredName(output));
 const salt=randomBytes(24),iv=randomBytes(12),key=scryptSync(passphrase,salt,32,{
  N:1<<15,r:8,p:1,maxmem:64*1024*1024
 });
 const cipher=createCipheriv('aes-256-gcm',key,iv);
 const payload=JSON.stringify({
  schema:'p2lrn-lti-recovery/1',createdAt:new Date().toISOString(),
  config:state.config,keys:state.secrets
 });
 const encrypted=Buffer.concat([cipher.update(payload,'utf8'),cipher.final()]);
 const blob=JSON.stringify({
  schema:'p2lrn-lti-encrypted-recovery/1',kdf:'scrypt-N32768-r8-p1',
  encryption:'aes-256-gcm',salt:salt.toString('base64'),
  iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),
  ciphertext:encrypted.toString('base64')
 },null,2)+'\n';
 await secureFile(location,blob);
 return {encrypted:true,path:location,includesCourseData:false,
  includesDatabaseDump:false,responsibility:'platform-or-technician'};
}
export function serviceInstructions(directory=LTI_DEFAULT_DIR){
 const dir=ensureDirectoryPath(directory);
 return process.platform==='linux'?{
  unitFile:join(dir,'p2lrn-lti.service'),
  commands:['mkdir -p ~/.config/systemd/user',
   'ln -s '+JSON.stringify(join(dir,'p2lrn-lti.service'))+' ~/.config/systemd/user/p2lrn-lti.service',
   'systemctl --user daemon-reload',
   'systemctl --user enable --now p2lrn-lti.service'],
  note:'Systemd user instances after logout may require an administrator to enable lingering.'
 }:{
  note:'The host/technician must install a supported OS service manager. No startup task is created automatically.',
  start:'p2lrn-lti start --directory '+JSON.stringify(dir)
 };
}
