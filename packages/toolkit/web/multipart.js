import {Sha256State} from './stream-integrity.js';
import {BufferZipArchive, safeZipPath} from './zip-source.js';

export const MULTIPART_PROFILE = 'https://p2lrn.org/profile/multipart';
export const MULTIPART_MEDIA_TYPE = 'application/vnd.p2lrn.multipart+json';
const decoder = new TextDecoder('utf-8', {fatal:true});

function fail(message, code = 'P2LRN_MULTIPART_INVALID') {
  const error = new Error(message);
  error.code = code;
  return error;
}
function baseMediaType(value) {
  return String(value ?? '').split(';', 1)[0].trim().toLowerCase();
}
function multipartExtension(representation) {
  const value = representation?.extensions?.[MULTIPART_PROFILE];
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}
function multipartMember(representation) {
  const value = multipartExtension(representation)?.member;
  return value == null ? null : safeZipPath(String(value));
}
export function isMultipartRepresentation(representation) {
  return Boolean(multipartExtension(representation));
}
function safeRelativeHref(value) {
  const href = String(value ?? '');
  if (!href || href.startsWith('/') || href.startsWith('//') || href.includes('\\') || href.includes('?') || href.includes('#')) return false;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(href)) return false;
  const parts = href.split('/');
  return parts.every((part) => part && part !== '.' && part !== '..');
}
function digest(bytes) {
  return new Sha256State().update(bytes).digestString();
}
function validateDescriptor(value, representation) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail('Multipart descriptor must be an object.');
  if (value.version !== '1') throw fail(`Unsupported multipart descriptor version: ${String(value.version)}`);
  if (typeof value.mediaType !== 'string' || !value.mediaType) throw fail('Multipart descriptor requires mediaType.');
  if (multipartMember(representation) == null && baseMediaType(value.mediaType) !== baseMediaType(representation?.mediaType)) {
    throw fail(`Multipart mediaType mismatch: representation=${representation?.mediaType}, descriptor=${value.mediaType}`);
  }
  if (!Number.isSafeInteger(value.size) || value.size < 1) throw fail('Multipart descriptor size must be a positive safe integer.');
  if (!/^sha256:[0-9a-f]{64}$/u.test(String(value.byteDigest ?? ''))) throw fail('Multipart descriptor requires a SHA-256 byteDigest.');
  if (!Array.isArray(value.parts) || value.parts.length < 2 || value.parts.length > 10000) throw fail('Multipart descriptor requires 2..10000 parts.');
  let sum = 0;
  const seen = new Set();
  const parts = value.parts.map((part, index) => {
    if (!part || typeof part !== 'object' || Array.isArray(part)) throw fail(`Multipart part ${index} must be an object.`);
    const href = String(part.href ?? '');
    if (!safeRelativeHref(href)) throw fail(`Unsafe multipart part href: ${href || '(empty)'}`);
    if (seen.has(href)) throw fail(`Duplicate multipart part href: ${href}`);
    seen.add(href);
    const size = Number(part.size);
    if (!Number.isSafeInteger(size) || size < 1) throw fail(`Multipart part ${href} has invalid size.`);
    const byteDigest = String(part.byteDigest ?? '');
    if (!/^sha256:[0-9a-f]{64}$/u.test(byteDigest)) throw fail(`Multipart part ${href} has invalid SHA-256 digest.`);
    sum += size;
    if (!Number.isSafeInteger(sum)) throw fail('Multipart total size exceeds interoperable safe integer range.');
    return Object.freeze({href, size, byteDigest});
  });
  if (sum !== value.size) throw fail(`Multipart size mismatch: parts sum to ${sum}, descriptor declares ${value.size}.`);
  return Object.freeze({
    version:'1',
    mediaType:value.mediaType,
    size:value.size,
    byteDigest:String(value.byteDigest),
    parts:Object.freeze(parts),
  });
}

async function descriptorFor(pkg, representation) {
  const extension = multipartExtension(representation);
  if (!extension || extension.version !== '1') throw fail('Multipart representation extension must declare version "1".');
  const location = representation?.location;
  if (location?.type !== 'embedded' || typeof location.path !== 'string') {
    throw fail('Multipart representation must point to an embedded descriptor.');
  }
  const payload = pkg?.payload?.(location.path);
  if (!payload) throw fail(`Multipart descriptor is unavailable: ${location.path}`);
  if (baseMediaType(payload.mediaType) !== MULTIPART_MEDIA_TYPE) {
    throw fail(`Multipart descriptor has wrong media type: ${payload.mediaType}`);
  }
  let object;
  try { object = JSON.parse(decoder.decode(await payload.read())); }
  catch (error) { throw fail(`Multipart descriptor is not valid UTF-8 JSON: ${error?.message ?? String(error)}`); }
  return validateDescriptor(object, representation);
}

function packageBaseUrl(pkg) {
  const source = pkg?.sourceUrl;
  if (!source) throw fail('Multipart delivery requires the outer .p2lrn package to have a source URL.', 'P2LRN_MULTIPART_BASE_URL_REQUIRED');
  try {
    return new URL(String(source), globalThis.location?.href ?? 'http://127.0.0.1/');
  } catch {
    throw fail(`Invalid outer package URL for multipart delivery: ${String(source)}`, 'P2LRN_MULTIPART_BASE_URL_REQUIRED');
  }
}

