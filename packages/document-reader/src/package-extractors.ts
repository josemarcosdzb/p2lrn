import {XMLParser} from 'fast-xml-parser';
import type {CanonicalDocument, DocumentBlock, DocumentInput, FileDetection, ReaderOptions} from './types.js';
import {DocumentReaderError} from './types.js';
import {arrayValue, decodeXmlEntities, nextId, normalizeText, objectValue, stripTags} from './utils.js';
import {readTarGz, type TarEntry} from './tar.js';
import {readZip, zipEntry} from './zip.js';

const xmlParser=new XMLParser({
  ignoreAttributes:false,
  attributeNamePrefix:'@_',
  textNodeName:'#text',
  trimValues:true,
  parseTagValue:false,
  parseAttributeValue:false,
});

function base(file:DocumentInput,detection:FileDetection,strategy:CanonicalDocument['origin']['extractionStrategy']){
  return {
    version:'p2lrn.document-reader.v1' as const,
    origin:{
      fileName:detection.fileName,
      originalExtension:detection.extension,
      originalMime:detection.mimeType,
      detectedType:detection.type,
      extractionStrategy:strategy,
    },
  };
}

function localName(key:string){return key.split(':').at(-1)?.toLowerCase()??key.toLowerCase();}
function child(value:unknown,name:string):unknown{
  const obj=objectValue(value); if(!obj)return undefined;
  const hit=Object.entries(obj).find(([key])=>localName(key)===name.toLowerCase());
  return hit?.[1];
}
function children(value:unknown,name:string){return arrayValue(child(value,name));}
function text(value:unknown):string{
  if(typeof value==='string'||typeof value==='number')return normalizeText(String(value));
  if(Array.isArray(value))return normalizeText(value.map(text).filter(Boolean).join(' '));
  const obj=objectValue(value); if(!obj)return '';
  if(typeof obj['#text']==='string')return normalizeText(obj['#text']);
  return normalizeText(Object.entries(obj).filter(([key])=>!key.startsWith('@_')).map(([,v])=>text(v)).filter(Boolean).join(' '));
}
function attr(value:unknown,name:string){
  const obj=objectValue(value); const raw=obj?.[`@_${name}`]; return raw==null?undefined:String(raw);
}
function deepCollect(value:unknown,wanted:string,out:unknown[]=[]):unknown[]{
  if(Array.isArray(value)){value.forEach(v=>deepCollect(v,wanted,out));return out;}
  const obj=objectValue(value); if(!obj)return out;
  for(const [key,v] of Object.entries(obj)){
    if(localName(key)===wanted.toLowerCase()) out.push(...arrayValue(v));
    deepCollect(v,wanted,out);
  }
  return out;
}
function parseXml(buffer:Buffer,label:string){
  try{return xmlParser.parse(buffer.toString('utf8'));}catch(error){throw new DocumentReaderError(`Invalid XML in ${label}: ${error instanceof Error?error.message:'parse error'}`,'P2LRN_READER_XML');}
}
function manifestResources(parsed:unknown){
  const resources=deepCollect(parsed,'resource');
  const map=new Map<string,{href?:string;type?:string;files:string[]}>();
  for(const resource of resources){
    const id=attr(resource,'identifier'); if(!id)continue;
    const files=children(resource,'file').map(v=>attr(v,'href')).filter((v):v is string=>Boolean(v));
    map.set(id,{href:attr(resource,'href'),type:attr(resource,'type'),files});
  }
  return map;
}
function manifestItems(parsed:unknown,resources:Map<string,{href?:string;type?:string;files:string[]}>){
  const blocks:DocumentBlock[]=[];
  const visit=(item:unknown,level:number)=>{
    const title=text(child(item,'title'))||attr(item,'identifier')||'Item';
    const ref=attr(item,'identifierref'); const resource=ref?resources.get(ref):undefined;
    blocks.push({
      id:nextId('manifest_item'),
      type:level<=1?'TITLE':'PARAGRAPH',
      text:title,
      level,
      order:blocks.length+1,
      source:{type:'SCORM',raw:{identifier:attr(item,'identifier'),identifierRef:ref,href:resource?.href,resourceType:resource?.type,files:resource?.files}},
    });
    children(item,'item').forEach(childItem=>visit(childItem,level+1));
  };
  for(const organization of deepCollect(parsed,'organization')) children(organization,'item').forEach(item=>visit(item,1));
  return blocks;
}

