#!/usr/bin/env node
export declare function buildWebSdk(root: string, output: string): {
    output: string;
    files: number;
    release: {
        schema: string;
        version: string;
        webSdkVersion: string;
        toolkitVersion: string;
        coreVersion: string;
        entrypoints: {
            classic: string;
            module: string;
            serviceWorker: string;
        };
        files: {
            path: string;
            bytes: number;
            sha256: string;
            sri: string;
        }[];
    };
};
export declare function main(argv?: string[]): void;
