export type DocumentReaderType =
  | 'PDF'
  | 'DOCX'
  | 'PPTX'
  | 'TXT'
  | 'MARKDOWN'
  | 'HTML'
  | 'RTF'
  | 'TEX'
  | 'XML'
  | 'YAML'
  | 'JSON'
  | 'CSV';

export type DocumentBlockType =
  | 'TITLE'
  | 'SUBTITLE'
  | 'PARAGRAPH'
  | 'LIST'
  | 'TABLE'
  | 'IMAGE'
  | 'SEPARATOR'
  | 'QUESTION'
  | 'OPTION'
  | 'SOLUTION'
  | 'METADATA';

export interface DocumentReaderInput {
  name: string;
  mediaType?: string;
  bytes: Uint8Array;
}

export interface DocumentReaderDetection {
  type: DocumentReaderType;
  extension: string;
  mediaType: string;
  name: string;
  confidence: number;
  reason: string;
}

export interface DocumentPosition {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface DocumentAsset {
  id: string;
  path: string;
  name: string;
  mediaType: string;
  bytes: Uint8Array;
  page?: number;
  slide?: number;
  position?: DocumentPosition;
  canvas?: {width:number; height:number};
}

export interface DocumentBlock {
  id: string;
  type: DocumentBlockType;
  text: string;
  order: number;
  level?: number;
  page?: number;
  sheet?: string;
  position?: DocumentPosition;
  assetId?: string;
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
    type: DocumentReaderType;
    raw?: Record<string, unknown>;
  };
}

export interface DocumentTable {
  id: string;
  order: number;
  page?: number;
  sheet?: string;
  name?: string;
  columns: string[];
  rows: Array<Record<string,string>>;
}

export interface LightweightExtractedDocument {
  version: 'p2lrn.document-reader.v1';
  source: {
    name: string;
    extension?: string;
    mediaType?: string;
    detectedType: DocumentReaderType;
    extractionStrategy: string;
  };
  metadata: {
    detectedTitle?: string;
    author?: string;
    pages?: number;
    sheets?: string[];
    detectedLanguage?: string;
  };
  blocks: DocumentBlock[];
  tables: DocumentTable[];
  assets: DocumentAsset[];
  warnings: Array<{
    path: string;
    message: string;
    level?: 'INFO' | 'WARNING' | 'ERROR';
  }>;
}

export interface DocumentReaderOptions {
  pdf?: {
    enabled?: boolean;
  };
  limits?: {
    maxInputBytes?: number;
    maxAssets?: number;
    maxAssetBytes?: number;
  };
}
