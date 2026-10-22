import type { DocumentReaderInput, DocumentReaderLimits, ExtractedDocument } from './types.js';
export declare function extractPdfText(input: DocumentReaderInput, limits: DocumentReaderLimits): Promise<ExtractedDocument>;
