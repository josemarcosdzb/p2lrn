import {detectDocumentType} from './detect.js';
import {extractDocx} from './docx.js';
import {extractPdfText} from './pdf.js';
import {extractPptx} from './pptx.js';
import {extractStructuredText} from './structured-text.js';
import {assertDocumentInput,assertExtractedDocumentLimits,normalizeDocumentReaderLimits} from './limits.js';
import type {DocumentReaderInput,DocumentReaderOptions,ExtractedDocument} from './types.js';

export class LightweightDocumentReader {
  constructor(private readonly options:DocumentReaderOptions={}){}

  detect(input:DocumentReaderInput){
    return detectDocumentType(input);
  }

  async read(input:DocumentReaderInput):Promise<ExtractedDocument>{
    const limits=normalizeDocumentReaderLimits(this.options.limits);
    assertDocumentInput(input,limits);
    const type=this.detect(input);
    let result:ExtractedDocument;
    switch(type){
      case 'DOCX': result=extractDocx(input,limits); break;
      case 'PPTX': result=extractPptx(input,limits); break;
      case 'PDF':
        if(this.options.pdfTextAdapter==='disabled'){
          throw new Error('PDF extraction is disabled for this lightweight document reader instance.');
        }
        result=await extractPdfText(input,limits); break;
      case 'TXT':
      case 'MARKDOWN':
      case 'HTML':
      case 'RTF':
      case 'TEX':
      case 'XML':
      case 'YAML':
      case 'ODT':
      case 'EPUB':
        result=extractStructuredText(input,type,limits); break;
    }
    assertExtractedDocumentLimits(result,limits);
    return result;
  }
}

export async function readDocument(input:DocumentReaderInput,options:DocumentReaderOptions={}):Promise<ExtractedDocument>{
  return new LightweightDocumentReader(options).read(input);
}
