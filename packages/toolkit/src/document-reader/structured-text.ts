import path from 'node:path';
import {ZipArchive} from '../core/zip.js';
import {decodeTextInput,documentZipLimits,readArchiveText} from './limits.js';
import type {DocumentBlock,DocumentReaderFileType,DocumentReaderInput,DocumentReaderLimits,DocumentReaderStrategy,ExtractedDocument} from './types.js';
import {cleanText,decodeXml,readerId,xmlAttributes} from './utils.js';

function lines(value:string):string[]{
  return cleanText(value).split('\n').map(line=>line.replace(/\s+/g,' ').trim()).filter(Boolean);
}

function htmlText(html:string):string{
  return decodeXml(html)
    .replace(/<script\b[\s\S]*?<\/script>/gi,'\n')
    .replace(/<style\b[\s\S]*?<\/style>/gi,'\n')
    .replace(/<\/(?:h[1-6]|p|div|li|tr|section|article)>/gi,'\n')
    .replace(/<br\s*\/?>/gi,'\n')
    .replace(/<[^>]+>/g,' ');
}

function xmlToText(xml:string):string{
  return decodeXml(xml)
    .replace(/<\?xml[\s\S]*?\?>/gi,'\n')
    .replace(/<\/(?:title|titulo|description|descripcion|content|contenido|lesson|leccion|module|modulo|question|pregunta|option|opcion|p|text:p)>/gi,'\n')
    .replace(/<[^>]+>/g,' ');
}