export async function readStandardPackage(file:DocumentInput,detection:FileDetection,options:ReaderOptions={}):Promise<CanonicalDocument>{
  const entries=await readZip(file.buffer,options);
  if(detection.type==='CMI5'){
    const entry=zipEntry(entries,'cmi5.xml');
    if(!entry)throw new DocumentReaderError('cmi5 package has no cmi5.xml.','P2LRN_READER_CMI5');
    const parsed=parseXml(entry.buffer,entry.name);
    const course=deepCollect(parsed,'course')[0];
    const courseTitle=text(child(course,'title'))||text(course);
    const aus=deepCollect(parsed,'au');
    const blocks:DocumentBlock[]=[];
    if(courseTitle)blocks.push({id:nextId('cmi5_course'),type:'TITLE',text:courseTitle,order:1,source:{type:'CMI5'}});
    aus.forEach((au,index)=>{
      const title=text(child(au,'title'))||attr(au,'id')||`AU ${index+1}`;
      const url=text(child(au,'url'));
      blocks.push({id:nextId('cmi5_au'),type:'PARAGRAPH',text:title,order:blocks.length+1,source:{type:'CMI5',raw:{id:attr(au,'id'),url,moveOn:attr(au,'moveOn')}}});
    });
    return {...base(file,detection,'CMI5_PACKAGE'),metadata:{detectedTitle:courseTitle||undefined},blocks,tables:[],raw:{launchUnits:aus.length},warnings:[]};
  }
  if(detection.type==='XAPI_PACKAGE'){
    const entry=zipEntry(entries,'tincan.xml');
    if(!entry)throw new DocumentReaderError('Tin Can/xAPI package has no tincan.xml.','P2LRN_READER_TINCAN');
    const parsed=parseXml(entry.buffer,entry.name);
    const activities=deepCollect(parsed,'activity');
    const blocks=activities.map((activity,index):DocumentBlock=>{
      const name=text(child(activity,'name'))||attr(activity,'id')||`Activity ${index+1}`;
      return {id:nextId('tincan'),type:index===0?'TITLE':'PARAGRAPH',text:name,order:index+1,source:{type:'XAPI_PACKAGE',raw:{id:attr(activity,'id'),launch:text(child(activity,'launch'))}}};
    });
    return {...base(file,detection,'XAPI_TINCAN_PACKAGE'),metadata:{detectedTitle:blocks[0]?.text},blocks,tables:[],raw:{activities:activities.length},warnings:[]};
  }

  const entry=zipEntry(entries,'imsmanifest.xml');
  if(!entry)throw new DocumentReaderError('Package has no imsmanifest.xml.','P2LRN_READER_IMS');
  const parsed=parseXml(entry.buffer,entry.name);
  const resources=manifestResources(parsed);
  const blocks=manifestItems(parsed,resources);
  const title=blocks[0]?.text;
  const strategy=detection.type==='IMSCC'?'IMSCC_MANIFEST':'SCORM_MANIFEST';
  blocks.forEach(block=>{if(block.source)block.source.type=detection.type;});
  return {
    ...base(file,detection,strategy),
    metadata:{detectedTitle:title},
    blocks,
    tables:[],
    raw:{resources:[...resources.entries()].map(([identifier,value])=>({identifier,...value}))},
    warnings:blocks.length?[]:[{path:'manifest.organizations',message:'Manifest contains no projected organization items.',level:'WARNING'}],
  };
}

