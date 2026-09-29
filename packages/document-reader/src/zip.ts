import JSZip from 'jszip';
import {DocumentReaderError, type ReaderOptions} from './types.js';

export interface ZipEntry {
  name: string;
  buffer: Buffer;
}

interface JsZipEntry {
  name: string;
  dir: boolean;
  async(type: 'nodebuffer'): Promise<Buffer>;
  _data?: {uncompressedSize?: number; compressedSize?: number};
}

const DEFAULTS = Object.freeze({
  maxZipEntries: 5000,
  maxZipEntryBytes: 128 * 1024 * 1024,
  maxZipTotalBytes: 512 * 1024 * 1024,
  maxCompressionRatio: 250,
  maxZipNameBytes: 2048,
});

function limits(options: ReaderOptions = {}) {
  return {
    entries: options.maxZipEntries ?? DEFAULTS.maxZipEntries,
    entryBytes: options.maxZipEntryBytes ?? DEFAULTS.maxZipEntryBytes,
    totalBytes: options.maxZipTotalBytes ?? DEFAULTS.maxZipTotalBytes,
    compressionRatio: DEFAULTS.maxCompressionRatio,
    nameBytes: DEFAULTS.maxZipNameBytes,
  };
}

function validateName(name: string, maxBytes: number) {
  if (!name || Buffer.byteLength(name, 'utf8') > maxBytes) {
    throw new DocumentReaderError('ZIP entry has an invalid path.', 'P2LRN_READER_ZIP_PATH');
  }
  if (
    name.includes('\0') ||
    name.includes('..') ||
    name.startsWith('/') ||
    name.startsWith('\\') ||
    name.includes('\\')
  ) {
    throw new DocumentReaderError(`Unsafe ZIP entry path: ${name}`, 'P2LRN_READER_ZIP_PATH');
  }
}

function sizes(entry: JsZipEntry) {
  return {
    uncompressed: Number(entry._data?.uncompressedSize ?? 0),
    compressed: Number(entry._data?.compressedSize ?? 0),
  };
}

async function open(buffer: Buffer, options: ReaderOptions = {}) {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer, {checkCRC32:false});
  } catch {
    throw new DocumentReaderError('ZIP cannot be opened or is damaged.', 'P2LRN_READER_ZIP_INVALID');
  }
  const entries = (Object.values(zip.files) as JsZipEntry[])
    .filter((entry) => !entry.dir && !entry.name.includes('__MACOSX/'));
  const l = limits(options);
  if (entries.length > l.entries) {
    throw new DocumentReaderError(`ZIP has too many entries (${entries.length} > ${l.entries}).`, 'P2LRN_READER_ZIP_LIMIT');
  }
  let declaredTotal = 0;
  for (const entry of entries) {
    validateName(entry.name, l.nameBytes);
    const {uncompressed, compressed} = sizes(entry);
    if (uncompressed > l.entryBytes) {
      throw new DocumentReaderError(`ZIP entry is too large: ${entry.name}`, 'P2LRN_READER_ZIP_LIMIT');
    }
    if (compressed > 0 && uncompressed / compressed > l.compressionRatio) {
      throw new DocumentReaderError(`ZIP entry has an unsafe compression ratio: ${entry.name}`, 'P2LRN_READER_ZIP_RATIO');
    }
    declaredTotal += uncompressed;
    if (declaredTotal > l.totalBytes) {
      throw new DocumentReaderError('ZIP exceeds the total uncompressed byte limit.', 'P2LRN_READER_ZIP_LIMIT');
    }
  }
  return {entries, limits:l};
}

export async function readZip(buffer: Buffer, options: ReaderOptions = {}) {
  const opened = await open(buffer, options);
  const result = new Map<string, Buffer>();
  let total = 0;
  for (const entry of opened.entries) {
    const data = await entry.async('nodebuffer');
    if (data.length > opened.limits.entryBytes) {
      throw new DocumentReaderError(`ZIP entry is too large: ${entry.name}`, 'P2LRN_READER_ZIP_LIMIT');
    }
    total += data.length;
    if (total > opened.limits.totalBytes) {
      throw new DocumentReaderError('ZIP exceeds the total uncompressed byte limit.', 'P2LRN_READER_ZIP_LIMIT');
    }
    result.set(normalizeZipPath(entry.name), data);
  }
  return result;
}

export async function listZip(buffer: Buffer, options: ReaderOptions = {}): Promise<ZipEntry[]> {
  const map = await readZip(buffer, options);
  return [...map.entries()].map(([name, data]) => ({name, buffer:data}));
}

export function normalizeZipPath(name: string) {
  return String(name ?? '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/\.\//g, '/');
}

export function zipEntry(map: Map<string, Buffer>, wanted: string) {
  const normalized = normalizeZipPath(wanted).toLowerCase();
  for (const [name, buffer] of map) {
    const lower = name.toLowerCase();
    if (lower === normalized || lower.endsWith('/' + normalized)) return {name, buffer};
  }
  return null;
}