function rtfText(rtf:string):string{
  return rtf
    .replace(/\\'[0-9a-fA-F]{2}/g,match=>String.fromCharCode(parseInt(match.slice(2),16)))
    .replace(/\\par[d]?/g,'\n')
    .replace(/\\line/g,'\n')
    .replace(/\{\\\*[\s\S]*?\}/g,'')
    .replace(/[{}]/g,'')
    .replace(/\\[a-zA-Z]+-?\d* ?/g,'')
    .replace(/\\./g,'');
}

function texText(tex:string):string{
  return tex
    .replace(/\\(?:chapter|section|subsection|subsubsection)\*?\{([^{}]+)\}/g,'\n$1\n')
    .replace(/\\(?:title|author|date)\{([^{}]+)\}/g,'\n$1\n')
    .replace(/\\begin\{[^{}]+\}|\\end\{[^{}]+\}/g,'\n')
    .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?(?:\{([^{}]*)\})?/g,'$1')
    .replace(/\\([_#%&{}])/g,'$1');
}

function yamlText(yaml:string):string{
  return yaml.split(/\r?\n/).map(line=>line
    .replace(/^\s*-\s*/,'')
    .replace(/^\s*(?:title|titulo|description|descripcion|content|contenido)\s*:\s*/i,'')
    .replace(/^['"]|['"],?$/g,'')
    .replace(/\\n/g,'\n').trim()).filter(Boolean).join('\n');
}

function markdownBlocks(markdown:string,type:DocumentReaderFileType):DocumentBlock[]{
  const out:DocumentBlock[]=[];
  for(const raw of markdown.split(/\r?\n/)){
    const line=raw.trim();
    if(!line) continue;
    const heading=/^(#{1,6})\s+(.+)$/.exec(line);
    const list=/^(?:[-*+]\s+|\d+[.)]\s+)(.+)$/.exec(line);
    if(heading){
      out.push({id:readerId('md_title'),type:'TITLE',text:heading[2]!.trim(),level:heading[1]!.length,order:out.length+1,source:{type}});
    }else if(list){
      out.push({id:readerId('md_list'),type:'LIST',text:list[1]!.trim(),order:out.length+1,source:{type}});
    }else{
      out.push({id:readerId('md_paragraph'),type:'PARAGRAPH',text:line,order:out.length+1,source:{type}});
    }
  }
  return out;
}

function basicBlocks(text:string,type:DocumentReaderFileType):DocumentBlock[]{
  return lines(text).map((line,index)=>{
    const title=index<12&&line.length<=120&&!/[.;,:]$/.test(line);
    return {
      id:readerId(title?'text_title':'text_paragraph'),
      type:title?'TITLE':'PARAGRAPH',
      text:line,order:index+1,level:title?Math.min(index+1,3):undefined,
      source:{type},
    } satisfies DocumentBlock;
  });
}

function epubDocuments(archive:ZipArchive,limits:DocumentReaderLimits):string[]{
  const names=archive.names();
  const opfName=names.find(name=>/\.opf$/i.test(name));
  if(opfName){
    const base=path.posix.dirname(opfName);
    const opf=readArchiveText(archive,opfName,limits,'EPUB package document');
    const manifest=new Map<string,{href:string;properties:string;mediaType:string}>();
    for(const match of opf.matchAll(/<item\b[^>]*>/gi)){
      const a=xmlAttributes(match[0]);
      if(a.id&&a.href) manifest.set(a.id,{href:a.href,properties:a.properties??'',mediaType:a['media-type']??''});
    }
    const ordered:string[]=[];
    for(const match of opf.matchAll(/<itemref\b[^>]*>/gi)){
      const id=xmlAttributes(match[0]).idref;
      const item=id?manifest.get(id):undefined;
      if(!item) continue;
      if(/\bnav\b/i.test(item.properties)) continue;
      if(item.mediaType&&!/(?:xhtml|html|xml)$/i.test(item.mediaType)) continue;
      const resolved=path.posix.normalize(path.posix.join(base,item.href)).replace(/^\/+/, '');
      if(archive.entries.has(resolved)&&!ordered.includes(resolved)) ordered.push(resolved);
    }
    if(ordered.length){
      if(ordered.length>limits.maxEpubDocuments) throw new Error(`EPUB exceeds lightweight reader document limit (${ordered.length} > ${limits.maxEpubDocuments}).`);
      return ordered;
    }
  }
  const fallback=names.filter(name=>/\.(?:xhtml|html|htm)$/i.test(name)&&!/(^|\/)(?:nav|toc|landmarks|cover|title_page)\.(?:xhtml|html|htm)$/i.test(name))
    .sort((a,b)=>a.localeCompare(b,'en',{numeric:true,sensitivity:'base'}));
  if(fallback.length>limits.maxEpubDocuments) throw new Error(`EPUB exceeds lightweight reader document limit (${fallback.length} > ${limits.maxEpubDocuments}).`);
  return fallback;
}

function extractText(input:DocumentReaderInput,type:DocumentReaderFileType,limits:DocumentReaderLimits):{text:string;strategy:DocumentReaderStrategy}{
  switch(type){
    case 'TXT': {
      const text=decodeTextInput(input,limits,type);
      return {text,strategy:'TXT_LINES'};
    }
    case 'MARKDOWN': {
      const text=decodeTextInput(input,limits,type);
      return {text,strategy:'MARKDOWN_LINES'};
    }
    case 'HTML': {
      const text=decodeTextInput(input,limits,type);
      return {text:htmlText(text),strategy:'HTML_TEXT'};
    }
    case 'RTF': {
      const text=decodeTextInput(input,limits,type);
      return {text:rtfText(text),strategy:'RTF_TEXT'};
    }
    case 'TEX': {
      const text=decodeTextInput(input,limits,type);
      return {text:texText(text),strategy:'TEX_TEXT'};
    }
    case 'XML': {
      const text=decodeTextInput(input,limits,type);
      return {text:xmlToText(text),strategy:'XML_TEXT'};
    }
    case 'YAML': {
      const text=decodeTextInput(input,limits,type);
      return {text:yamlText(text),strategy:'YAML_TEXT'};
    }
    case 'ODT': {
      const archive=ZipArchive.open(input.data,documentZipLimits(limits));
      if(!archive.entries.has('content.xml')) throw new Error('ODT does not contain content.xml.');
      return {text:xmlToText(readArchiveText(archive,'content.xml',limits,'ODT content.xml')),strategy:'ODT_XML'};
    }
    case 'EPUB': {
      const archive=ZipArchive.open(input.data,documentZipLimits(limits));
      const docs=epubDocuments(archive,limits);
      if(!docs.length) throw new Error('EPUB contains no readable XHTML/HTML documents.');
      return {text:docs.map(name=>htmlText(readArchiveText(archive,name,limits,`EPUB ${name}`))).join('\n'),strategy:'EPUB_XHTML'};
    }
    default: throw new Error(`Structured text extractor does not support ${type}.`);
  }
}

export function extractStructuredText(input:DocumentReaderInput,type:Exclude<DocumentReaderFileType,'PDF'|'DOCX'|'PPTX'>,limits:DocumentReaderLimits):ExtractedDocument{
  const extracted=extractText(input,type,limits);
  const blocks=type==='MARKDOWN'?markdownBlocks(extracted.text,type):basicBlocks(extracted.text,type);
  if(!blocks.length) throw new Error(`${type} contains no readable text.`);
  return {
    version:'p2lrn.document-reader.v1',
    source:{name:input.name,extension:input.name.split('.').pop()?.toLowerCase(),mediaType:input.mediaType,detectedType:type,strategy:extracted.strategy},
    metadata:{detectedTitle:blocks.find(block=>block.type==='TITLE')?.text??blocks[0]?.text},
    blocks,tables:[],warnings:[],
  };
}
