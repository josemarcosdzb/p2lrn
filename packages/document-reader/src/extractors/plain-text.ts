import {finalizeCanonicalDocument} from '../finalize.js';
import {inferredHeadingLevel,semanticLineRole} from '../source-lines.js';
import type {DocumentExtractor} from '../contracts.js';
import type {CanonicalBlock,SourceDocumentInput} from '../types.js';

function clean(value:string):string{return value.replace(/\u0000/g,'').replace(/\r\n?/g,'\n').trim();}
interface TextSegment {text:string;line:number;level?:number;role?:'question'|'option'|'solution'|'quiz';}
function paragraphize(text:string):TextSegment[]{
  const out:TextSegment[]=[],pending:string[]=[];let start=1,questionActive=false;
  const flush=()=>{const value=pending.join(' ').replace(/\s+/g,' ').trim();if(value)out.push({text:value,line:start});pending.length=0;};
  text.split('\n').forEach((raw,index)=>{
    const line=raw.trim();
    if(!line){flush();start=index+2;return;}
    const level=inferredHeadingLevel(line),role=semanticLineRole(line);
    const semanticBoundary=role==='question'||role==='solution'||role==='quiz'||(role==='option'&&questionActive);
    if(level||semanticBoundary){
      flush();out.push({text:line,line:index+1,...(level?{level}:{}),...(role?{role}:{})});
      if(role==='question')questionActive=true;
      else if(role==='solution')questionActive=false;
      else if(role!=='option'&&role!=='quiz')questionActive=false;
      start=index+2;return;
    }
    if(!pending.length)start=index+1;
    pending.push(line);
    if(role!=='option')questionActive=false;
  });
  flush();return out;
}
export const plainTextExtractor:DocumentExtractor={
  id:'p2lrn.plain-text.v1',formats:['TXT'],
  async extract(input:SourceDocumentInput){
    const text=clean(new TextDecoder('utf-8',{fatal:false}).decode(input.bytes));if(!text)throw new Error('Text document is empty.');
    const segments=paragraphize(text);
    const blocks:CanonicalBlock[]=segments.map((segment,index)=>({
      id:`txt-${index+1}`,
      type:segment.level||segment.role==='quiz'?'TITLE':'PARAGRAPH',
      text:segment.text,
      order:index+1,
      level:segment.level??(segment.role==='quiz'?3:undefined),
      source:{format:'TXT',raw:{lineStart:segment.line,...(segment.level?{headingLevel:segment.level}:{}),...(segment.role?{semanticLineRole:segment.role}:{})}}
    }));
    return{document:finalizeCanonicalDocument({source:input,format:'TXT',strategy:'TXT_LINES',blocks,metadata:{title:blocks.find(b=>b.type==='TITLE')?.text}}),assets:[]};
  }
};
