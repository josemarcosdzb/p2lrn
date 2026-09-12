import {BufferZipArchive, safeZipPath} from './zip-source.js';

export const PACKAGE_MEMBER_PROTOCOL = 'p2lrn-package-member/1';
export const LEGACY_PACKAGE_MEMBER_PROTOCOL = 'p2rln-package-member/1';
export const DEFAULT_NESTED_ZIP_LIMITS = Object.freeze({
  entries: 10000,
  entryBytes: 512 * 1024 * 1024,
  totalUncompressedBytes: 2 * 1024 * 1024 * 1024,
  centralDirectoryBytes: 64 * 1024 * 1024,
  compressionRatio: 250,
});

const archivesByPackage = new WeakMap();

function normalizeMemberPath(path) {
  const value = String(path ?? '').replace(/^\.\//, '');
  return safeZipPath(value);
}

function nestedCache(pkg) {
  let cache = archivesByPackage.get(pkg);
  if (!cache) {
    cache = new Map();
    archivesByPackage.set(pkg, cache);
  }
  return cache;
}

export async function openNestedPackage(pkg, packagePath, limits = DEFAULT_NESTED_ZIP_LIMITS) {
  if (!pkg || typeof pkg.payload !== 'function') throw new TypeError('P2LRN package is required.');
  const normalizedPackagePath = safeZipPath(String(packagePath ?? ''));
  const cache = nestedCache(pkg);
  if (!cache.has(normalizedPackagePath)) {
    cache.set(normalizedPackagePath, (async () => {
      const outer = pkg.payload(normalizedPackagePath);
      const bytes = await outer.read();
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const archive = await BufferZipArchive.open(buffer, limits);
      return Object.freeze({
        protocol: PACKAGE_MEMBER_PROTOCOL,
        packagePath: normalizedPackagePath,
        payload: outer,
        archive,
        names: () => archive.names(),
        has: (member) => archive.entries.has(normalizeMemberPath(member)),
        read: (member) => archive.read(normalizeMemberPath(member)),
      });
    })());
  }
  return cache.get(normalizedPackagePath);
}

export async function createPackageMemberPayload(pkg, representation, limits = DEFAULT_NESTED_ZIP_LIMITS) {
  const location = representation?.location;
  if (location?.type !== 'package-member') throw new TypeError('Representation is not a package-member.');
  const packagePath = safeZipPath(String(location.package ?? ''));
  const member = normalizeMemberPath(location.member);
  const nested = await openNestedPackage(pkg, packagePath, limits);
  const entry = nested.archive.entries.get(member);
  if (!entry) {
    const error = new Error(`Nested package member not found: ${member}`);
    error.code = 'P2LRN_PACKAGE_MEMBER_NOT_FOUND';
    throw error;
  }
  const mediaType = String(representation.mediaType ?? 'application/octet-stream');
  return Object.freeze({
    protocol: PACKAGE_MEMBER_PROTOCOL,
    locationType: 'package-member',
    path: `${packagePath}#${member}`,
    packagePath,
    member,
    mediaType,
    size: entry.uncompressedSize,
    byteDigest: null,
    contentDigest: null,
    seekable: false,
    compressionMethod: entry.method,
    archiveEntry: Object.freeze({
      localOffset: entry.localOffset,
      method: entry.method,
      compressedSize: entry.compressedSize,
      uncompressedSize: entry.uncompressedSize,
      crc32: entry.crc,
    }),
    nested,
    read: () => nested.read(member),
    stream: async () => new Blob([await nested.read(member)], {type: mediaType}).stream(),
    blob: async (type = mediaType) => new Blob([await nested.read(member)], {type: type || 'application/octet-stream'}),
    rangeIntegrity: async () => null,
    rangeDescriptor: async () => null,
  });
}

export async function representationPayload(pkg, representation) {
  const location = representation?.location;
  if (location?.type === 'embedded') return pkg.payload(location.path);
  if (location?.type === 'package-member') return createPackageMemberPayload(pkg, representation);
  const error = new Error(`Unsupported P2LRN representation location: ${location?.type ?? 'missing'}`);
  error.code = 'P2LRN_REPRESENTATION_LOCATION_UNSUPPORTED';
  throw error;
}
