import type {ZipLimits} from '../core/zip.js';
import type {DocumentReaderInput,DocumentReaderLimits,ExtractedDocument} from './types.js';

const MiB=1024*1024;
const GiB=1024*MiB;

export const DEFAULT_DOCUMENT_READER_LIMITS:DocumentReaderLimits=Object.freeze({
  inputBytes:256*MiB,
  textBytes:64*MiB,
  xmlEntryBytes:32*MiB,
  archiveEntries:4096,
  archiveEntryBytes:64*MiB,
  archiveTotalUncompressedBytes:1*GiB,
  archiveCentralDirectoryBytes:16*MiB,
  archiveCompressionRatio:100,
  maxSlides:2000,
  maxEpubDocuments:2000,
  maxPdfPages:2000,
  maxBlocks:200000,
  maxTables:20000,
});

function positiveSafe(value:unknown,label:string):number{
  const number=Number(value);
  if(!Number.isSafeInteger(number)||number<1) throw new TypeError(`${label} must be a positive safe integer.`);
  return number;
}

export function normalizeDocumentReaderLimits(overrides:Partial<DocumentReaderLimits>|undefined):DocumentReaderLimits{
  const source={...DEFAULT_DOCUMENT_READER_LIMITS,...(overrides??{})};
  return Object.freeze({
    inputBytes:positiveSafe(source.inputBytes,'document reader inputBytes'),
    textBytes:positiveSafe(source.textBytes,'document reader textBytes'),
    xmlEntryBytes:positiveSafe(source.xmlEntryBytes,'document reader xmlEntryBytes'),
    archiveEntries:positiveSafe(source.archiveEntries,'document reader archiveEntries'),
    archiveEntryBytes:positiveSafe(source.archiveEntryBytes,'document reader archiveEntryBytes'),
    archiveTotalUncompressedBytes:positiveSafe(source.archiveTotalUncompressedBytes,'document reader archiveTotalUncompressedBytes'),
    archiveCentralDirectoryBytes:positiveSafe(source.archiveCentralDirectoryBytes,'document reader archiveCentralDirectoryBytes'),
    archiveCompressionRatio:positiveSafe(source.archiveCompressionRatio,'document reader archiveCompressionRatio'),
    maxSlides:positiveSafe(source.maxSlides,'document reader maxSlides'),
    maxEpubDocuments:positiveSafe(source.maxEpubDocuments,'document reader maxEpubDocuments'),
    maxPdfPages:positiveSafe(source.maxPdfPages,'document reader maxPdfPages'),
    maxBlocks:positiveSafe(source.maxBlocks,'document reader maxBlocks'),
    maxTables:positiveSafe(source.maxTables,'document reader maxTables'),
  });
}

export function documentZipLimits(limits:DocumentReaderLimits):ZipLimits{
  return {
    entries:limits.archiveEntries,
    entryBytes:limits.archiveEntryBytes,
    totalUncompressedBytes:limits.archiveTotalUncompressedBytes,
    centralDirectoryBytes:limits.archiveCentralDirectoryBytes,
    compressionRatio:limits.archiveCompressionRatio,
  };
}

export function assertDocumentInput(input:DocumentReaderInput,limits:DocumentReaderLimits):void{
  if(!(input.data instanceof Uint8Array)) throw new TypeError('DocumentReaderInput.data must be a Uint8Array.');
  if(!input.name?.trim()) throw new TypeError('DocumentReaderInput.name is required.');
  if(input.data.byteLength>limits.inputBytes){
    throw new Error(`Document exceeds lightweight reader input limit (${input.data.byteLength} > ${limits.inputBytes} bytes).`);
  }
}

export function decodeTextInput(input:DocumentReaderInput,limits:DocumentReaderLimits,label:string):string{
  if(input.data.byteLength>limits.textBytes){
    throw new Error(`${label} text exceeds lightweight reader text limit (${input.data.byteLength} > ${limits.textBytes} bytes).`);
  }
  return new TextDecoder('utf-8',{fatal:false}).decode(input.data);
}

export function readArchiveText(
  archive:{entries:Map<string,{uncompressedSize:number}>;read(path:string):Uint8Array},
  path:string,
  limits:DocumentReaderLimits,
  label=path,
):string{
  const entry=archive.entries.get(path);
  if(!entry) throw new Error(`${label} is missing.`);
  if(entry.uncompressedSize>limits.xmlEntryBytes){
    throw new Error(`${label} exceeds lightweight reader XML/text entry limit (${entry.uncompressedSize} > ${limits.xmlEntryBytes} bytes).`);
  }
  const bytes=archive.read(path);
  if(bytes.byteLength>limits.xmlEntryBytes) throw new Error(`${label} exceeds lightweight reader XML/text entry limit.`);
  return new TextDecoder('utf-8',{fatal:false}).decode(bytes);
}

export function assertExtractedDocumentLimits(document:ExtractedDocument,limits:DocumentReaderLimits):void{
  if(document.blocks.length>limits.maxBlocks) throw new Error(`Document reader produced too many blocks (${document.blocks.length} > ${limits.maxBlocks}).`);
  if(document.tables.length>limits.maxTables) throw new Error(`Document reader produced too many tables (${document.tables.length} > ${limits.maxTables}).`);
}
