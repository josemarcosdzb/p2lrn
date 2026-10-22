import type { DocumentReaderInput, DocumentReaderOptions, ExtractedDocument } from './types.js';
export declare class LightweightDocumentReader {
    private readonly options;
    constructor(options?: DocumentReaderOptions);
    detect(input: DocumentReaderInput): import("./types.js").DocumentReaderFileType;
    read(input: DocumentReaderInput): Promise<ExtractedDocument>;
}
export declare function readDocument(input: DocumentReaderInput, options?: DocumentReaderOptions): Promise<ExtractedDocument>;
