import {copyFileSync,existsSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {basename,dirname,isAbsolute,join,relative} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {sha256} from '../core/integrity.js';
import {URL_NAMESPACE,portableUrn,uuid5,uuidNamespace} from '../core/uuid.js';
import {addFile,addUnit,newProject,PROJECT_FILE,saveProject} from './project.js';
import {buildProject,guessMediaType} from './builder.js';

export const AULAP2P_DOCUMENT_SCHEMA='aulap2p.documento.extraido.v2';
export const AULAP2P_MULTIMODAL_SCHEMA='aulap2p.documento.multimodal.v2';
export const AULAP2P_BRIDGE_SCHEMA='p2lrn.aulap2p-reader-envelope.v1';
export const LEGACY_AULAP2P_BRIDGE_SCHEMA='p2rln.aulap2p-reader-envelope.v1';
export const AULAP2P_PROVENANCE_NS='https://p2lrn.org/ext/provenance';
const TRANSFORMATION_PATH='provenance/transformation.json';
const AULAP2P_GRAPH_EXTENSION='org.p2lrn.aulap2p';
const TRANSFORMATION_RULES=[
  'Prisma/local IDs are never exported as portable identity',
  'internal AulaP2P URLs are never converted into remote P2LRN locations',
  'source coordinates and extraction confidence are preserved as provenance',
  'PREGUNTA/SOLUCION document nodes are content evidence only; native assessments require reconciled aulap2p.curso.v1 questionnaires',
];

export class AulaP2PIngestError extends Error{constructor(message){super(message);this.name='AulaP2PIngestError';}}
const te=new TextEncoder();
function sorted(v){if(Array.isArray(v))return v.map(sorted);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map((k)=>[k,sorted(v[k])]));return v;}
function jsonDigest(v){return sha256(te.encode(JSON.stringify(sorted(v)))).slice(7);}
function safeKey(v,fallback){const x=v.trim().replace(/[^A-Za-z0-9._-]+/g,'-').replace(/^[-._]+|[-._]+$/g,'');return x.slice(0,80)||fallback;}
function lang(document,explicit){const v=String(explicit??document?.metadatos?.idiomaDetectado??'es').trim().replaceAll('_','-');return/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(v)?v:'es';}
function title(document,sourceFile){return String(document?.metadatos?.tituloDetectado??document?.origen?.nombreArchivo??(sourceFile?basename(sourceFile):'Documento importado'));}
function provenanceNode(node){const out={sourceNodeId:node.id,sourceType:node.tipo,order:node.orden};for(const [src,dst] of [['pagina','page'],['diapositiva','slide'],['hoja','sheet'],['bbox','boundingBox'],['confianza','confidence']])if(node[src]!=null)out[dst]=node[src];if(node.procedencia&&typeof node.procedencia==='object'&&!Array.isArray(node.procedencia))out.extraction=Object.fromEntries(Object.entries(node.procedencia).filter(([k])=>k!=='raw'));return out;}
function orderedItems(document){const m=document.secuenciaMultimodal;if(!m||typeof m!=='object'||Array.isArray(m)||m.version!==AULAP2P_MULTIMODAL_SCHEMA)throw new AulaP2PIngestError(`${AULAP2P_DOCUMENT_SCHEMA} requires ${AULAP2P_MULTIMODAL_SCHEMA}`);return (Array.isArray(m.nodos)?m.nodos:[]).filter((n)=>n&&typeof n==='object'&&!Array.isArray(n)).sort((a,b)=>(Number(a.orden??0)-Number(b.orden??0))||String(a.id??'').localeCompare(String(b.id??''))).map((n)=>[n,'multimodal']);}
function esc(v){return v.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#x27;');}
function renderText(item,language){const raw=item.texto;if(typeof raw!=='string'||!raw.trim())return undefined;const kind=String(item.tipo??'PARRAFO').toUpperCase(),tag=kind==='TITULO'?'h1':kind==='SUBTITULO'?'h2':kind==='PREGUNTA'?'blockquote':kind==='SOLUCION'?'aside':'p';return`<!doctype html><html lang="${esc(language)}"><meta charset="utf-8"><body><${tag}>${esc(raw.trim())}</${tag}></body></html>\n`;}
function assetIndex(envelope,assetRoot){const out=new Map();for(const asset of Array.isArray(envelope.assets)?envelope.assets:[]){if(!asset||typeof asset!=='object'||Array.isArray(asset)||typeof asset.path!=='string'||!asset.path)continue;const path=isAbsolute(asset.path)?asset.path:assetRoot?join(assetRoot,asset.path):asset.path;if(!existsSync(path))continue;for(const k of ['sourceNodeId','blockTempId','archivoId','sourceLocalId'])if(asset[k]!=null)out.set(String(asset[k]),path);}return out;}
function imagePath(item,index){const candidates=[item.id,item.tempId,item.archivoId,item.archivo&&typeof item.archivo==='object'?item.archivo.id:undefined];for(const k of candidates)if(k!=null&&index.has(String(k)))return index.get(String(k));return undefined;}
function addProv(entity,provenance){entity.extensions??={};entity.extensions[AULAP2P_PROVENANCE_NS]=provenance;}
function validateDocument(document){if(!document||typeof document!=='object'||Array.isArray(document)||document.version!==AULAP2P_DOCUMENT_SCHEMA)throw new AulaP2PIngestError('envelope does not contain a valid DocumentoExtraidoCanonico');for(const field of ['origen','metadatos','procedenciaExtraccion'])if(!document[field]||typeof document[field]!=='object'||Array.isArray(document[field]))throw new AulaP2PIngestError(`canonical document requires object field: ${field}`);for(const field of ['bloques','tablas','advertencias'])if(!Array.isArray(document[field]))throw new AulaP2PIngestError(`canonical document requires array field: ${field}`);orderedItems(document);}
function preservedAssetPath(hexDigest){return`assets/sha256/${hexDigest.slice(0,2)}/${hexDigest.slice(2,4)}/${hexDigest}`;}
function warningMessage(warning){if(typeof warning==='string')return warning;const text=String(warning?.mensaje??warning?.message??'').trim();return text||JSON.stringify(sorted(warning));}
function mappedId(namespace,kind,key){return portableUrn(namespace,kind,key);}

export function ingestAulaP2PReader(inputJson,output,options={}){
  const inputBytes=readFileSync(inputJson);
  let raw;
  try{raw=JSON.parse(new TextDecoder().decode(inputBytes));}catch(e){throw new AulaP2PIngestError(`invalid AulaP2P Reader JSON: ${e instanceof Error?e.message:String(e)}`);}
  let envelope,document;
  if([AULAP2P_BRIDGE_SCHEMA,LEGACY_AULAP2P_BRIDGE_SCHEMA].includes(raw?.schema)){envelope=raw;document=raw.document;}
  else if(raw?.version===AULAP2P_DOCUMENT_SCHEMA){envelope={schema:AULAP2P_BRIDGE_SCHEMA,document:raw,assets:[]};document=raw;}
  else throw new AulaP2PIngestError(`expected ${AULAP2P_DOCUMENT_SCHEMA} or ${AULAP2P_BRIDGE_SCHEMA}`);
  validateDocument(document);
  if(options.sourceFile&&!existsSync(options.sourceFile))throw new AulaP2PIngestError(`source file not found: ${options.sourceFile}`);

  const canonicalDigest=jsonDigest(document);
  const normalizedCanonicalBytes=te.encode(JSON.stringify(sorted(document),null,2)+'\n');
  const inputDigest=sha256(inputBytes).slice(7);
  const originalSourceBytes=options.sourceFile?readFileSync(options.sourceFile):undefined;
  const preservedBytes=originalSourceBytes??normalizedCanonicalBytes;
  const preservedDigest=sha256(preservedBytes).slice(7);
  const identityDigest=options.sourceFile?preservedDigest:inputDigest;
  const language=lang(document,options.language);
  const courseTitle=title(document,options.sourceFile);
  const sourceItems=orderedItems(document);
  const assets=assetIndex(envelope,options.assetRoot);
  const root=join('/tmp',`p2lrn-aulap2p-${randomUUID()}`);
  mkdirSync(root,{recursive:true});

  try{
    const project=newProject(courseTitle,language,'Imported through the AulaP2P canonical document reader');
    project.projectId='urn:uuid:'+uuid5(URL_NAMESPACE,`p2lrn:aulap2p-reader:${identityDigest}`);
    const namespace=uuidNamespace(project.projectId);
    const preservedPath=preservedAssetPath(preservedDigest);
    const sourceLocator=options.sourceFile?basename(options.sourceFile):(raw?.schema?'bridge-envelope#document':'$');
    const transformation={
      version:'0.4.0',
      source:{
        format:options.sourceFile?String(document.origen?.tipoArchivoDetectado??'unknown'):AULAP2P_DOCUMENT_SCHEMA,
        fileName:options.sourceFile?basename(options.sourceFile):basename(inputJson),
        byteDigest:`sha256:${options.sourceFile?preservedDigest:inputDigest}`,
        preservedPackageDigest:`sha256:${preservedDigest}`,
        preservedPath,
        preservation:options.sourceFile?'bit-exact':'normalized-subpackage',
        ...(!options.sourceFile?{normalizedFromRoot:raw?.schema?'document':'$'}:{}),
      },
      target:{format:'P2LRN',formatVersion:'0.4.0',entrypoint:mappedId(namespace,'course',project.course.key)},
      fidelity:{sourceBytes:options.sourceFile?'exact':'normalized',structuralProjection:'partial',runtimeSemantics:'projected'},
      mappings:[],
      warnings:document.advertencias.filter((w)=>w!=null).map(warningMessage),
      losses:[],
    };

    project.graphPolicy='preserve';
    project.graphExtensions={
      'org.p2lrn.transform':{report:TRANSFORMATION_PATH,version:'0.4.0'},
      [AULAP2P_GRAPH_EXTENSION]:{
        adapter:'AulaP2PReaderAdapter',
        documentSchema:AULAP2P_DOCUMENT_SCHEMA,
        multimodalSchema:document.secuenciaMultimodal?.version,
        detectedFormat:document.origen?.tipoArchivoDetectado,
        extractionStrategy:document.origen?.estrategiaExtraccion,
        canonicalDocumentDigest:`sha256:${canonicalDigest}`,
        readerWarnings:document.advertencias.filter((w)=>w!=null),
        rules:[...TRANSFORMATION_RULES],
      },
    };
    project.provenance=transformation;

    addUnit(project,'document',courseTitle,language,'document','course');
    transformation.mappings.push({sourceLocator:'aulap2p:document',targetId:mappedId(namespace,'unit','document'),targetType:'unit',operation:'projected',fidelity:'semantic'});

    const generated=join(root,'generated');
    mkdirSync(generated,{recursive:true});
    let unresolvedImages=0,created=0;
    sourceItems.forEach(([item],idx)=>{
      const index=idx+1;
      const kind=String(item.tipo??'PARRAFO').toUpperCase();
      const sourceId=String(item.id??item.tempId??`item-${index}`);
      const key=safeKey(`${String(index).padStart(4,'0')}-${kind.toLowerCase()}-${createHash('sha1').update(te.encode(sourceId)).digest('hex').slice(0,8)}`,`item-${index}`);
      const provenance=provenanceNode(item);
      const recordMapping=(resource,activity)=>{
        const locator=`aulap2p:${sourceId}`;
        transformation.mappings.push(
          {sourceLocator:locator,targetId:mappedId(namespace,'resource',resource.key),targetType:'resource',operation:'projected',fidelity:'semantic'},
          {sourceLocator:locator,targetId:mappedId(namespace,'activity',activity.key),targetType:'activity',operation:'projected',fidelity:'semantic'},
        );
      };
      if(['IMAGEN','IMAGEN_REFERENCIADA','GRAFICO'].includes(kind)){
        const image=imagePath(item,assets);
        if(image){
          const [resource,activity]=addFile(root,project,image,key,String(item.texto??basename(image)),{language,parent:'document',mediaType:guessMediaType(image),role:'primary',activityType:'https://p2lrn.org/type/resource',copyFile:true});
          addProv(resource,provenance);
          addProv(activity,provenance);
          recordMapping(resource,activity);
          created++;
        }else{
          unresolvedImages++;
          transformation.losses.push({sourceLocator:`aulap2p:${sourceId}`,reason:'portable bytes were not supplied by the AulaP2P bridge'});
        }
        return;
      }
      const fragment=renderText(item,language);
      if(!fragment)return;
      const path=join(generated,`${key}.html`);
      writeFileSync(path,fragment);
      const [resource,activity]=addFile(root,project,path,key,String(item.texto??kind).slice(0,160),{language,parent:'document',mediaType:'text/html',profile:'https://p2lrn.org/profile/web-content',role:'primary',activityType:'https://p2lrn.org/type/resource',copyFile:false});
      addProv(resource,provenance);
      addProv(activity,provenance);
      recordMapping(resource,activity);
      created++;
    });

    const sourceName=options.sourceFile?basename(options.sourceFile):'aulap2p-document.json';
    const sourceTarget=join(root,'source',sourceName);
    mkdirSync(dirname(sourceTarget),{recursive:true});
    if(options.sourceFile)copyFileSync(options.sourceFile,sourceTarget);else writeFileSync(sourceTarget,preservedBytes);
    const sourceResource={
      key:options.sourceFile?'res-original-source':'res-canonical-source',
      title:{[language]:options.sourceFile?`Fuente original: ${sourceName}`:'Documento canónico AulaP2P preservado'},
      representations:[{
        key:'source',
        role:'source',
        mediaType:options.sourceFile?guessMediaType(options.sourceFile):'application/json',
        originalName:sourceName,
        source:{type:'file',path:relative(root,sourceTarget).replaceAll('\\','/')},
      }],
    };
    addProv(sourceResource,{role:options.sourceFile?'original-source':'canonical-source',sha256:`sha256:${preservedDigest}`});
    project.resources.push(sourceResource);
    transformation.mappings.push(
      {sourceLocator,targetId:mappedId(namespace,'resource',sourceResource.key),targetType:'resource',operation:'preserved',fidelity:options.sourceFile?'exact':'semantic'},
      {sourceLocator,targetId:mappedId(namespace,'representation',`${sourceResource.key}:source`),targetType:'representation',operation:'preserved',fidelity:options.sourceFile?'exact':'semantic'},
    );

    if(unresolvedImages){
      transformation.warnings.push(`${unresolvedImages} image node(s) had only local AulaP2P references and were not exported without materialized bytes.`);
    }

    saveProject(join(root,PROJECT_FILE),project);
    const result=buildProject(root,output,Boolean(options.strictProfiles));
    Object.assign(result,{ingestion:'aulap2p-reader',sourceDocumentSchema:document.version,sourceItems:sourceItems.length,createdActivities:created,unresolvedImages,sourcePreserved:Boolean(options.sourceFile),canonicalSourcePreserved:!options.sourceFile});
    return result;
  }finally{
    rmSync(root,{recursive:true,force:true});
  }
}
