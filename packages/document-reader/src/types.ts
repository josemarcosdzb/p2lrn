export const CANONICAL_DOCUMENT_SCHEMA='https://p2lrn.org/schema/canonical-document/1' as const;
export const CANONICAL_DOCUMENT_VERSION='1' as const;
export const DOCUMENT_TRACE_SCHEMA='https://p2lrn.org/schema/document-trace/1' as const;
export const DOCUMENT_INVENTORY_SCHEMA='https://p2lrn.org/schema/document-inventory/1' as const;
export const DOCUMENT_PROVENANCE_SCHEMA='https://p2lrn.org/schema/document-provenance/1' as const;

export type SourceDocumentFormat =
  | 'PDF'|'DOCX'|'PPTX'|'TXT'|'MARKDOWN'|'HTML'|'RTF'|'TEX'|'XML'|'YAML'
  | 'CSV'|'XLSX'|'ODT'|'EPUB'|'JSON'|'ZIP'
  | 'SCORM'|'IMSCC'|'CMI5'|'XAPI_PACKAGE'|'H5P'
  | 'MOODLE_BACKUP'|'CHAMILO_COURSE_ZIP'|'OPEN_EDX_OLX'|'UNKNOWN';

export type ExtractionStrategy =
  | 'PDF_TEXT'|'PDF_OCR'|'DOCX_XML'|'PPTX_SLIDES_XML'
  | 'TXT_LINES'|'MARKDOWN'|'HTML'|'RTF'|'TEX'|'XML'|'YAML'
  | 'CSV_TABLE'|'XLSX_WORKBOOK'|'ODT_XML'|'EPUB_XHTML'|'JSON'
  | 'ZIP_CONTAINER'|'SCORM_MANIFEST'|'IMSCC_MANIFEST'|'CMI5_PACKAGE'
  | 'XAPI_PACKAGE'|'H5P_PACKAGE'|'MOODLE_BACKUP'|'CHAMILO_COURSE_ZIP'
  | 'OPEN_EDX_OLX'|'DOCLING';

export type CanonicalBlockType =
  | 'TITLE'|'SUBTITLE'|'PARAGRAPH'|'LIST'|'TABLE'|'IMAGE'|'SEPARATOR'
  | 'QUESTION'|'OPTION'|'SOLUTION'|'METADATA';

export type CanonicalNodeType='TITLE'|'PARAGRAPH'|'LIST'|'TABLE'|'IMAGE'|'CHART'|'FORMULA'|'QUESTION'|'SOLUTION';
export type TraceOrigin='NATIVE'|'OCR'|'INFERRED'|'USER';
export type ExtractionEngine='NATIVE'|'DOCLING'|'PDFJS'|'OCR';

export interface BoundingBox {
  x?:number;y?:number;width?:number;height?:number;
  coordinateSystem?:'TOP_LEFT'|'BOTTOM_LEFT'|'UNKNOWN';
  canvasWidth?:number;canvasHeight?:number;
}

export interface SourceSpan {
  documentId:string;
  sourceBlockId?:string;
  internalFile?:string;
  page?:number;
  slide?:number;
  sheet?:string;
  charStart?:number;
  charEnd?:number;
  bbox?:BoundingBox;
}

export interface NodeTrace {
  schema:typeof DOCUMENT_TRACE_SCHEMA;
  documentId:string;
  nodeId:string;
  origin:TraceOrigin;
  contentHash:string;
  sourceOrder:number;
  spans:SourceSpan[];
}

export interface AssetReference {
  id:string;
  name:string;
  mediaType:string;
  size?:number;
  byteDigest?:string;
  sourcePath?:string;
  page?:number;
  slide?:number;
}

export interface CanonicalBlock {
  id:string;
  type:CanonicalBlockType;
  text:string;
  order:number;
  level?:number;
  page?:number;
  slide?:number;
  sheet?:string;
  bbox?:BoundingBox;
  style?:{
    fontSize?:number;fontWeight?:string|number;fontFamily?:string;
    bold?:boolean;italic?:boolean;underline?:boolean;color?:string;backgroundColor?:string;align?:string;
  };
  asset?:AssetReference;
  trace?:NodeTrace;
  source?:{format:SourceDocumentFormat;raw?:Record<string,unknown>};
}

