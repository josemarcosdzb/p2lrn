export declare function readerId(prefix: string): string;
export declare function extensionOf(name: string): string;
export declare function decodeXml(value: string): string;
export declare function cleanText(value: string): string;
export declare function xmlText(value: string): string;
export declare function mediaTypeForAsset(path: string): string | undefined;
export declare function normalizeZipRelative(base: string, target: string): string;
export declare function xmlAttributes(tag: string): Record<string, string>;
