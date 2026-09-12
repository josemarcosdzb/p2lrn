const textDecoder = new TextDecoder('utf-8', {fatal: true});
let crcTable = null;

export const ZIP_SIGNATURES = Object.freeze({
  LOCAL: 0x04034b50,
  CENTRAL: 0x02014b50,
  EOCD: 0x06054b50,
  ZIP64_EOCD: 0x06064b50,
  ZIP64_LOCATOR: 0x07064b50,
});

export function u16(view, offset) { return view.getUint16(offset, true); }
export function u32(view, offset) { return view.getUint32(offset, true); }
export function u64(view, offset) {
  const low = BigInt(view.getUint32(offset, true));
  const high = BigInt(view.getUint32(offset + 4, true));
  return (high << 32n) | low;
}

function safeNumber(value, label) {
  const big = typeof value === 'bigint' ? value : BigInt(value);
  if (big < 0n || big > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} exceeds JavaScript safe integer range.`);
  }
  return Number(big);
}

export function safeZipPath(name) {
  if (!name || name.includes('\0') || name.includes('\\') || name.startsWith('/')) throw new Error(`Unsafe ZIP path: ${name}`);
  const parts = name.split('/');
  if (parts.length > 32 || parts.some((part) => !part || part === '.' || part === '..')) throw new Error(`Unsafe ZIP path: ${name}`);
  if (/^[A-Za-z]:/.test(parts[0])) throw new Error(`Unsafe ZIP path: ${name}`);
  return name;
}

function ensureCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

export class Crc32State {
  constructor() { this.value = 0xFFFFFFFF; }
  update(bytes) {
    const table = ensureCrcTable();
    let crc = this.value;
    for (const byte of bytes) crc = table[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
    this.value = crc >>> 0;
    return this;
  }
  digest() { return (this.value ^ 0xFFFFFFFF) >>> 0; }
}

export function crc32(bytes) { return new Crc32State().update(bytes).digest(); }

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot decompress ZIP deflate streams (DecompressionStream unavailable).');
  let stream;
  try { stream = new DecompressionStream('deflate-raw'); }
  catch { throw new Error('This browser does not support deflate-raw ZIP decompression.'); }
  const response = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await response.arrayBuffer());
}

function findEocd(bytes, absoluteStart, totalSize) {
  if (bytes.byteLength < 22) throw new Error('ZIP end-of-central-directory not found.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = bytes.byteLength - 22; offset >= 0; offset -= 1) {
    if (u32(view, offset) !== ZIP_SIGNATURES.EOCD) continue;
    const commentLength = u16(view, offset + 20);
    if (offset + 22 + commentLength !== bytes.byteLength) continue;
    return {offset, absoluteOffset: absoluteStart + offset, view};
  }
  throw new Error('ZIP end-of-central-directory not found.');
}

function parseZip64Locator(bytes, absoluteStart, eocdAbsoluteOffset) {
  const locatorAbsolute = eocdAbsoluteOffset - 20;
  const localOffset = locatorAbsolute - absoluteStart;
  if (localOffset < 0 || localOffset + 20 > bytes.byteLength) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset + localOffset, 20);
  if (u32(view, 0) !== ZIP_SIGNATURES.ZIP64_LOCATOR) return null;
  const disk = u32(view, 4);
  const zip64Offset = safeNumber(u64(view, 8), 'ZIP64 end-of-central-directory offset');
  const disks = u32(view, 16);
  if (disk !== 0 || disks !== 1) throw new Error('Multi-disk ZIP64 is not supported.');
  return {zip64Offset};
}

function parseZip64Eocd(bytes) {
  if (bytes.byteLength < 56) throw new Error('Truncated ZIP64 end-of-central-directory record.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (u32(view, 0) !== ZIP_SIGNATURES.ZIP64_EOCD) throw new Error('ZIP64 end-of-central-directory record not found at declared offset.');
  const recordSize = safeNumber(u64(view, 4), 'ZIP64 end-of-central-directory record size');
  if (recordSize < 44) throw new Error('Invalid ZIP64 end-of-central-directory record size.');
  const disk = u32(view, 16);
  const cdDisk = u32(view, 20);
  const entriesDisk = safeNumber(u64(view, 24), 'ZIP64 entries on disk');
  const entriesTotal = safeNumber(u64(view, 32), 'ZIP64 total entries');
  const cdSize = safeNumber(u64(view, 40), 'ZIP64 central directory size');
  const cdOffset = safeNumber(u64(view, 48), 'ZIP64 central directory offset');
  if (disk !== 0 || cdDisk !== 0 || entriesDisk !== entriesTotal) throw new Error('Multi-disk ZIP64 is not supported.');
  return {entriesTotal, cdSize, cdOffset, recordSize};
}

function parseZip64Extra(extraBytes, fields) {
  const view = new DataView(extraBytes.buffer, extraBytes.byteOffset, extraBytes.byteLength);
  let offset = 0;
  while (offset + 4 <= extraBytes.byteLength) {
    const id = u16(view, offset);
    const size = u16(view, offset + 2);
    const dataStart = offset + 4;
    const dataEnd = dataStart + size;
    if (dataEnd > extraBytes.byteLength) throw new Error('Truncated ZIP extra field.');
    if (id === 0x0001) {
      let cursor = dataStart;
      const result = {};
      const read64 = (label) => {
        if (cursor + 8 > dataEnd) throw new Error(`ZIP64 extra field is missing ${label}.`);
        const value = safeNumber(u64(view, cursor), label);
        cursor += 8;
        return value;
      };
      if (fields.uncompressed) result.uncompressedSize = read64('uncompressed size');
      if (fields.compressed) result.compressedSize = read64('compressed size');
      if (fields.localOffset) result.localOffset = read64('local header offset');
      if (fields.diskStart) {
        if (cursor + 4 > dataEnd) throw new Error('ZIP64 extra field is missing disk start.');
        result.diskStart = u32(view, cursor);
      }
      return result;
    }
    offset = dataEnd;
  }
  throw new Error('ZIP64 extended information extra field is missing.');
}

function decodeEntryName(rawName) {
  try { return textDecoder.decode(rawName); }
  catch { throw new Error('ZIP entry name is not valid UTF-8/ASCII.'); }
}

export function parseCentralDirectory(bytes, info, limits) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = new Map();
  let offset = 0;
  let totalUncompressed = 0;
  for (let index = 0; index < info.entriesTotal; index += 1) {
    if (offset + 46 > bytes.byteLength || u32(view, offset) !== ZIP_SIGNATURES.CENTRAL) throw new Error('Invalid ZIP central directory entry.');
    const flags = u16(view, offset + 8);
    const method = u16(view, offset + 10);
    const crc = u32(view, offset + 16);
    let compressedSize = u32(view, offset + 20);
    let uncompressedSize = u32(view, offset + 24);
    const nameLength = u16(view, offset + 28);
    const extraLength = u16(view, offset + 30);
    const commentLength = u16(view, offset + 32);
    let diskStart = u16(view, offset + 34);
    let localOffset = u32(view, offset + 42);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > bytes.byteLength) throw new Error('Truncated ZIP central directory entry.');
    if (flags & 0x1) throw new Error('Encrypted ZIP entries are not allowed.');
    if (![0, 8].includes(method)) throw new Error(`Unsupported ZIP compression method ${method}.`);
    const rawName = bytes.slice(offset + 46, offset + 46 + nameLength);
    const name = decodeEntryName(rawName);
    const extra = bytes.slice(offset + 46 + nameLength, offset + 46 + nameLength + extraLength);
    const needs = {
      uncompressed: uncompressedSize === 0xFFFFFFFF,
      compressed: compressedSize === 0xFFFFFFFF,
      localOffset: localOffset === 0xFFFFFFFF,
      diskStart: diskStart === 0xFFFF,
    };
    if (needs.uncompressed || needs.compressed || needs.localOffset || needs.diskStart) {
      const z64 = parseZip64Extra(extra, needs);
      if (needs.uncompressed) uncompressedSize = z64.uncompressedSize;
      if (needs.compressed) compressedSize = z64.compressedSize;
      if (needs.localOffset) localOffset = z64.localOffset;
      if (needs.diskStart) diskStart = z64.diskStart;
    }
    if (diskStart !== 0) throw new Error('Multi-disk ZIP entry is not supported.');
    const directory = name.endsWith('/');
    const normalized = directory ? name.slice(0, -1) : name;
    if (normalized) safeZipPath(normalized);
    if (!directory) {
      if (entries.has(name)) throw new Error(`Duplicate ZIP entry: ${name}`);
      if (uncompressedSize > limits.entryBytes) throw new Error(`ZIP entry exceeds read limit: ${name}`);
      if (compressedSize > 0 && uncompressedSize / compressedSize > limits.compressionRatio) throw new Error(`ZIP compression ratio exceeds limit: ${name}`);
      totalUncompressed += uncompressedSize;
      if (totalUncompressed > limits.totalUncompressedBytes) throw new Error('ZIP total uncompressed size exceeds safety limit.');
      entries.set(name, {name, flags, method, crc, compressedSize, uncompressedSize, localOffset});
    }
    offset = end;
  }
  if (offset !== bytes.byteLength) throw new Error('ZIP central directory size mismatch.');
  return entries;
}

async function readCentralInfoFromBuffer(buffer) {
  const totalSize = buffer.byteLength;
  const tailStart = Math.max(0, totalSize - 65633);
  const tail = new Uint8Array(buffer, tailStart);
  const eocd = findEocd(tail, tailStart, totalSize);
  const view = eocd.view;
  const disk = u16(view, eocd.offset + 4);
  const cdDisk = u16(view, eocd.offset + 6);
  const entriesDisk = u16(view, eocd.offset + 8);
  const entriesTotal16 = u16(view, eocd.offset + 10);
  const cdSize32 = u32(view, eocd.offset + 12);
  const cdOffset32 = u32(view, eocd.offset + 16);
  if (disk !== 0 || cdDisk !== 0 || (entriesDisk !== entriesTotal16 && entriesDisk !== 0xFFFF)) throw new Error('Multi-disk ZIP is not supported.');
  const needsZip64 = entriesTotal16 === 0xFFFF || entriesDisk === 0xFFFF || cdSize32 === 0xFFFFFFFF || cdOffset32 === 0xFFFFFFFF;
  if (!needsZip64) return {entriesTotal: entriesTotal16, cdSize: cdSize32, cdOffset: cdOffset32, zip64: false};
  const locator = parseZip64Locator(tail, tailStart, eocd.absoluteOffset);
  if (!locator) throw new Error('ZIP64 locator is missing.');
  if (locator.zip64Offset + 56 > totalSize) throw new Error('ZIP64 end-of-central-directory offset is out of bounds.');
  const record = new Uint8Array(buffer, locator.zip64Offset, Math.min(56, totalSize - locator.zip64Offset));
  return {...parseZip64Eocd(record), zip64: true};
}

export class BufferZipArchive {
  constructor(buffer, limits) {
    this.buffer = buffer;
    this.bytesView = new Uint8Array(buffer);
    this.view = new DataView(buffer);
    this.limits = limits;
    this.entries = new Map();
    this.transport = 'buffer';
    this.zip64 = false;
  }

  static async open(buffer, limits) {
    const archive = new BufferZipArchive(buffer, limits);
    const info = await readCentralInfoFromBuffer(buffer);
    if (info.entriesTotal > limits.entries) throw new Error(`ZIP contains too many entries (${info.entriesTotal}).`);
    if (info.cdSize > limits.centralDirectoryBytes) throw new Error('ZIP central directory exceeds safety limit.');
    if (info.cdOffset + info.cdSize > buffer.byteLength) throw new Error('Invalid ZIP central directory bounds.');
    const central = new Uint8Array(buffer, info.cdOffset, info.cdSize);
    archive.entries = parseCentralDirectory(central, info, limits);
    archive.zip64 = info.zip64;
    return archive;
  }

  names() { return [...this.entries.keys()]; }

  async entryRange(name) {
    const entry = this.entries.get(name);
    if (!entry) throw new Error(`ZIP entry not found: ${name}`);
    const offset = entry.localOffset;
    if (offset + 30 > this.buffer.byteLength || u32(this.view, offset) !== ZIP_SIGNATURES.LOCAL) throw new Error(`Invalid local ZIP header: ${name}`);
    const flags = u16(this.view, offset + 6);
    const method = u16(this.view, offset + 8);
    const nameLength = u16(this.view, offset + 26);
    const extraLength = u16(this.view, offset + 28);
    if (flags & 0x1) throw new Error(`Encrypted local ZIP entry is not allowed: ${name}`);
    if (method !== entry.method) throw new Error(`ZIP compression method mismatch: ${name}`);
    const localNameEnd = offset + 30 + nameLength;
    if (localNameEnd > this.buffer.byteLength) throw new Error(`Truncated local ZIP name: ${name}`);
    const localName = decodeEntryName(this.bytesView.slice(offset + 30, localNameEnd));
    if (localName !== entry.name) throw new Error(`Local/central ZIP name mismatch: ${name}`);
    const dataStart = offset + 30 + nameLength + extraLength;
    return Object.freeze({
      path: name, method: entry.method, dataStart, compressedSize: entry.compressedSize,
      uncompressedSize: entry.uncompressedSize, crc32: entry.crc, sourceValidator: null,
    });
  }

  async read(name) {
    const entry = this.entries.get(name);
    if (!entry) throw new Error(`ZIP entry not found: ${name}`);
    const offset = entry.localOffset;
    if (offset + 30 > this.buffer.byteLength || u32(this.view, offset) !== ZIP_SIGNATURES.LOCAL) throw new Error(`Invalid local ZIP header: ${name}`);
    const method = u16(this.view, offset + 8);
    const nameLength = u16(this.view, offset + 26);
    const extraLength = u16(this.view, offset + 28);
    if (method !== entry.method) throw new Error(`ZIP compression method mismatch: ${name}`);
    const localNameEnd = offset + 30 + nameLength;
    if (localNameEnd > this.buffer.byteLength) throw new Error(`Truncated local ZIP name: ${name}`);
    const localName = decodeEntryName(this.bytesView.slice(offset + 30, localNameEnd));
    if (localName !== entry.name) throw new Error(`Local/central ZIP name mismatch: ${name}`);
    const dataStart = offset + 30 + nameLength + extraLength;
    const dataEnd = dataStart + entry.compressedSize;
    if (dataEnd > this.buffer.byteLength) throw new Error(`Truncated ZIP payload: ${name}`);
    const compressed = this.bytesView.slice(dataStart, dataEnd);
    const result = entry.method === 0 ? compressed : await inflateRaw(compressed);
    if (result.byteLength !== entry.uncompressedSize) throw new Error(`ZIP size mismatch after decompression: ${name}`);
    if (crc32(result) !== entry.crc) throw new Error(`ZIP CRC mismatch: ${name}`);
    return result;
  }
}

function parseContentRange(value) {
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+)$/.exec(String(value ?? '').trim());
  if (!match) return null;
  return {start: Number(match[1]), end: Number(match[2]), total: Number(match[3])};
}

function strongValidator(response) {
  const etag = response.headers.get('etag');
  if (etag && !/^W\//i.test(etag)) return etag;
  return response.headers.get('last-modified') || null;
}

async function readResponseBounded(response, maxBytes) {
  if (!response.body) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    total += bytes.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch {}
      throw new Error(`Full-buffer fallback exceeds safe limit (${maxBytes} bytes).`);
    }
    chunks.push(bytes);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.byteLength; }
  return out;
}

class HttpRangeSource {
  constructor(url, {fetchImpl = globalThis.fetch, fetchOptions = {}, limits} = {}) {
    if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable for HTTP Range reading.');
    this.url = String(url);
    this.fetchImpl = fetchImpl;
    this.fetchOptions = fetchOptions;
    this.limits = limits;
    this.totalSize = null;
    this.validator = null;
    this.fullBuffer = null;
    this.requests = 0;
  }

  #baseOptions(headers = {}) {
    return {
      cache: 'no-store',
      credentials: 'same-origin',
      ...this.fetchOptions,
      headers: {...(this.fetchOptions.headers ?? {}), ...headers},
    };
  }

  #checkEncoding(response) {
    const encoding = response.headers.get('content-encoding');
    if (encoding && encoding.toLowerCase() !== 'identity') {
      throw new Error('Byte-range P2LRN reading requires the ZIP response to use identity HTTP content encoding.');
    }
  }

  async probe() {
    const response = await this.fetchImpl(this.url, this.#baseOptions({Range: 'bytes=0-0'}));
    this.requests += 1;
    this.#checkEncoding(response);
    if (response.status === 206) {
      const range = parseContentRange(response.headers.get('content-range'));
      if (!range || range.start !== 0 || range.end !== 0 || !Number.isSafeInteger(range.total) || range.total < 1) {
        response.body?.cancel?.();
        throw new Error('Range response has an invalid or inaccessible Content-Range header. Cross-origin servers must expose Content-Range to the player.');
      }
      if (range.total > this.limits.streamedPackageBytes) {
        response.body?.cancel?.();
        throw new Error(`Remote P2LRN package exceeds streamed archive limit (${range.total} bytes).`);
      }
      const byte = new Uint8Array(await response.arrayBuffer());
      if (byte.byteLength !== 1) throw new Error('Range probe returned an unexpected body length.');
      this.totalSize = range.total;
      this.validator = strongValidator(response);
      return {rangeSupported: true, totalSize: range.total};
    }
    if (response.status === 200) {
      const rawLength = response.headers.get('content-length');
      const declaredLength = rawLength == null ? null : Number(rawLength);
      if (declaredLength != null && (!Number.isSafeInteger(declaredLength) || declaredLength < 0 || declaredLength > this.limits.packageBytes)) {
        response.body?.cancel?.();
        throw new Error('Server ignored HTTP Range and the package is too large for safe full-buffer fallback.');
      }
      const bytes = await readResponseBounded(response, this.limits.packageBytes);
      if (declaredLength != null && bytes.byteLength !== declaredLength) throw new Error('Full-buffer fallback length mismatch.');
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      this.totalSize = bytes.byteLength;
      this.validator = strongValidator(response);
      this.fullBuffer = buffer;
      return {rangeSupported: false, totalSize: bytes.byteLength, buffer};
    }
    throw new Error(`HTTP Range probe failed (${response.status}).`);
  }

  async readRange(start, end) {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) throw new Error('Invalid HTTP byte range.');
    if (this.fullBuffer) {
      if (end >= this.fullBuffer.byteLength) throw new Error('HTTP byte range exceeds package size.');
      return new Uint8Array(this.fullBuffer.slice(start, end + 1));
    }
    if (this.totalSize == null) await this.probe();
    if (end >= this.totalSize) throw new Error('HTTP byte range exceeds package size.');
    const headers = {Range: `bytes=${start}-${end}`};
    if (this.validator) headers['If-Range'] = this.validator;
    const response = await this.fetchImpl(this.url, this.#baseOptions(headers));
    this.requests += 1;
    this.#checkEncoding(response);
    if (response.status === 200) {
      response.body?.cancel?.();
      throw new Error('Remote P2LRN resource changed or stopped honoring byte ranges during reading.');
    }
    if (response.status !== 206) throw new Error(`HTTP Range request failed (${response.status}).`);
    const range = parseContentRange(response.headers.get('content-range'));
    if (!range || range.start !== start || range.end !== end || range.total !== this.totalSize) {
      response.body?.cancel?.();
      throw new Error('HTTP Range response does not match the requested package bytes.');
    }
    const body = new Uint8Array(await response.arrayBuffer());
    if (body.byteLength !== end - start + 1) throw new Error('HTTP Range response body length mismatch.');
    return body;
  }

  async streamRange(start, end) {
    if (this.fullBuffer) {
      const bytes = await this.readRange(start, end);
      return new Blob([bytes]).stream();
    }
    if (this.totalSize == null) await this.probe();
    const headers = {Range: `bytes=${start}-${end}`};
    if (this.validator) headers['If-Range'] = this.validator;
    const response = await this.fetchImpl(this.url, this.#baseOptions(headers));
    this.requests += 1;
    this.#checkEncoding(response);
    if (response.status !== 206) {
      response.body?.cancel?.();
      throw new Error(response.status === 200 ? 'Remote P2LRN resource changed during streaming.' : `HTTP Range stream failed (${response.status}).`);
    }
    const range = parseContentRange(response.headers.get('content-range'));
    if (!range || range.start !== start || range.end !== end || range.total !== this.totalSize || !response.body) {
      response.body?.cancel?.();
      throw new Error('HTTP Range stream does not match the requested package bytes.');
    }
    return response.body;
  }
}

async function resolveRemoteCentralInfo(source) {
  const totalSize = source.totalSize;
  const tailStart = Math.max(0, totalSize - 65633);
  const tail = await source.readRange(tailStart, totalSize - 1);
  const eocd = findEocd(tail, tailStart, totalSize);
  const view = eocd.view;
  const disk = u16(view, eocd.offset + 4);
  const cdDisk = u16(view, eocd.offset + 6);
  const entriesDisk = u16(view, eocd.offset + 8);
  const entriesTotal16 = u16(view, eocd.offset + 10);
  const cdSize32 = u32(view, eocd.offset + 12);
  const cdOffset32 = u32(view, eocd.offset + 16);
  if (disk !== 0 || cdDisk !== 0 || (entriesDisk !== entriesTotal16 && entriesDisk !== 0xFFFF)) throw new Error('Multi-disk ZIP is not supported.');
  const needsZip64 = entriesTotal16 === 0xFFFF || entriesDisk === 0xFFFF || cdSize32 === 0xFFFFFFFF || cdOffset32 === 0xFFFFFFFF;
  if (!needsZip64) return {entriesTotal: entriesTotal16, cdSize: cdSize32, cdOffset: cdOffset32, zip64: false};
  const locator = parseZip64Locator(tail, tailStart, eocd.absoluteOffset);
  if (!locator) throw new Error('ZIP64 locator is missing.');
  const record = await source.readRange(locator.zip64Offset, locator.zip64Offset + 55);
  return {...parseZip64Eocd(record), zip64: true};
}

export class RemoteZipArchive {
  constructor(source, limits) {
    this.source = source;
    this.limits = limits;
    this.entries = new Map();
    this.transport = 'range';
    this.zip64 = false;
    this.totalSize = 0;
  }

  static async open(url, limits, options = {}) {
    const source = new HttpRangeSource(url, {fetchImpl: options.fetchImpl, fetchOptions: options.fetchOptions, limits});
    const probe = await source.probe();
    if (!probe.rangeSupported) {
      const archive = await BufferZipArchive.open(probe.buffer, limits);
      archive.transport = 'buffer-fallback';
      archive.sourceUrl = String(url);
      return archive;
    }
    const archive = new RemoteZipArchive(source, limits);
    archive.totalSize = probe.totalSize;
    const info = await resolveRemoteCentralInfo(source);
    if (info.entriesTotal > limits.entries) throw new Error(`ZIP contains too many entries (${info.entriesTotal}).`);
    if (info.cdSize > limits.centralDirectoryBytes) throw new Error('ZIP central directory exceeds safety limit.');
    if (info.cdOffset + info.cdSize > archive.totalSize) throw new Error('Invalid ZIP central directory bounds.');
    const central = await source.readRange(info.cdOffset, info.cdOffset + info.cdSize - 1);
    archive.entries = parseCentralDirectory(central, info, limits);
    archive.zip64 = info.zip64;
    return archive;
  }

  names() { return [...this.entries.keys()]; }

  async #dataRange(entry) {
    const header = await this.source.readRange(entry.localOffset, entry.localOffset + 29);
    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    if (u32(view, 0) !== ZIP_SIGNATURES.LOCAL) throw new Error(`Invalid local ZIP header: ${entry.name}`);
    const flags = u16(view, 6);
    const method = u16(view, 8);
    const nameLength = u16(view, 26);
    const extraLength = u16(view, 28);
    if (flags & 0x1) throw new Error(`Encrypted local ZIP entry is not allowed: ${entry.name}`);
    if (method !== entry.method) throw new Error(`ZIP compression method mismatch: ${entry.name}`);
    if (nameLength) {
      const rawName = await this.source.readRange(entry.localOffset + 30, entry.localOffset + 30 + nameLength - 1);
      const localName = decodeEntryName(rawName);
      if (localName !== entry.name) throw new Error(`Local/central ZIP name mismatch: ${entry.name}`);
    }
    const dataStart = entry.localOffset + 30 + nameLength + extraLength;
    const dataEnd = dataStart + entry.compressedSize - 1;
    if (dataEnd >= this.totalSize) throw new Error(`Truncated ZIP payload: ${entry.name}`);
    return {dataStart, dataEnd};
  }

  async entryRange(name) {
    const entry = this.entries.get(name);
    if (!entry) throw new Error(`ZIP entry not found: ${name}`);
    const {dataStart, dataEnd} = await this.#dataRange(entry);
    return Object.freeze({
      path: name, method: entry.method, dataStart, dataEnd, compressedSize: entry.compressedSize,
      uncompressedSize: entry.uncompressedSize, crc32: entry.crc, sourceValidator: this.source.validator ?? null,
    });
  }

  async read(name) {
    const entry = this.entries.get(name);
    if (!entry) throw new Error(`ZIP entry not found: ${name}`);
    if (entry.uncompressedSize > this.limits.bufferedEntryBytes) {
      const error = new Error(`ZIP entry is too large for ArrayBuffer reading (${entry.uncompressedSize} bytes): ${name}`);
      error.code = 'P2LRN_ENTRY_REQUIRES_STREAM';
      throw error;
    }
    const {dataStart, dataEnd} = await this.#dataRange(entry);
    const compressed = entry.compressedSize ? await this.source.readRange(dataStart, dataEnd) : new Uint8Array();
    const result = entry.method === 0 ? compressed : await inflateRaw(compressed);
    if (result.byteLength !== entry.uncompressedSize) throw new Error(`ZIP size mismatch after decompression: ${name}`);
    if (crc32(result) !== entry.crc) throw new Error(`ZIP CRC mismatch: ${name}`);
    return result;
  }

  async stream(name) {
    const entry = this.entries.get(name);
    if (!entry) throw new Error(`ZIP entry not found: ${name}`);
    const {dataStart, dataEnd} = await this.#dataRange(entry);
    let stream = entry.compressedSize ? await this.source.streamRange(dataStart, dataEnd) : new Blob([]).stream();
    if (entry.method === 8) {
      let inflater;
      try { inflater = new DecompressionStream('deflate-raw'); }
      catch { throw new Error('This browser does not support deflate-raw ZIP decompression.'); }
      stream = stream.pipeThrough(inflater);
    }
    let size = 0;
    const crc = new Crc32State();
    const verifier = new TransformStream({
      transform(chunk, controller) {
        const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
        size += bytes.byteLength;
        if (size > entry.uncompressedSize) throw new Error(`ZIP size mismatch during streaming: ${name}`);
        crc.update(bytes);
        controller.enqueue(bytes);
      },
      flush() {
        if (size !== entry.uncompressedSize) throw new Error(`ZIP size mismatch after streaming: ${name}`);
        if (crc.digest() !== entry.crc) throw new Error(`ZIP CRC mismatch: ${name}`);
      },
    });
    return stream.pipeThrough(verifier);
  }
}

export async function openRemoteZipArchive(url, limits, options = {}) {
  return RemoteZipArchive.open(url, limits, options);
}
