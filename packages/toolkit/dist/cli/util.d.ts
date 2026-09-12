export declare class CliError extends Error {
}
export declare function parse(argv: string[]): {
    positional: string[];
    options: Map<string, string[]>;
};
export declare function flag(p: ReturnType<typeof parse>, name: string): boolean;
export declare function opt(p: ReturnType<typeof parse>, name: string, def?: string): string | undefined;
export declare function opts(p: ReturnType<typeof parse>, name: string): string[];
export declare function req(value: string | undefined, label: string): string;
export declare function printJson(value: any): void;
export declare function fail(prefix: string, e: unknown): never;
export declare class CliExit extends Error {
}
export declare function isMain(moduleUrl: string): boolean;
