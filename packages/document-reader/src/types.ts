export type DocumentFileType =
  | 'PDF' | 'DOCX' | 'PPTX' | 'XLSX'
  | 'TXT' | 'MARKDOWN' | 'CSV' | 'JSON'
  | 'HTML' | 'RTF' | 'TEX' | 'XML' | 'YAML'
  | 'ODT' | 'EPUB' | 'ZIP'
  | 'SCORM' | 'IMSCC' | 'CMI5' | 'XAPI_PACKAGE'
  | 'H5P' | 'MOODLE_BACKUP' | 'CHAMILO_COURSE_ZIP'
  | 'OPEN_EDX_OLX' | 'UNKNOWN';

export type ExtractionStrategy =
  | 'PDF_TEXT'
  | 'DOCX_XML'
  | 'PPTX_SLIDES_XML'
  | 'XLSX_TABLE'
  | 'TXT_LINES'
  | 'MARKDOWN_LINES'
  | 'CSV_TABLE'
  | 'JSON_CANONICAL'
  | 'HTML_TEXT'
  | 'RTF_TEXT'
  | 'TEX_TEXT'
  | 'XML_TEXT'
  | 'YAML_TEXT'
  | 'ODT_XML'
  | 'EPUB_XHTML'
  | 'ZIP_CONTAINER'
  | 'SCORM_MANIFEST'
  | 'IMSCC_MANIFEST'
  | 'CMI5_PACKAGE'
  | 'XAPI_TINCAN_PACKAGE'
  | 'H5P_PACKAGE'
  | 'MOODLE_MBZ_MANIFEST'
  | 'CHAMILO_COURSE_ZIP_MANIFEST'
  | 'OPEN_EDX_OLX_MANIFEST';

export interface DocumentInput {
  name: string;
  mimeType?: string;
  buffer: Buffer;
}

export interface FileDetection {
  type: DocumentFileType;
  extension: string;
  mimeType: string;
  fileName: string;
  confidence: number;
  reason: string;
}

export type DocumentBlockType =
  | 'TITLE'
  | 'SUBTITLE'
  | 'PARAGRAPH'
  | 'LIST'
  | 'TABLE'
  | 'IMAGE_REFERENCE'
  | 'SEPARATOR'
  | 'QUESTION'
  | 'OPTION'
  | 'SOLUTION'
  | 'METADATA';

export interface DocumentBlock {
  id: string;
  type: DocumentBlockType;
  text: string;
  order: number;
  level?: number;
  page?: number;
  sheet?: string;
  position?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
  style?: {
    fontSize?: number;
    fontWeight?: string | number;
    fontFamily?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    color?: string;
    backgroundColor?: string;
    align?: string;
  };
  source?: {
    type: DocumentFileType;
    raw?: Record<string, unknown>;
  };
}

export interface ExtractedTable {
  id: string;
  order: number;
  page?: number;
  sheet?: string;
  name?: string;
  columns: string[];
  rows: Array<Record<string, string>>;
}

export interface ExtractedAsset {
  id: string;
  path: string;
  mediaType: string;
  size: number;
  sha256: string;
  page?: number;
  sheet?: string;
  paragraphIndex?: number;
  runIndex?: number;
  cell?: string;
  position?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
  /**
   * Present only when ReaderOptions.includeAssetBytes is true.
   */
  buffer?: Buffer;
  source?: Record<string, unknown>;
}

export interface ReaderWarning {
  path: string;
  message: string;
  level?: 'INFO' | 'WARNING' | 'ERROR';
}

export interface CanonicalDocument {
  version: 'p2lrn.document-reader.v1';
  origin: {
    fileName: string;
    originalExtension?: string;
    originalMime?: string;
    detectedType: DocumentFileType;
    extractionStrategy: ExtractionStrategy;
  };
  metadata: {
    detectedTitle?: string;
    author?: string;
    pages?: number;
    sheets?: string[];
    language?: string;
  };
  blocks: DocumentBlock[];
  tables: ExtractedTable[];
  raw?: unknown;
  assets?: ExtractedAsset[];
  warnings: ReaderWarning[];
}

export interface ReaderOptions {
  /**
   * Optional PDF support. If false, PDFs fail fast without loading pdfjs-dist.
   * Default true; pdfjs-dist itself remains an optional peer dependency.
   */
  pdf?: boolean;
  /**
   * Maximum ZIP entries read into memory.
   */
  maxZipEntries?: number;
  /**
   * Maximum bytes for one uncompressed ZIP entry.
   */
  maxZipEntryBytes?: number;
  /**
   * Maximum total uncompressed bytes read from a ZIP.
   */
  maxZipTotalBytes?: number;
  /**
   * Maximum nested documents processed from a generic ZIP.
   */
  maxNestedDocuments?: number;
  /**
   * Keep image/media bytes in the returned assets. Default false to keep
   * the Reader memory footprint low; metadata, hash and placement remain.
   */
  includeAssetBytes?: boolean;
}

export class DocumentReaderError extends Error {
  readonly code: string;
  constructor(message: string, code = 'P2LRN_DOCUMENT_READER_ERROR') {
    super(message);
    this.name = 'DocumentReaderError';
    this.code = code;
  }
}