export async function createMultipartPayload(pkg, representation) {
  const descriptor = await descriptorFor(pkg, representation);
  const base = packageBaseUrl(pkg);
  let loaded = null;

  async function loadAll() {
    if (loaded) return loaded;
    loaded = (async () => {
      const chunks = [];
      const full = new Sha256State();
      let total = 0;
      for (const part of descriptor.parts) {
        const url = new URL(part.href, base);
        if (url.origin !== base.origin) throw fail(`Multipart part escaped package origin: ${part.href}`, 'P2LRN_MULTIPART_CROSS_ORIGIN');
        let response;
        try {
          response = await globalThis.fetch(url.href, {credentials:'same-origin'});
        } catch (error) {
          throw fail(`Multipart part fetch failed: ${part.href}: ${error?.message ?? String(error)}`, 'P2LRN_MULTIPART_FETCH_FAILED');
        }
        if (!response.ok) throw fail(`Multipart part fetch failed (${response.status}): ${part.href}`, 'P2LRN_MULTIPART_FETCH_FAILED');
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength !== part.size) {
          throw fail(`Multipart part size mismatch for ${part.href}: expected ${part.size}, got ${bytes.byteLength}`, 'P2LRN_MULTIPART_INTEGRITY_FAILED');
        }
        const actual = digest(bytes);
        if (actual !== part.byteDigest) {
          throw fail(`Multipart part SHA-256 mismatch for ${part.href}`, 'P2LRN_MULTIPART_INTEGRITY_FAILED');
        }
        total += bytes.byteLength;
        if (total > descriptor.size) throw fail('Multipart payload exceeds declared total size.', 'P2LRN_MULTIPART_INTEGRITY_FAILED');
        full.update(bytes);
        chunks.push(bytes);
      }
      if (total !== descriptor.size) throw fail(`Multipart total size mismatch: expected ${descriptor.size}, got ${total}`, 'P2LRN_MULTIPART_INTEGRITY_FAILED');
      const fullDigest = full.digestString();
      if (fullDigest !== descriptor.byteDigest) throw fail('Multipart logical payload SHA-256 mismatch.', 'P2LRN_MULTIPART_INTEGRITY_FAILED');
      return Object.freeze({chunks:Object.freeze(chunks), total, digest:fullDigest});
    })();
    return loaded;
  }

  async function read() {
    const verified = await loadAll();
    const out = new Uint8Array(verified.total);
    let offset = 0;
    for (const chunk of verified.chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return out;
  }

  const member = multipartMember(representation);
  if (member != null) {
    const packageBytes = await read();
    const buffer = packageBytes.buffer.slice(packageBytes.byteOffset, packageBytes.byteOffset + packageBytes.byteLength);
    const archive = await BufferZipArchive.open(buffer);
    const entry = archive.entries.get(member);
    if (!entry) throw fail(`Multipart package member not found: ${member}`, 'P2LRN_MULTIPART_MEMBER_NOT_FOUND');
    const nested = Object.freeze({
      protocol:'p2lrn-package-member/1',
      packagePath:String(representation.location.path),
      multipart:true,
      archive,
      names:() => archive.names(),
      has:(path) => archive.entries.has(safeZipPath(String(path))),
      read:(path) => archive.read(safeZipPath(String(path))),
    });
    const mediaType = String(representation.mediaType || 'application/octet-stream');
    return Object.freeze({
      protocol:'p2lrn-multipart-member/1',
      multipart:true,
      locationType:'multipart-member',
      path:`${String(representation.location.path)}#${member}`,
      packagePath:String(representation.location.path),
      member,
      mediaType,
      size:entry.uncompressedSize,
      byteDigest:null,
      contentDigest:null,
      seekable:false,
      compressionMethod:entry.method,
      descriptor,
      nested,
      read:() => nested.read(member),
      stream:async () => new Blob([await nested.read(member)], {type:mediaType}).stream(),
      blob:async (type = mediaType) => new Blob([await nested.read(member)], {type:type || mediaType}),
      rangeIntegrity:async () => null,
      rangeDescriptor:async () => null,
    });
  }

  return Object.freeze({
    protocol:'p2lrn-multipart/1',
    multipart:true,
    locationType:'multipart',
    path:String(representation.location.path),
    mediaType:String(representation.mediaType || descriptor.mediaType),
    size:descriptor.size,
    byteDigest:descriptor.byteDigest,
    contentDigest:descriptor.byteDigest,
    seekable:false,
    compressionMethod:null,
    descriptor,
    read,
    stream:async () => new Blob((await loadAll()).chunks, {type:descriptor.mediaType}).stream(),
    blob:async (type = descriptor.mediaType) => new Blob((await loadAll()).chunks, {type:type || descriptor.mediaType}),
    rangeIntegrity:async () => null,
    rangeDescriptor:async () => null,
  });
}
