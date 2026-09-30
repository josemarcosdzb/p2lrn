import {extname} from 'node:path';
import type {DocumentReaderDetection, DocumentReaderInput, DocumentReaderType} from './types.js';

const SUPPORTED = new Set<DocumentReaderType>([
  'PDF','DOCX','PPTX','TXT','MARKDOWN','HTML','RTF','TEX','XML','YAML','JSON','CSV',
]);

function result(input:DocumentReaderInput,type:DocumentReaderType,confidence:number,reason:string):DocumentReaderDetection {
  const extension=extname(input.name || '').replace(/^\./u,'').toLowerCase();
  return {
    type,
    extension,
    mediaType:String(input.mediaType || '').toLowerCase(),
    name:String(input.name || 'document'),
    confidence,
    reason,
  };
}

export function detectDocumentType(input:DocumentReaderInput):DocumentReaderDetection {
  if (!input?.bytes?.byteLength) throw new Error('Document reader received an empty file.');
  const ext=extname(input.name || '').replace(/^\./u,'').toLowerCase();
  const media=String(input.mediaType || '').toLowerCase();
  const bytes=input.bytes;
  const head=new TextDecoder('utf-8',{fatal:false}).decode(bytes.slice(0,512)).trimStart();

  if (bytes.byteLength >= 5 && new TextDecoder().decode(bytes.slice(0,5)) === '%PDF-') {
    return result(input,'PDF',0.99,'PDF binary signature.');
  }

  const zip=bytes.byteLength>=4 &&
    bytes[0]===0x50 && bytes[1]===0x4b &&
    [0x03,0x05,0x07].includes(bytes[2]??0) &&
    [0x04,0x06,0x08].includes(bytes[3]??0);
  if (zip) {
    if (ext==='docx' || media.includes('wordprocessingml')) {
      return result(input,'DOCX',0.98,'Office Open XML DOCX container.');
    }
    if (ext==='pptx' || media.includes('presentationml')) {
      return result(input,'PPTX',0.98,'Office Open XML PPTX container.');
    }
    throw new Error('Lightweight document reader does not treat generic ZIP packages as documents: ' + input.name + '. Use the P2LRN external-package converter instead.');
  }

  const byExt:Record<string,DocumentReaderType>={
    txt:'TXT',md:'MARKDOWN',markdown:'MARKDOWN',html:'HTML',htm:'HTML',rtf:'RTF',tex:'TEX',
    xml:'XML',yaml:'YAML',yml:'YAML',json:'JSON',csv:'CSV',
  };
  const type=byExt[ext];
  if (type && SUPPORTED.has(type)) return result(input,type,0.9,'Detected from .' + ext + ' extension.');
  if (!ext && (head.startsWith('{')||head.startsWith('['))) return result(input,'JSON',0.75,'JSON-like content without extension.');
  if (head.startsWith('<!doctype html')||/^<html\b/iu.test(head)) return result(input,'HTML',0.75,'HTML content signature.');
  if (/^<\?xml\b/iu.test(head)) return result(input,'XML',0.7,'XML declaration.');

  throw new Error('Unsupported lightweight document type: .' + (ext || 'none'));
}