export interface CanonicalTableCell {
  text:string;colspan?:number;rowspan?:number;header?:boolean;
  source?:{format:SourceDocumentFormat;raw?:Record<string,unknown>};
}

export interface CanonicalTable {
  id:string;order:number;page?:number;slide?:number;sheet?:string;name?:string;
  columns:string[];rows:Array<Record<string,string>>;
  cells?:{headers:CanonicalTableCell[][];rows:CanonicalTableCell[][]};
  bbox?:BoundingBox;
  source?:{format:SourceDocumentFormat;raw?:Record<string,unknown>};
}

export interface CanonicalNode {
  id:string;type:CanonicalNodeType;order:number;text?:string;
  page?:number;slide?:number;sheet?:string;bbox?:BoundingBox;confidence?:number;
  provenance:{engine:ExtractionEngine;reference?:string;internalFile?:string;raw?:Record<string,unknown>};
  data?:Record<string,unknown>;
}

export interface ExtractionCandidateScore {
  score:number;readability:number;textCoverage:number;duplicateRatio:number;
  blocks:number;titles:number;tables:number;images:number;positioned:number;
}

export interface ExtractionSelection {
  engine:'NATIVE'|'DOCLING';reason:string;
  candidates:{NATIVE:ExtractionCandidateScore;DOCLING:ExtractionCandidateScore};
}

export interface ExtractionReconciliation {
  strategy:'PRIMARY_AUTHORITY_PLUS_COMPLEMENTARY_EVIDENCE';
  primary:'NATIVE'|'DOCLING';secondary:'NATIVE'|'DOCLING';
  statistics?:Record<string,unknown>;
  structuralEvidence?:Array<Record<string,unknown>>;
  unmaterializedEvidence?:Array<Record<string,unknown>>;
}

export interface DocumentProvenance {
  schema:typeof DOCUMENT_PROVENANCE_SCHEMA;
  authoritativeEngine:'NATIVE'|'DOCLING';
  selection?:ExtractionSelection;
  reconciliation?:ExtractionReconciliation;
}

export interface DocumentInventory {
  schema:typeof DOCUMENT_INVENTORY_SCHEMA;
  documentId:string;documentHash:string;
  totalBlocks:number;totalTables:number;totalCharacters:number;
  nodes:Array<{nodeId:string;sourceBlockId:string;contentHash:string;charStart:number;charEnd:number;page?:number;slide?:number;sheet?:string;internalFile?:string}>;
  tables:Array<{tableId:string;contentHash:string;page?:number;slide?:number;sheet?:string}>;
}

export interface CanonicalDocumentWarning {
  path:string;message:string;level?:'INFO'|'WARNING'|'ERROR';
}

export interface CanonicalDocument {
  schema:typeof CANONICAL_DOCUMENT_SCHEMA;
  version:typeof CANONICAL_DOCUMENT_VERSION;
  source:{
    name:string;extension?:string;mediaType?:string;format:SourceDocumentFormat;strategy:ExtractionStrategy;
  };
  metadata:{title?:string;author?:string;pages?:number;sheets?:string[];language?:string};
  blocks:CanonicalBlock[];
  tables:CanonicalTable[];
  sequence:{nodes:CanonicalNode[]};
  provenance:DocumentProvenance;
  inventory:DocumentInventory;
  warnings:CanonicalDocumentWarning[];
  container?:Record<string,unknown>;
  raw?:unknown;
}

export interface SourceDocumentInput {
  name:string;
  bytes:Uint8Array;
  mediaType?:string;
}

export interface MaterializedAsset {
  reference:AssetReference;
  bytes:Uint8Array;
}

export interface DocumentReadResult {
  document:CanonicalDocument;
  assets:MaterializedAsset[];
}
