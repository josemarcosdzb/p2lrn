import type { DocumentReaderFileType, DocumentReaderInput, DocumentReaderLimits, ExtractedDocument } from './types.js';
export declare function extractStructuredText(input: DocumentReaderInput, type: Exclude<DocumentReaderFileType, 'PDF' | 'DOCX' | 'PPTX'>, limits: DocumentReaderLimits): ExtractedDocument;