export async function readH5p(file:DocumentInput,detection:FileDetection,options:ReaderOptions={}):Promise<CanonicalDocument>{
  const entries=await readZip(file.buffer,options);
  const metadataEntry=zipEntry(entries,'h5p.json');
  if(!metadataEntry)throw new DocumentReaderError('H5P package has no h5p.json.','P2LRN_READER_H5P');
  let metadata:Record<string,unknown>;
  try{metadata=JSON.parse(metadataEntry.buffer.toString('utf8')) as Record<string,unknown>;}catch{throw new DocumentReaderError('Invalid h5p.json.','P2LRN_READER_H5P');}
  const contentEntry=zipEntry(entries,'content/content.json');
  let content:unknown=null;
  if(contentEntry){try{content=JSON.parse(contentEntry.buffer.toString('utf8'));}catch{}}
  const title=typeof metadata.title==='string'?metadata.title:typeof metadata.mainLibrary==='string'?metadata.mainLibrary:'H5P';
  const dependencies=[...arrayValue<Record<string,unknown>>(metadata.preloadedDependencies),...arrayValue<Record<string,unknown>>(metadata.dynamicDependencies)];
  const blocks:DocumentBlock[]=[
    {id:nextId('h5p_title'),type:'TITLE',text:title,order:1,source:{type:'H5P',raw:{mainLibrary:metadata.mainLibrary,language:metadata.language}}},
    ...dependencies.map((dependency,index):DocumentBlock=>({
      id:nextId('h5p_dep'),type:'METADATA',
      text:`${String(dependency.machineName??'library')} ${String(dependency.majorVersion??'?')}.${String(dependency.minorVersion??'?')}`,
      order:index+2,source:{type:'H5P',raw:dependency},
    })),
  ];
  return {
    ...base(file,detection,'H5P_PACKAGE'),
    metadata:{detectedTitle:title,language:typeof metadata.language==='string'?metadata.language:undefined},
    blocks,tables:[],raw:{metadata,content,entryCount:entries.size},
    warnings:[],
  };
}

function xmlTagText(xml:string,tag:string){
  return normalizeText(decodeXmlEntities(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,'iu').exec(xml)?.[1]??'').replace(/<[^>]+>/gu,' '));
}

function archiveEntries(file:DocumentInput,detection:FileDetection,options:ReaderOptions){
  const gzip=file.buffer.length>=2&&file.buffer[0]===0x1f&&file.buffer[1]===0x8b;
  if(gzip||detection.extension==='tgz'||detection.extension==='tar.gz'){
    return Promise.resolve(readTarGz(file.buffer,options));
  }
  return readZip(file.buffer,options).then(map=>[...map.entries()].map(([name,buffer])=>({name,buffer})));
}

export async function readMoodle(file:DocumentInput,detection:FileDetection,options:ReaderOptions={}):Promise<CanonicalDocument>{
  const entries=await archiveEntries(file,detection,options);
  const moodle=entries.find(entry=>entry.name.toLowerCase().endsWith('moodle_backup.xml'));
  if(!moodle)throw new DocumentReaderError('Moodle backup has no moodle_backup.xml.','P2LRN_READER_MOODLE');
  const xml=moodle.buffer.toString('utf8');
  const title=xmlTagText(xml,'original_course_fullname')||xmlTagText(xml,'fullname')||xmlTagText(xml,'name')||file.name;
  const blocks:DocumentBlock[]=[{id:nextId('moodle_title'),type:'TITLE',text:title,order:1,source:{type:'MOODLE_BACKUP'}}];
  const sectionFiles=entries.filter(entry=>/sections\/section_\d+\/section\.xml$/iu.test(entry.name)).sort((a,b)=>a.name.localeCompare(b.name));
  for(const entry of sectionFiles){
    const sectionXml=entry.buffer.toString('utf8');
    const name=xmlTagText(sectionXml,'name')||xmlTagText(sectionXml,'summary')||entry.name;
    blocks.push({id:nextId('moodle_section'),type:'SUBTITLE',text:name,order:blocks.length+1,source:{type:'MOODLE_BACKUP',raw:{path:entry.name}}});
  }
  const activities=entries.filter(entry=>/activities\/[^/]+\/module\.xml$/iu.test(entry.name));
  for(const entry of activities){
    const activityXml=entry.buffer.toString('utf8');
    const name=xmlTagText(activityXml,'name')||xmlTagText(activityXml,'modulename')||(entry.name.split('/').at(-2)??entry.name);
    blocks.push({id:nextId('moodle_activity'),type:'PARAGRAPH',text:name,order:blocks.length+1,source:{type:'MOODLE_BACKUP',raw:{path:entry.name}}});
  }
  return {...base(file,detection,'MOODLE_MBZ_MANIFEST'),metadata:{detectedTitle:title},blocks,tables:[],raw:{entries:entries.length,sections:sectionFiles.length,activities:activities.length},warnings:[]};
}

