import {createHash} from 'node:crypto';
import {
  CANONICAL_DOCUMENT_SCHEMA,
  CANONICAL_DOCUMENT_VERSION,
  DOCUMENT_INVENTORY_SCHEMA,
  DOCUMENT_PROVENANCE_SCHEMA,
  DOCUMENT_TRACE_SCHEMA,
  type CanonicalBlock,
  type CanonicalDocument,
  type CanonicalNode,
  type CanonicalTable,
  type DocumentProvenance,
  type ExtractionStrategy,
  type SourceDocumentFormat,
  type SourceDocumentInput,
} from './types.js';

function hash(value:string|Uint8Array):string{return createHash('sha256').update(value).digest('hex');}
function stableJson(value:unknown):string{
  const sort=(v:any):any=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;
  return JSON.stringify(sort(value));
}
function nodeType(block:CanonicalBlock):CanonicalNode['type']|null{
  switch(block.type){
    case 'TITLE':case 'SUBTITLE':return'TITLE';
    case 'PARAGRAPH':case 'OPTION':case 'METADATA':return'PARAGRAPH';
    case 'LIST':return'LIST';
    case 'TABLE':return'TABLE';
    case 'IMAGE':return'IMAGE';
    case 'QUESTION':return'QUESTION';
    case 'SOLUTION':return'SOLUTION';
    case 'SEPARATOR':return null;
  }
}
function traceOrigin(block:CanonicalBlock){const raw=block.source?.raw??{};if(raw.ocr===true)return'OCR' as const;if(raw.inferred===true)return'INFERRED' as const;return'NATIVE' as const;}

export function finalizeCanonicalDocument(input:{
  source:SourceDocumentInput;
  format:SourceDocumentFormat;
  strategy:ExtractionStrategy;
  blocks:CanonicalBlock[];
  tables?:CanonicalTable[];
  metadata?:CanonicalDocument['metadata'];
  warnings?:CanonicalDocument['warnings'];
  provenance?:Partial<DocumentProvenance>;
  raw?:unknown;
}):CanonicalDocument{
  const blocks=[...input.blocks].sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id)).map((b,i)=>({...b,order:i+1}));
  const tables=[...(input.tables??[])].sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id)).map((t,i)=>({...t,order:i+1}));
  const semanticForHash={
    source:{name:input.source.name,format:input.format,strategy:input.strategy},
    metadata:input.metadata??{},
    blocks:blocks.map(({trace,...b})=>b),
    tables,
  };
  const documentHash=hash(stableJson(semanticForHash));
  const documentId='doc_'+documentHash.slice(0,24);
  let cursor=0;
  const inventoryNodes:CanonicalDocument['inventory']['nodes']=[];
  const sequence:CanonicalNode[]=[];
  for(const block of blocks){
    const text=String(block.text??'');
    const charStart=cursor,charEnd=charStart+text.length;cursor=charEnd+1;
    const contentHash=hash(text);
    const nodeId='node_'+contentHash.slice(0,16)+'_'+block.order;
    const trace={
      schema:DOCUMENT_TRACE_SCHEMA,documentId,nodeId,origin:traceOrigin(block),contentHash,sourceOrder:block.order,
      spans:[{documentId,sourceBlockId:block.id,page:block.page,slide:block.slide,sheet:block.sheet,charStart,charEnd,bbox:block.bbox}]
    } as const;
    block.trace=trace;
    inventoryNodes.push({nodeId,sourceBlockId:block.id,contentHash,charStart,charEnd,page:block.page,slide:block.slide,sheet:block.sheet,internalFile:String(block.source?.raw?.internalFile??'')||undefined});
    const type=nodeType(block);
    if(type)sequence.push({
      id:block.id,type,order:block.order,text:block.text||undefined,page:block.page,slide:block.slide,sheet:block.sheet,bbox:block.bbox,
      provenance:{engine:block.source?.raw?.ocr===true?'OCR':'NATIVE',reference:block.id,internalFile:String(block.source?.raw?.internalFile??'')||undefined},
      data:block.type==='SUBTITLE'||block.type==='OPTION'?{sourceBlockType:block.type,level:block.level}:undefined
    });
  }
  const inventoryTables=tables.map(t=>({tableId:t.id,contentHash:hash(stableJson({name:t.name,columns:t.columns,rows:t.rows,cells:t.cells})),page:t.page,slide:t.slide,sheet:t.sheet}));
  return{
    schema:CANONICAL_DOCUMENT_SCHEMA,version:CANONICAL_DOCUMENT_VERSION,
    source:{name:input.source.name,mediaType:input.source.mediaType,format:input.format,strategy:input.strategy},
    metadata:input.metadata??{},blocks,tables,sequence:{nodes:sequence},
    provenance:{schema:DOCUMENT_PROVENANCE_SCHEMA,authoritativeEngine:input.provenance?.authoritativeEngine??'NATIVE',selection:input.provenance?.selection,reconciliation:input.provenance?.reconciliation},
    inventory:{schema:DOCUMENT_INVENTORY_SCHEMA,documentId,documentHash,totalBlocks:blocks.length,totalTables:tables.length,totalCharacters:Math.max(0,cursor-1),nodes:inventoryNodes,tables:inventoryTables},
    warnings:input.warnings??[],raw:input.raw
  };
}
