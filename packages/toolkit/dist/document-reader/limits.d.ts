import type { ZipLimits } from '../core/zip.js';
import type { DocumentReaderInput, DocumentReaderLimits, ExtractedDocument } from './types.js';
export declare const DEFAULT_DOCUMENT_READER_LIMITS: DocumentReaderLimits;
export declare function normalizeDocumentReaderLimits(overrides: Partial<DocumentReaderLimits> | undefined): DocumentReaderLimits;
export declare function documentZipLimits(limits: DocumentReaderLimits): ZipLimits;
export declare function assertDocumentInput(input: DocumentReaderInput, limits: DocumentReaderLimits): void;
export declare function decodeTextInput(input: DocumentReaderInput, limits: DocumentReaderLimits, label: string): string;
export declare function readArchiveText(archive: {
    entries: Map<string, {
        uncompressedSize: number;
    }>;
    read(path: string): Uint8Array;
}, path: string, limits: DocumentReaderLimits, label?: string): string;
export declare function assertExtractedDocumentLimits(document: ExtractedDocument, limits: DocumentReaderLimits): void;