export async function readChamilo(file:DocumentInput,detection:FileDetection,options:ReaderOptions={}):Promise<CanonicalDocument>{
  const entries=await readZip(file.buffer,options);
  const all=[...entries.entries()].map(([name,buffer])=>({name,buffer}));
  const info=all.find(entry=>/(^|\/)course_info\.(?:xml|json|dat)$/iu.test(entry.name));
  let title=file.name;
  if(info){
    const raw=info.buffer.toString('utf8');
    if(info.name.toLowerCase().endsWith('.json')){
      try{const parsed=JSON.parse(raw);title=String(parsed.title??parsed.name??parsed.course_title??title);}catch{}
    }else title=xmlTagText(raw,'title')||xmlTagText(raw,'name')||title;
  }
  const blocks:DocumentBlock[]=[{id:nextId('chamilo_title'),type:'TITLE',text:title,order:1,source:{type:'CHAMILO_COURSE_ZIP'}}];
  for(const entry of all.filter(x=>/\/(?:learnpath|lp|quiz|exercice|exercise|document)\//iu.test('/'+x.name)).sort((a,b)=>a.name.localeCompare(b.name))){
    if(/\.(?:xml|html?|txt|json)$/iu.test(entry.name)){
      const raw=entry.buffer.toString('utf8');
      const extracted=entry.name.toLowerCase().endsWith('.json')?normalizeText(raw.slice(0,500)):stripTags(raw);
      const label=extracted.split('\n').find(Boolean)?.slice(0,200)||entry.name;
      blocks.push({id:nextId('chamilo'),type:'PARAGRAPH',text:label,order:blocks.length+1,source:{type:'CHAMILO_COURSE_ZIP',raw:{path:entry.name}}});
    }
  }
  return {...base(file,detection,'CHAMILO_COURSE_ZIP_MANIFEST'),metadata:{detectedTitle:title},blocks,tables:[],raw:{entries:entries.size},warnings:[]};
}

export async function readOpenEdx(file:DocumentInput,detection:FileDetection,options:ReaderOptions={}):Promise<CanonicalDocument>{
  const entries=await archiveEntries(file,detection,options);
  const xmlEntries=entries.filter(entry=>/\.(?:xml|html?)$/iu.test(entry.name)).sort((a,b)=>a.name.localeCompare(b.name));
  const course=entries.find(entry=>/(^|\/)course\/course\.xml$/iu.test(entry.name))??entries.find(entry=>/(^|\/)course\.xml$/iu.test(entry.name));
  let title=file.name;
  if(course){
    const raw=course.buffer.toString('utf8');
    title=(/<course\b[^>]*(?:display_name|name)=["']([^"']+)["']/iu.exec(raw)?.[1]??xmlTagText(raw,'display_name'))||title;
  }
  const blocks:DocumentBlock[]=[{id:nextId('olx_title'),type:'TITLE',text:decodeXmlEntities(title),order:1,source:{type:'OPEN_EDX_OLX'}}];
  for(const entry of xmlEntries){
    if(course&&entry.name===course.name)continue;
    const raw=entry.buffer.toString('utf8');
    const display=/\bdisplay_name=["']([^"']+)["']/iu.exec(raw)?.[1];
    const body=stripTags(raw);
    const label=normalizeText(decodeXmlEntities(display??body.split('\n').find(Boolean)??entry.name)).slice(0,300);
    if(!label)continue;
    const kind=entry.name.split('/')[0]?.toLowerCase();
    blocks.push({id:nextId('olx'),type:kind==='chapter'?'SUBTITLE':'PARAGRAPH',text:label,order:blocks.length+1,source:{type:'OPEN_EDX_OLX',raw:{path:entry.name,kind}}});
  }
  return {...base(file,detection,'OPEN_EDX_OLX_MANIFEST'),metadata:{detectedTitle:decodeXmlEntities(title)},blocks,tables:[],raw:{entries:entries.length},warnings:[]};
}

export async function readGenericZip(file:DocumentInput,detection:FileDetection,options:ReaderOptions={}):Promise<CanonicalDocument>{
  const entries=await readZip(file.buffer,options);
  const blocks=[...entries.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([name,buffer],index):DocumentBlock=>({
    id:nextId('zip_entry'),
    type:'METADATA',
    text:name,
    order:index+1,
    source:{type:'ZIP',raw:{path:name,bytes:buffer.length}},
  }));
  return {...base(file,detection,'ZIP_CONTAINER'),metadata:{detectedTitle:file.name},blocks,tables:[],raw:{entries:entries.size},warnings:[]};
}
