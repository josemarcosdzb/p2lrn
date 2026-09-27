import {finalizeCanonicalDocument} from '../finalize.js';
import type {DocumentExtractor} from '../contracts.js';
import type {CanonicalBlock,SourceDocumentInput} from '../types.js';

function clean(value:string):string{return value.replace(/\u0000/g,'').replace(/\r\n?/g,'\n').trim();}
function paragraphize(text:string):Array<{text:string;line:number}>{
  const out:Array<{text:string;line:number}>=[];let pending:string[]=[];let start=1;
  const flush=()=>{const value=pending.join(' ').replace(/\s+/g,' ').trim();if(value)out.push({text:value,line:start});pending=[];};
  text.split('\n').forEach((raw,index)=>{const line=raw.trim();if(!line){flush();start=index+2;return;}if(!pending.length)start=index+1;pending.push(line);});
  flush();return out;
}
export const plainTextExtractor:DocumentExtractor={
  id:'p2lrn.plain-text.v1',formats:['TXT'],
  async extract(input:SourceDocumentInput,detection){
    const text=clean(new TextDecoder('utf-8',{fatal:false}).decode(input.bytes));if(!text)throw new Error('Text document is empty.');
    const paras=paragraphize(text);
    const blocks:CanonicalBlock[]=paras.map((p,index)=>({id:`txt-${index+1}`,type:'PARAGRAPH',text:p.text,order:index+1,source:{format:'TXT',raw:{lineStart:p.line}}}));
    return{document:finalizeCanonicalDocument({source:input,format:'TXT',strategy:'TXT_LINES',blocks}),assets:[]};
  }
};
