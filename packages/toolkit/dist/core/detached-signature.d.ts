import { ValidationError } from './errors.js';
export declare const SIGNATURE_SCHEMA_ID: string;
export declare const LEGACY_SIGNATURE_SCHEMA_ID: string;
export declare const SIGNATURE_INPUT_SCHEMA_ID: string;
export declare const LEGACY_SIGNATURE_INPUT_SCHEMA_ID: string;
export declare const KEY_ID_PREFIX = "urn:p2lrn:key:ed25519:sha256:";
export declare const LEGACY_KEY_ID_PREFIX = "urn:p2rln:key:ed25519:sha256:";
export declare class DetachedSignatureError extends ValidationError {
}
export declare function keyIdForPublicKey(key: unknown): string;
export declare function generateKeypair(privatePath: string, publicPath: string, force?: boolean): any;
export declare function targetForManifest(m: any, scope: string): any;
export declare function signatureStatement(e: any): any;
export declare function signPackage(packagePath: string, privateKeyPath: string, output?: string, scope?: string, force?: boolean): any;
export declare function loadSignature(path: string): any;
export declare function verifyPackageSignature(packagePath: string, signaturePath: string, options?: {
    trustedPublicKeys?: string[];
    requireTrusted?: boolean;
}): any;
