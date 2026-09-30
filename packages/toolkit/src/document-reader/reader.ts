import {readFileSync} from 'node:fs';
import {extname} from 'node:path';
import {detectDocumentType} from './detect.js';
import {readDocx} from './docx.js';
import {readPdf} from './pdf.js';
import {readPptx} from './pptx.js';
import {readTextDocument} from './text.js';
import type {DocumentReaderInput, DocumentReaderOptions, LightweightExtractedDocument} from './types.js';
import {ensureLimits, normalizeBytes} from './utils.js';

const DEFAULT_MAX_INPUT_BYTES=512*1024*1024;

function inferredMediaType(name:string):string {
  const ext=extname(name).replace(/^\./u,'').toLowerCase();
  return ({
    pdf:'application/pdf',
    docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt:'text/plain',
    md:'text/markdown',
    markdown:'text/markdown',
    html:'text/html',
    htm:'text/html',
    rtf:'application/rtf',
    tex:'application/x-tex',
    xml:'application/xml',
    yaml:'application/yaml',
    yml:'application/yaml',
    json:'application/json',
    csv:'text/csv',
  } as Record<string,string>)[ext]??'application/octet-stream';
}

export async function readDocument(
  input:DocumentReaderInput,
  options:DocumentReaderOptions={},
):Promise<LightweightExtractedDocument> {
  const normalized:DocumentReaderInput={
    ...input,
    bytes:normalizeBytes(input.bytes),
    mediaType:input.mediaType||inferredMediaType(input.name),
  };
  ensureLimits(normalized,options.limits?.maxInputBytes??DEFAULT_MAX_INPUT_BYTES);
  const detection=detectDocumentType(normalized);

  switch(detection.type){
    case 'DOCX':
      return readDocx(normalized,detection,options);
    case 'PPTX':
      return readPptx(normalized,detection,options);
    case 'PDF':
      if(options.pdf?.enabled===false){
        throw new Error('PDF support is disabled for this lightweight Reader invocation.');
      }
      return readPdf(normalized,detection);
    case 'TXT':
    case 'MARKDOWN':
    case 'HTML':
    case 'RTF':
    case 'TEX':
    case 'XML':
    case 'YAML':
    case 'JSON':
    case 'CSV':
      return readTextDocument(normalized,detection);
  }
}

export async function readDocumentFile(
  path:string,
  options:DocumentReaderOptions={},
):Promise<LightweightExtractedDocument> {
  const bytes=new Uint8Array(readFileSync(path));
  return readDocument({name:path,mediaType:inferredMediaType(path),bytes},options);
}
