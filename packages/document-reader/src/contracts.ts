import type {CanonicalDocument,DocumentReadResult,SourceDocumentFormat,SourceDocumentInput} from './types.js';

export interface FormatDetection {
  format:SourceDocumentFormat;
  confidence:number;
  mediaType?:string;
  extension?:string;
  reason?:string;
}

export interface DocumentReadContext {
  signal?:AbortSignal;
  maxUncompressedBytes?:number;
  maxFiles?:number;
  maxImages?:number;
  enableOcr?:boolean;
}

export interface DocumentExtractor {
  readonly id:string;
  readonly formats:readonly SourceDocumentFormat[];
  extract(input:SourceDocumentInput,detection:FormatDetection,context:DocumentReadContext):Promise<DocumentReadResult>;
}

export interface DocumentFormatDetector {
  detect(input:SourceDocumentInput):FormatDetection;
}

export interface DocumentPostProcessor {
  readonly id:string;
  process(document:CanonicalDocument,input:SourceDocumentInput,context:DocumentReadContext):Promise<CanonicalDocument>;
}

export interface P2LRNDocumentReader {
  read(input:SourceDocumentInput,context?:DocumentReadContext):Promise<DocumentReadResult>;
}
