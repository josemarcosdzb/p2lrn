export interface ZipLimits {
    entries: number;
    entryBytes: number;
    totalUncompressedBytes: number;
    centralDirectoryBytes: number;
    compressionRatio: number;
}
export declare const DEFAULT_ZIP_LIMITS: ZipLimits;
export interface ZipEntry {
    name: string;
    flags: number;
    method: number;
    crc: number;
    compressedSize: number;
    uncompressedSize: number;
    localOffset: number;
    externalAttributes: number;
}
export declare function safeZipPath(name: string): string;
export declare function crc32(bytes: Uint8Array): number;
export declare class ZipArchive {
    readonly entries: Map<string, ZipEntry>;
    readonly zip64: boolean;
    readonly bytes: Uint8Array;
    private constructor();
    static open(input: Uint8Array, limits?: ZipLimits): ZipArchive;
    names(): string[];
    read(name: string): Uint8Array;
}
export declare function prefersStored(mediaType: string | undefined): boolean;
export interface ZipWriteEntry {
    path: string;
    data: Uint8Array;
    mediaType?: string;
    method?: 0 | 8;
}
export declare function writeZip(entries: ZipWriteEntry[], options?: {
    forceZip64?: boolean;
}): Uint8Array;
/**
 * Extract a ZIP-backed .p2lrn into a NEW, private directory. This is the
 * supported disk-extraction boundary; callers never join untrusted ZIP paths
 * themselves. Does not overwrite an existing output directory.
 *
 * The parent directory must be controlled by the host. A hostile process with
 * write privileges to that parent can race a final rename on some filesystems.
 */
export declare const SAFE_UNPACK_LIMITS: ZipLimits;
export declare function unpackP2LRNArchive(archivePath: string, outputDirectory: string, options?: {
    limits?: ZipLimits;
    maxArchiveBytes?: number;
}): Promise<{
    directory: string;
    files: number;
    totalBytes: number;
}>;
