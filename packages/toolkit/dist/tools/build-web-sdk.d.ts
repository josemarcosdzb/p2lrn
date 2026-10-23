#!/usr/bin/env node
export declare function buildWebSdk(root: string, output: string): Promise<{
    output: string;
    files: number;
    release: {
        schema: string;
        version: string;
        webSdkVersion: string;
        toolkitVersion: string;
        coreVersion: string;
        h5pStandaloneVersion: any;
        threeVersion: any;
        rapier3dVersion: any;
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
}>;
export declare function main(argv?: string[]): Promise<void>;
