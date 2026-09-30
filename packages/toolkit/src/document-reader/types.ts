export type DocumentReaderFileType =
  | 'PDF' | 'DOCX' | 'PPTX' | 'TXT' | 'MARKDOWN' | 'HTML' | 'RTF'
  | 'TEX' | 'XML' | 'YAML' | 'ODT' | 'EPUB';

export type DocumentReaderStrategy =
  | 'PDF_TEXT' | 'DOCX_XML' | 'PPTX_SLIDES_XML' | 'TXT_LINES'
  | 'MARKDOWN_LINES' | 'HTML_TEXT' | 'RTF_TEXT' | 'TEX_TEXT'
  | 'XML_TEXT' | 'YAML_TEXT' | 'ODT_XML' | 'EPUB_XHTML';

export type DocumentBlockType =
  | 'TITLE' | 'SUBTITLE' | 'PARAGRAPH' | 'LIST' | 'TABLE'
  | 'IMAGE_REFERENCE' | 'SEPARATOR' | 'METADATA';

export interface DocumentReaderInput {
  name:string;
  data:Uint8Array;
  mediaType?:string;
}

export interface DocumentBlock {
  id:string;
  type:DocumentBlockType;
  text:string;
  order:number;
  level?:number;
  page?:number;
  sheet?:string;
  position?:{x?:number;y?:number;width?:number;height?:number};
  style?:{
    fontSize?:number;
    fontWeight?:string|number;
    fontFamily?:string;
    bold?:boolean;
    italic?:boolean;
    underline?:boolean;
    color?:string;
    backgroundColor?:string;
    align?:string;
  };
  asset?:{
    path:string;
    mediaType?:string;
    relationshipId?:string;
  };
  source?:{
    type:DocumentReaderFileType;
    raw?:Record<string,unknown>;
  };
}

export interface DocumentTable {
  id:string;
  order:number;
  page?:number;
  sheet?:string;
  name?:string;
  columns:string[];
  rows:Array<Record<string,string>>;
}

export interface ExtractedDocument {
  version:'p2lrn.document-reader.v1';
  source:{
    name:string;
    extension?:string;
    mediaType?:string;
    detectedType:DocumentReaderFileType;
    strategy:DocumentReaderStrategy;
  };
  metadata:{
    detectedTitle?:string;
    author?:string;
    pages?:number;
    sheets?:string[];
    language?:string;
  };
  blocks:DocumentBlock[];
  tables:DocumentTable[];
  warnings:Array<{path:string;message:string;level?:'INFO'|'WARNING'|'ERROR'}>;
  raw?:unknown;
}

export interface DocumentReaderLimits {
  inputBytes:number;
  textBytes:number;
  xmlEntryBytes:number;
  archiveEntries:number;
  archiveEntryBytes:number;
  archiveTotalUncompressedBytes:number;
  archiveCentralDirectoryBytes:number;
  archiveCompressionRatio:number;
  maxSlides:number;
  maxEpubDocuments:number;
  maxPdfPages:number;
  maxPdfTextItems:number;
  maxBlocks:number;
  maxTables:number;
}

export interface DocumentReaderOptions {
  pdfTextAdapter?:'auto'|'required'|'disabled';
  limits?:Partial<DocumentReaderLimits>;
}
