import {detectDocumentType} from './detect.js';
import {extractDocx} from './docx.js';
import {extractPdfText} from './pdf.js';
import {extractPptx} from './pptx.js';
import {extractStructuredText} from './structured-text.js';
import type {DocumentReaderInput,DocumentReaderOptions,ExtractedDocument} from './types.js';

export class LightweightDocumentReader {
  constructor(private readonly options:DocumentReaderOptions={}){}

  detect(input:DocumentReaderInput){
    return detectDocumentType(input);
  }

  async read(input:DocumentReaderInput):Promise<ExtractedDocument>{
    if(!(input.data instanceof Uint8Array)) throw new TypeError('DocumentReaderInput.data must be a Uint8Array.');
    if(!input.name?.trim()) throw new TypeError('DocumentReaderInput.name is required.');
    const type=this.detect(input);
    switch(type){
      case 'DOCX': return extractDocx(input);
      case 'PPTX': return extractPptx(input);
      case 'PDF':
        if(this.options.pdfTextAdapter==='disabled'){
          throw new Error('PDF extraction is disabled for this lightweight document reader instance.');
        }
        return extractPdfText(input);
      case 'TXT':
      case 'MARKDOWN':
      case 'HTML':
      case 'RTF':
      case 'TEX':
      case 'XML':
      case 'YAML':
      case 'ODT':
      case 'EPUB':
        return extractStructuredText(input,type);
    }
  }
}

export async function readDocument(input:DocumentReaderInput,options:DocumentReaderOptions={}):Promise<ExtractedDocument>{
  return new LightweightDocumentReader(options).read(input);
}
