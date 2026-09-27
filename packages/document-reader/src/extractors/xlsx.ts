import {basename} from 'node:path';
import {finalizeCanonicalDocument} from '../finalize.js';
import {bytesText,readZipEntries} from '../office/zip.js';
import {attr,blocks,normalizeOfficePath,officeRelationships,xmlDecode,xmlText} from '../office/xml.js';
import type {DocumentExtractor} from '../contracts.js';
import type {CanonicalBlock,CanonicalTable,SourceDocumentInput} from '../types.js';

function uniqueColumns(values:string[]):string[]{const seen=new Map<string,number>();return values.map((value,index)=>{const base=value.trim()||`Columna ${index+1}`,n=(seen.get(base)??0)+1;seen.set(base,n);return n===1?base:`${base} ${n}`;});}
function columnIndex(ref:string):number{
  const letters=ref.match(/^([A-Z]+)/i)?.[1]?.toUpperCase();if(!letters)return-1;
  let value=0;for(const ch of letters)value=value*26+(ch.charCodeAt(0)-64);return value-1;
}
function sharedStrings(xml:string):string[]{return blocks(xml,'si').map(item=>xmlText(item.xml,['t']));}
function cellText(cell:string,shared:string[]):string{
  const open=cell.match(/<c\b([^>]*)>/i)?.[1]??'',type=attr(open,'t')??'',formula=xmlDecode(cell.match(/<f\b[^>]*>([\s\S]*?)<\/f\s*>/i)?.[1]??'').trim();
  if(formula)return'='+formula;
  if(type==='inlineStr')return xmlText(cell,['t']);
  const raw=xmlDecode(cell.match(/<v\b[^>]*>([\s\S]*?)<\/v\s*>/i)?.[1]??'').trim();
  if(type==='s'){const index=Number(raw);return Number.isInteger(index)&&index>=0?shared[index]??raw:raw;}
  if(type==='b')return raw==='1'?'TRUE':raw==='0'?'FALSE':raw;
  return raw;
}
function sheetMatrix(xml:string,shared:string[]):string[][]{
  const matrix:string[][]=[];
  for(const row of blocks(xml,'row')){
    const values:string[]=[];
    let fallback=0;
    for(const match of row.xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c\s*>|<c\b([^>]*)\/\s*>/gi)){
      const attrs=match[1]??match[3]??'',ref=attr(attrs,'r'),index=ref?columnIndex(ref):fallback;
      if(index<0)continue;
      values[index]=cellText(match[0],shared);fallback=index+1;
    }
    if(values.some(value=>String(value??'').length))matrix.push(values.map(value=>value??''));
  }
  return matrix;
}
function workbookSheets(xml:string):Array<{name:string;rid:string;state?:string}>{
  return[...xml.matchAll(/<sheet\b([^>]*)\/?\s*>/gi)].map(match=>{const attrs=match[1]??'';return{name:attr(attrs,'name')??'Hoja',rid:attr(attrs,'r:id')??'',state:attr(attrs,'state')};}).filter(sheet=>Boolean(sheet.rid));
}
function tableForSheet(name:string,index:number,matrix:string[][],hidden:boolean,path:string):CanonicalTable{
  const width=Math.max(1,...matrix.map(row=>row.length)),first=matrix[0]??[],columns=uniqueColumns(Array.from({length:width},(_,i)=>first[i]??'')),data=matrix.slice(1);
  return{id:`xlsx-table-${index}`,order:index,name,columns,rows:data.map(row=>Object.fromEntries(columns.map((column,i)=>[column,row[i]??'']))),cells:{headers:first.length?[first.map(value=>({text:value,header:true}))]:[],rows:data.map(row=>row.map(value=>({text:value})))},sheet:name,source:{format:'XLSX',raw:{sheetName:name,hidden,internalFile:path}}};
}
export const xlsxExtractor:DocumentExtractor={
  id:'p2lrn.xlsx.v1',formats:['XLSX'],
  async extract(input,_detection,context){
    const entries=await readZipEntries(input.bytes,{maxFiles:context.maxFiles,maxUncompressedBytes:context.maxUncompressedBytes});
    const workbook=bytesText(entries,'xl/workbook.xml');if(!workbook)throw new Error('XLSX has no xl/workbook.xml.');
    const rels=officeRelationships(bytesText(entries,'xl/_rels/workbook.xml.rels'),'xl/workbook.xml');
    const shared=sharedStrings(bytesText(entries,'xl/sharedStrings.xml'));
    const sheets=workbookSheets(workbook),tables:CanonicalTable[]=[],blocksOut:CanonicalBlock[]=[],warnings=[] as Array<{path:string;message:string;level:'WARNING'}>;
    let order=0;
    for(let index=0;index<sheets.length;index++){
      const sheet=sheets[index]!,path=rels.get(sheet.rid);if(!path){warnings.push({path:`xlsx.sheets[${index}]`,message:`Worksheet relationship is missing for ${sheet.name}: ${sheet.rid}`,level:'WARNING'});continue;}
      const xml=bytesText(entries,path);if(!xml){warnings.push({path:`xlsx.sheets[${index}]`,message:`Worksheet XML is missing: ${path}`,level:'WARNING'});continue;}
      const matrix=sheetMatrix(xml,shared);if(!matrix.length){warnings.push({path:`xlsx.sheets[${index}]`,message:`Worksheet has no non-empty cells: ${sheet.name}`,level:'WARNING'});continue;}
      order+=1;const table=tableForSheet(sheet.name,tables.length+1,matrix,sheet.state==='hidden'||sheet.state==='veryHidden',path);table.order=order;tables.push(table);
      blocksOut.push({id:`xlsx-table-block-${tables.length}`,type:'TABLE',text:sheet.name,order,sheet:sheet.name,source:{format:'XLSX',raw:{tableId:table.id,internalFile:path,hidden:table.source?.raw?.hidden===true}}});
    }
    if([...entries.keys()].some(path=>/^xl\/(?:drawings|media)\//i.test(path)))warnings.push({path:'xlsx.drawings',message:'XLSX contains drawings or media; cell/table content is extracted, but workbook drawing placement is not yet materialized by this extractor.',level:'WARNING'});
    warnings.push({path:'xlsx.formatting',message:'XLSX cell values and formulas are preserved as text; Excel display number/date formatting is not applied by the neutral extractor.',level:'WARNING'});
    return{document:finalizeCanonicalDocument({source:input,format:'XLSX',strategy:'XLSX_WORKBOOK',blocks:blocksOut,tables,metadata:{title:basename(input.name),sheets:sheets.map(sheet=>sheet.name)},warnings,raw:{parser:'P2LRN_XLSX_V1',sharedStrings:shared.length}}),assets:[]};
  }
};
