import {finalizeCanonicalDocument} from '../finalize.js';
import type {DocumentExtractor} from '../contracts.js';
import type {CanonicalBlock,CanonicalTable,SourceDocumentInput} from '../types.js';

function inline(text:string):string{return text
  .replace(/!\[([^\]]*)\]\(([^)]+)\)/g,(_m,a,u)=>`${String(a).trim()||'Image'} [image: ${String(u).trim()}]`)
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g,(_m,l,u)=>`${String(l).trim()} (${String(u).trim()})`)
  .replace(/\`([^\`]+)\`/g,'$1').replace(/(?:\*\*|__)(.+?)(?:\*\*|__)/g,'$1').replace(/(?:\*|_)(.+?)(?:\*|_)/g,'$1')
  .replace(/\\([\\`*_[\]{}()#+\-.!|>])/g,'$1').replace(/\s+/g,' ').trim();}
function cells(line:string):string[]{let v=line.trim();if(v.startsWith('|'))v=v.slice(1);if(v.endsWith('|'))v=v.slice(0,-1);const out:string[]=[];let cur='',esc=false;for(const ch of v){if(esc){cur+=ch;esc=false;}else if(ch==='\\')esc=true;else if(ch==='|'){out.push(cur.trim());cur='';}else cur+=ch;}out.push(cur.trim());return out;}
function isSep(line:string):boolean{const c=cells(line);return c.length>=2&&c.every(x=>/^\s*:?-{3,}:?\s*$/.test(x));}
function uniqueColumns(values:string[]):string[]{const used=new Map<string,number>();return values.map((v,i)=>{const base=inline(v)||`Column ${i+1}`;const n=(used.get(base)??0)+1;used.set(base,n);return n===1?base:`${base} ${n}`;});}

export const markdownExtractor:DocumentExtractor={
  id:'p2lrn.markdown.v1',formats:['MARKDOWN'],
  async extract(input:SourceDocumentInput){
    const source=new TextDecoder('utf-8',{fatal:false}).decode(input.bytes).replace(/\r\n?/g,'\n');
    if(!source.trim())throw new Error('Markdown document is empty.');
    const lines=source.split('\n'),blocks:CanonicalBlock[]=[],tables:CanonicalTable[]=[];let paragraph:string[]=[];let paragraphLine=1;let inCode=false,code:string[]=[],codeLine=1,language:string|undefined;
    const flushParagraph=()=>{if(!paragraph.length)return;const text=inline(paragraph.join(' '));paragraph=[];if(text)blocks.push({id:`md-b${blocks.length+1}`,type:'PARAGRAPH',text,order:blocks.length+1,source:{format:'MARKDOWN',raw:{role:'PARAGRAPH',lineStart:paragraphLine}}});};
    const flushCode=()=>{const text=code.join('\n').trimEnd();code=[];if(text)blocks.push({id:`md-b${blocks.length+1}`,type:'PARAGRAPH',text,order:blocks.length+1,source:{format:'MARKDOWN',raw:{role:'CODE_BLOCK',language,lineStart:codeLine,preserveWhitespace:true}}});};
    for(let i=0;i<lines.length;i++){
      const raw=lines[i]??'',trim=raw.trimEnd(),fence=trim.trim().match(/^(```+|~~~+)\s*([^\s]*)?.*$/);
      if(fence){flushParagraph();if(!inCode){inCode=true;language=fence[2]||undefined;codeLine=i+2;}else{flushCode();inCode=false;language=undefined;}continue;}
      if(inCode){code.push(raw);continue;}
      if(!trim.trim()){flushParagraph();continue;}
      const next=lines[i+1]?.trim()??'';
      if(trim.includes('|')&&isSep(next)){
        flushParagraph();const head=cells(trim),cols=uniqueColumns(head),rows:string[][]=[];let end=i+1;
        for(let j=i+2;j<lines.length;j++){const l=lines[j]?.trim()??'';if(!l||!l.includes('|'))break;const c=cells(l);if(!c.length)break;rows.push(Array.from({length:cols.length},(_,k)=>inline(c[k]??'')));end=j;}
        if(rows.length){tables.push({id:`md-t${tables.length+1}`,order:blocks.length+tables.length+1,name:`Table ${tables.length+1}`,columns:cols,rows:rows.map(r=>Object.fromEntries(cols.map((col,k)=>[col,r[k]??'']))),source:{format:'MARKDOWN',raw:{lineStart:i+1,lineEnd:end+1}}});blocks.push({id:`md-table-ref-${tables.length}`,type:'TABLE',text:tables.at(-1)!.name??'',order:blocks.length+1,source:{format:'MARKDOWN',raw:{tableId:tables.at(-1)!.id}}});i=end;continue;}
      }
      const h=trim.trim().match(/^(#{1,6})\s+(.+?)\s*#*$/);if(h){flushParagraph();blocks.push({id:`md-b${blocks.length+1}`,type:'TITLE',text:inline(h[2]!),level:h[1]!.length,order:blocks.length+1,source:{format:'MARKDOWN',raw:{headingLevel:h[1]!.length,line:i+1}}});continue;}
      if(trim.trim()&&/^(?:=+|-+)\s*$/.test(next)){flushParagraph();blocks.push({id:`md-b${blocks.length+1}`,type:'TITLE',text:inline(trim.trim()),level:next.startsWith('=')?1:2,order:blocks.length+1,source:{format:'MARKDOWN',raw:{headingLevel:next.startsWith('=')?1:2,line:i+1}}});i++;continue;}
      const list=raw.match(/^(\s*)(?:[-*+]\s+|(\d+)[.)]\s+)(.+)$/);if(list){flushParagraph();blocks.push({id:`md-b${blocks.length+1}`,type:'LIST',text:inline(list[3]!),order:blocks.length+1,source:{format:'MARKDOWN',raw:{line:i+1,listLevel:Math.floor((list[1]?.replace(/\t/g,'  ').length??0)/2),ordered:Boolean(list[2]),ordinal:list[2]?Number(list[2]):undefined}}});continue;}
      const quote=raw.match(/^\s*>\s?(.*)$/);if(quote){flushParagraph();blocks.push({id:`md-b${blocks.length+1}`,type:'PARAGRAPH',text:inline(quote[1]!),order:blocks.length+1,source:{format:'MARKDOWN',raw:{role:'BLOCKQUOTE',line:i+1}}});continue;}
      if(/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(raw)){flushParagraph();blocks.push({id:`md-b${blocks.length+1}`,type:'SEPARATOR',text:'',order:blocks.length+1,source:{format:'MARKDOWN',raw:{line:i+1}}});continue;}
      if(!paragraph.length)paragraphLine=i+1;paragraph.push(trim.trim());
    }
    flushParagraph();if(inCode||code.length)flushCode();
    const title=blocks.find(b=>b.type==='TITLE')?.text;
    return{document:finalizeCanonicalDocument({source:input,format:'MARKDOWN',strategy:'MARKDOWN',blocks,tables,metadata:{title},raw:{parser:'P2LRN_MARKDOWN_V1'}}),assets:[]};
  }
};
