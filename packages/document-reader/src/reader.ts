import type {DocumentFormatDetector,DocumentPostProcessor,DocumentReadContext,P2LRNDocumentReader} from './contracts.js';
import type {DocumentReadResult,SourceDocumentInput} from './types.js';
import {BasicDocumentFormatDetector,DocumentExtractorRegistry} from './registry.js';
import {createDefaultDocumentExtractorRegistry,createDefaultDocumentPostProcessors} from './defaults.js';
import {CopiedCanonicalSourceReader} from './copied-engine-adapter.js';

export interface DocumentReaderOptions {
  detector?:DocumentFormatDetector;
  registry?:DocumentExtractorRegistry;
  postProcessors?:DocumentPostProcessor[];
  copiedEngine?:CopiedCanonicalSourceReader;
}

export class DefaultP2LRNDocumentReader implements P2LRNDocumentReader {
  readonly detector:DocumentFormatDetector;
  readonly registry:DocumentExtractorRegistry;
  readonly postProcessors:readonly DocumentPostProcessor[];
  readonly copiedEngine:CopiedCanonicalSourceReader;

  constructor(options:DocumentReaderOptions={}){
    this.detector=options.detector??new BasicDocumentFormatDetector();
    this.registry=options.registry??createDefaultDocumentExtractorRegistry();
    this.postProcessors=Object.freeze([...(options.postProcessors??createDefaultDocumentPostProcessors())]);
    this.copiedEngine=options.copiedEngine??new CopiedCanonicalSourceReader();
  }

  async read(input:SourceDocumentInput,context:DocumentReadContext={}):Promise<DocumentReadResult>{
    if(!input?.name?.trim())throw new TypeError('Source document name is required.');
    if(!(input.bytes instanceof Uint8Array))throw new TypeError('Source document bytes must be Uint8Array.');
    let result:DocumentReadResult;
    if(this.copiedEngine.supports(input)) result=await this.copiedEngine.read(input,context);
    else{
      const detection=this.detector.detect(input);
      const extractor=this.registry.require(detection.format);
      result=await extractor.extract(input,detection,context);
    }
    let document=result.document;
    for(const processor of this.postProcessors)document=await processor.process(document,input,context);
    return{document,assets:[...result.assets]};
  }
}
