import {createHash} from 'node:crypto';
import {basename} from 'node:path';
import {finalizeCanonicalDocument} from '../finalize.js';
import {xmlDecode} from '../office/xml.js';
import type {DocumentExtractor} from '../contracts.js';
import type {AssetReference,CanonicalBlock,CanonicalTable,MaterializedAsset,SourceDocumentInput} from '../types.js';

const td=new TextDecoder('utf-8',{fatal:false});
function text(input:SourceDocumentInput):string{return td.decode(input.bytes).replace(/\u0000/g,'').replace(/\r\n?/g,'\n');}
function digest(bytes:Uint8Array):string{return 'sha256:'+createHash('sha256').update(bytes).digest('hex');}
function decodeEntities(value:string):string{return xmlDecode(value).replace(/&nbsp;/gi,' ').replace(/&ndash;/gi,'–').replace(/&mdash;/gi,'—').replace(/&hellip;/gi,'…');}
function stripMarkup(value:string,preserve=false):string{
  const cleaned=decodeEntities(value.replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,''));
  if(preserve)return cleaned.replace(/^\n+|\n+$/g,'');
  return cleaned.split('\n').map(line=>line.replace(/\s+/g,' ').trim()).filter(Boolean).join(' ').trim();
}
function htmlAttr(attrs:string,name:string):string|undefined{
  const escaped=name.replace(/[^A-Za-z0-9_-]/g,'\\$&');
  const match=attrs.match(new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,'i'));
  return decodeEntities(match?.[1]??match?.[2]??match?.[3]??'').trim()||undefined;
}
function uniqueColumns(values:string[]):string[]{
  const seen=new Map<string,number>();
  return values.map((value,index)=>{const base=value.trim()||`Columna ${index+1}`,count=(seen.get(base)??0)+1;seen.set(base,count);return count===1?base:`${base} ${count}`;});
}
function htmlTable(fragment:string,id:string,order:number):CanonicalTable{
  const matrix=[...fragment.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)].map(row=>
    [...(row[1]??'').matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)].map(cell=>stripMarkup(cell[2]??''))
  ).filter(row=>row.length);
  const width=Math.max(1,...matrix.map(row=>row.length)),header=matrix[0]??[],columns=uniqueColumns(Array.from({length:width},(_,i)=>header[i]??''));
  const rows=matrix.slice(1);
  return{id,order,name:`Tabla ${id.replace(/\D/g,'')||''}`.trim(),columns,rows:rows.map(row=>Object.fromEntries(columns.map((column,i)=>[column,row[i]??'']))),cells:{headers:header.length?[header.map(value=>({text:value,header:true}))]:[],rows:rows.map(row=>row.map(value=>({text:value})))},source:{format:'HTML',raw:{parser:'P2LRN_HTML_V1'}}};
}
function dataImage(src:string,index:number,nameHint:string|undefined):{reference:AssetReference;bytes:Uint8Array}|undefined{
  const match=src.match(/^data:(image\/[A-Za-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i);if(!match)return undefined;
  let bytes:Uint8Array;try{bytes=new Uint8Array(Buffer.from(match[2]!.replace(/\s+/g,''),'base64'));}catch{return undefined;}
  if(!bytes.byteLength||bytes.byteLength>32*1024*1024)return undefined;
  const mediaType=match[1]!.toLowerCase(),ext=mediaType.split('/')[1]?.replace('jpeg','jpg')??'bin';
  const reference:AssetReference={id:`html-asset-${index}`,name:nameHint?.trim()||`image-${index}.${ext}`,mediaType,size:bytes.byteLength,byteDigest:digest(bytes),sourcePath:'data-uri'};
  return{reference,bytes};
}
function htmlSource(input:SourceDocumentInput){
  return text(input).replace(/<!--([\s\S]*?)-->/g,'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
}
export const htmlExtractor:DocumentExtractor={
  id:'p2lrn.html.v1',formats:['HTML'],
  async extract(input){
    const source=htmlSource(input);if(!source.trim())throw new Error('HTML document is empty.');
    const blocks:CanonicalBlock[]=[],tables:CanonicalTable[]=[],assets:MaterializedAsset[]=[],warnings=[] as Array<{path:string;message:string;level:'WARNING'}>;
    let order=0,tableIndex=0,imageIndex=0;
    const re=/<(h[1-6]|p|li|pre|blockquote|table)\b([^>]*)>([\s\S]*?)<\/\1\s*>|<img\b([^>]*)\/?\s*>/gi;
    for(const match of source.matchAll(re)){
      const tag=match[1]?.toLowerCase();
      if(tag==='table'){
        tableIndex+=1;order+=1;const table=htmlTable(match[0],`html-table-${tableIndex}`,order);tables.push(table);
        blocks.push({id:`html-table-block-${tableIndex}`,type:'TABLE',text:table.name??`Tabla ${tableIndex}`,order,source:{format:'HTML',raw:{tableId:table.id,sourceOffset:match.index??0}}});continue;
      }
      if(tag){
        const body=match[3]??'',value=stripMarkup(body,tag==='pre');if(!value)continue;order+=1;
        const heading=/^h([1-6])$/.exec(tag),type=heading?'TITLE':tag==='li'?'LIST':'PARAGRAPH';
        blocks.push({id:`html-block-${order}`,type,text:value,order,level:heading?Number(heading[1]):undefined,source:{format:'HTML',raw:{tag,sourceOffset:match.index??0,...(tag==='pre'?{role:'CODE_BLOCK',preserveWhitespace:true}:{})}}});continue;
      }
      const attrs=match[4]??'';imageIndex+=1;const src=htmlAttr(attrs,'src'),alt=htmlAttr(attrs,'alt'),embedded=src?dataImage(src,imageIndex,htmlAttr(attrs,'title')):undefined;
      order+=1;
      if(embedded){assets.push(embedded);blocks.push({id:`html-image-${imageIndex}`,type:'IMAGE',text:alt||embedded.reference.name,order,asset:embedded.reference,source:{format:'HTML',raw:{src:'data-uri',alt,sourceOffset:match.index??0}}});}
      else{blocks.push({id:`html-image-${imageIndex}`,type:'IMAGE',text:alt||src||`Imagen ${imageIndex}`,order,source:{format:'HTML',raw:{src,alt,unmaterialized:true,sourceOffset:match.index??0}}});warnings.push({path:`html.images[${imageIndex-1}]`,message:`Image bytes were not embedded in the HTML source and were not fetched: ${src??'(missing src)'}`,level:'WARNING'});}
    }
    if(!blocks.length){const value=stripMarkup(source);if(value)blocks.push({id:'html-block-1',type:'PARAGRAPH',text:value,order:1,source:{format:'HTML',raw:{fallback:true}}});}
    const title=stripMarkup(source.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1]??'')||blocks.find(block=>block.type==='TITLE')?.text;
    const language=htmlAttr(source.match(/<html\b([^>]*)>/i)?.[1]??'','lang');
    return{document:finalizeCanonicalDocument({source:input,format:'HTML',strategy:'HTML',blocks,tables,metadata:{title,language},warnings,raw:{parser:'P2LRN_HTML_V1'}}),assets};
  }
};

function preformattedExtractor(format:'JSON'|'YAML'|'XML',strategy:'JSON'|'YAML'|'XML',validate:(source:string)=>void,titleOf?:(source:string)=>string|undefined):DocumentExtractor{
  return{id:`p2lrn.${format.toLowerCase()}.v1`,formats:[format],async extract(input){const source=text(input).trim();if(!source)throw new Error(`${format} document is empty.`);validate(source);const title=titleOf?.(source);return{document:finalizeCanonicalDocument({source:input,format,strategy,blocks:[{id:`${format.toLowerCase()}-1`,type:'PARAGRAPH',text:source,order:1,source:{format,raw:{role:'CODE_BLOCK',language:format.toLowerCase(),preserveWhitespace:true}}}],metadata:{title},raw:{parser:`P2LRN_${format}_V1`}}),assets:[]};}};
}
export const jsonExtractor=preformattedExtractor('JSON','JSON',source=>{try{JSON.parse(source);}catch(error){throw new Error(`JSON cannot be parsed: ${error instanceof Error?error.message:String(error)}`);}},source=>{try{const value=JSON.parse(source);return value&&typeof value==='object'&&!Array.isArray(value)&&typeof value.title==='string'?value.title:undefined;}catch{return undefined;}});
export const yamlExtractor=preformattedExtractor('YAML','YAML',source=>{if(/^\s*[\[{]/.test(source))return;if(!source.split('\n').some(line=>/^\s*(?:[-?]\s+|[^#\s][^:]*:\s*)/.test(line)))throw new Error('YAML source has no recognizable mapping or sequence structure.');},source=>source.match(/^\s*(?:title|titulo)\s*:\s*['"]?([^'"\n#]+)['"]?/im)?.[1]?.trim());
export const xmlExtractor=preformattedExtractor('XML','XML',source=>{if(!/^\s*<\?xml\b|^\s*<[A-Za-z_:]/i.test(source)||!/<\/[^>]+>|\/\s*>/.test(source))throw new Error('XML source has no recognizable document element.');},source=>stripMarkup(source.match(/<(?:title|dc:title)\b[^>]*>([\s\S]*?)<\/(?:title|dc:title)\s*>/i)?.[1]??'')||undefined);

function parseCsv(source:string):string[][]{
  const rows:string[][]=[];let row:string[]=[],field='',quoted=false;
  for(let i=0;i<source.length;i++){const ch=source[i]!;
    if(quoted){if(ch==='"'&&source[i+1]==='"'){field+='"';i+=1;}else if(ch==='"')quoted=false;else field+=ch;continue;}
    if(ch==='"'){quoted=true;continue;}if(ch===','){row.push(field);field='';continue;}if(ch==='\n'){row.push(field);field='';if(row.some(cell=>cell.length))rows.push(row);row=[];continue;}field+=ch;
  }
  if(quoted)throw new Error('CSV contains an unterminated quoted field.');
  row.push(field);if(row.some(cell=>cell.length)||rows.length===0)rows.push(row);return rows;
}
export const csvExtractor:DocumentExtractor={
  id:'p2lrn.csv.v1',formats:['CSV'],async extract(input){const source=text(input);if(!source.trim())throw new Error('CSV document is empty.');const matrix=parseCsv(source),width=Math.max(1,...matrix.map(row=>row.length)),columns=uniqueColumns(Array.from({length:width},(_,i)=>matrix[0]?.[i]??'')),data=matrix.slice(1),table:CanonicalTable={id:'csv-table-1',order:1,name:basename(input.name),columns,rows:data.map(row=>Object.fromEntries(columns.map((column,i)=>[column,row[i]??'']))),cells:{headers:[columns.map(value=>({text:value,header:true}))],rows:data.map(row=>row.map(value=>({text:value})))},source:{format:'CSV',raw:{delimiter:',',rows:matrix.length}}};return{document:finalizeCanonicalDocument({source:input,format:'CSV',strategy:'CSV_TABLE',blocks:[{id:'csv-table-block-1',type:'TABLE',text:table.name??'Tabla',order:1,source:{format:'CSV',raw:{tableId:table.id}}}],tables:[table],metadata:{title:basename(input.name)},raw:{parser:'P2LRN_CSV_V1'}}),assets:[]};}
};

function rtfPlain(source:string):string{
  let value=source;
  value=value.replace(/\{\\(?:fonttbl|colortbl|stylesheet|info)\b[\s\S]*?\}/gi,' ');
  value=value.replace(/\\'([0-9a-f]{2})/gi,(_m,hex)=>String.fromCharCode(parseInt(hex,16)));
  value=value.replace(/\\u(-?\d+)\??/g,(_m,n)=>String.fromCharCode((Number(n)+65536)%65536));
  value=value.replace(/\\(?:par|pard)\b\s?/gi,'\n\n').replace(/\\line\b\s?/gi,'\n').replace(/\\tab\b\s?/gi,'\t');
  value=value.replace(/\\([{}\\])/g,'$1').replace(/\\[A-Za-z]+-?\d*\s?/g,' ').replace(/[{}]/g,' ');
  return value.split('\n').map(line=>line.replace(/[ \t]+/g,' ').trim()).join('\n').replace(/\n{3,}/g,'\n\n').trim();
}
export const rtfExtractor:DocumentExtractor={
  id:'p2lrn.rtf.v1',formats:['RTF'],async extract(input){const source=text(input);if(!/^\s*\{\\rtf\d+/i.test(source))throw new Error('RTF header is missing.');const plain=rtfPlain(source),paragraphs=plain.split(/\n\s*\n/).map(value=>value.trim()).filter(Boolean),blocks=paragraphs.map((value,index)=>({id:`rtf-${index+1}`,type:'PARAGRAPH' as const,text:value,order:index+1,source:{format:'RTF' as const,raw:{paragraph:index+1}}}));const warnings=/\\pict\b/i.test(source)?[{path:'rtf.pict',message:'RTF contains embedded picture data; this baseline parser preserves text but does not materialize RTF picture groups.',level:'WARNING' as const}]:[];return{document:finalizeCanonicalDocument({source:input,format:'RTF',strategy:'RTF',blocks,metadata:{title:blocks[0]?.text.slice(0,160)},warnings,raw:{parser:'P2LRN_RTF_V1'}}),assets:[]};}
};

function texPlain(source:string):string{
  let value=source.replace(/(^|[^\\])%.*$/gm,'$1');
  for(let i=0;i<6;i++){const next=value.replace(/\\[A-Za-z@]+\*?(?:\[[^\]]*\])?\{([^{}]*)\}/g,'$1');if(next===value)break;value=next;}
  value=value.replace(/\\(?:begin|end)\{[^}]+\}/g,'\n').replace(/\\[A-Za-z@]+\*?(?:\[[^\]]*\])?/g,' ').replace(/[{}]/g,'');
  return value.replace(/[ \t]+/g,' ').replace(/\n[ \t]+/g,'\n').trim();
}
export const texExtractor:DocumentExtractor={
  id:'p2lrn.tex.v1',formats:['TEX'],async extract(input){const source=text(input);if(!source.trim())throw new Error('TeX document is empty.');const blocks:CanonicalBlock[]=[];let order=0,cursor=0;const heading=/\\(chapter|section|subsection|subsubsection)\*?\{([^{}]+)\}/g;
    const pushBody=(raw:string)=>{const chunks=raw.split(/\\item\b/g);const intro=texPlain(chunks.shift()??'');for(const p of intro.split(/\n\s*\n/).map(v=>v.trim()).filter(Boolean)){order+=1;blocks.push({id:`tex-${order}`,type:'PARAGRAPH',text:p,order,source:{format:'TEX',raw:{sourceOffset:cursor}}});}for(const item of chunks){const value=texPlain(item).split(/\n\s*\n/)[0]?.trim();if(value){order+=1;blocks.push({id:`tex-${order}`,type:'LIST',text:value,order,source:{format:'TEX',raw:{sourceOffset:cursor}}});}}};
    for(const match of source.matchAll(heading)){pushBody(source.slice(cursor,match.index??cursor));const level=match[1]==='subsubsection'?3:match[1]==='subsection'?2:1;order+=1;blocks.push({id:`tex-${order}`,type:'TITLE',text:texPlain(match[2]??''),order,level,source:{format:'TEX',raw:{command:match[1],sourceOffset:match.index??0}}});cursor=(match.index??0)+match[0].length;}pushBody(source.slice(cursor));if(!blocks.length){const value=texPlain(source);if(value)blocks.push({id:'tex-1',type:'PARAGRAPH',text:value,order:1,source:{format:'TEX'}});}const warnings=/\\includegraphics\b/.test(source)?[{path:'tex.includegraphics',message:'TeX references graphics; external graphics are not fetched by the neutral reader.',level:'WARNING' as const}]:[];return{document:finalizeCanonicalDocument({source:input,format:'TEX',strategy:'TEX',blocks,metadata:{title:blocks.find(b=>b.type==='TITLE')?.text},warnings,raw:{parser:'P2LRN_TEX_V1'}}),assets:[]};}
};
