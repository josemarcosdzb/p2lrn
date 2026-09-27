import type {DocumentFormatDetector,DocumentPostProcessor,DocumentReadContext,P2LRNDocumentReader} from './contracts.js';
import type {DocumentReadResult,SourceDocumentInput} from './types.js';
import {BasicDocumentFormatDetector,DocumentExtractorRegistry} from './registry.js';

export interface DocumentReaderOptions {
  detector?:DocumentFormatDetector;
  registry?:DocumentExtractorRegistry;
  postProcessors?:DocumentPostProcessor[];
}

export class DefaultP2LRNDocumentReader implements P2LRNDocumentReader {
  readonly detector:DocumentFormatDetector;
  readonly registry:DocumentExtractorRegistry;
  readonly postProcessors:readonly DocumentPostProcessor[];

  constructor(options:DocumentReaderOptions={}){
    this.detector=options.detector??new BasicDocumentFormatDetector();
    this.registry=options.registry??new DocumentExtractorRegistry();
    this.postProcessors=Object.freeze([...(options.postProcessors??[])]);
  }

  async read(input:SourceDocumentInput,context:DocumentReadContext={}):Promise<DocumentReadResult>{
    if(!input?.name?.trim())throw new TypeError('Source document name is required.');
    if(!(input.bytes instanceof Uint8Array))throw new TypeError('Source document bytes must be Uint8Array.');
    const detection=this.detector.detect(input);
    const extractor=this.registry.require(detection.format);
    const result=await extractor.extract(input,detection,context);
    let document=result.document;
    for(const processor of this.postProcessors)document=await processor.process(document,input,context);
    return{document,assets:[...result.assets]};
  }
}
