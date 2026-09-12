import type { Manifest } from './types.js';
export declare function sha256(data: Uint8Array): string;
export declare function baseMediaType(mediaType: string | undefined): string;
export declare function contentDigest(data: Uint8Array, mediaType: string, label: string): string;
export declare function normalizeIntegrityInput(manifest: Manifest): unknown;
export declare function computeContentRoot(manifest: Manifest): string;
