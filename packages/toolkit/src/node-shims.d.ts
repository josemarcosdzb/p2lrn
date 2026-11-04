declare module 'node:crypto' {
  export function createHash(name: string): { update(data: Uint8Array | string): any; digest(encoding: 'hex' | 'base64'): string };
  export function randomUUID(): string;
  export function randomBytes(size:number): {toString(encoding:string):string};
  export interface KeyObject { export(options: any): any; }
  export function createPrivateKey(key: any): KeyObject;
  export function createPublicKey(key: any): KeyObject;
  export function generateKeyPairSync(type: 'ed25519'): {privateKey: KeyObject; publicKey: KeyObject};
  export function sign(algorithm: null, data: Uint8Array, key: KeyObject): Uint8Array;
  export function verify(algorithm: null, data: Uint8Array, key: KeyObject, signature: Uint8Array): boolean;
}
declare module 'node:fs' {
  export function readFileSync(path: string | URL): Uint8Array;
  export function chmodSync(path: string | URL, mode: number): void;
  export function unlinkSync(path: string | URL): void;
  export function writeFileSync(path: string | URL, data: Uint8Array | string, options?: {flag?: string; mode?: number}): void;
  export function existsSync(path: string | URL): boolean;
  export function mkdirSync(path: string | URL, options?: {recursive?: boolean}): string | undefined;
  export function lstatSync(path: string | URL): {isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean; size: number};
  export function statSync(path: string | URL): {isFile(): boolean; isDirectory(): boolean; size: number; mtimeMs:number};
  export function readdirSync(path: string | URL, options?: {withFileTypes?: false}): string[];
  export function readdirSync(path: string | URL, options: {withFileTypes: true}): Array<{name:string; isFile():boolean; isDirectory():boolean; isSymbolicLink():boolean}>;
  export function copyFileSync(src: string | URL, dest: string | URL): void;
  export function renameSync(oldPath: string | URL, newPath: string | URL): void;
}
declare module 'node:path' {
  export function resolve(...paths: string[]): string;
  export function relative(from: string, to: string): string;
  export function join(...paths: string[]): string;
  export function dirname(path: string): string;
  export function basename(path: string): string;
  export function extname(path: string): string;
  export const sep: string;
}
declare module 'node:zlib' {
  export function inflateRawSync(data: Uint8Array): Uint8Array;
  export function deflateRawSync(data: Uint8Array, options?: {level?: number}): Uint8Array;
}
declare module 'node:url' { export function pathToFileURL(path: string): URL; }
declare const process: { argv: string[]; exitCode?: number; cwd(): string; platform:string; stdout: {write(s:string):void}; stderr:{write(s:string):void}; once(event:string,handler:any):void; };

declare const Buffer: {
  from(data: Uint8Array | string, encoding?: string): any;
};
declare module 'node:fs' {
  export function rmSync(path: string | URL, options?: {recursive?: boolean; force?: boolean}): void;
}
declare module 'node:path' { export function isAbsolute(path: string): boolean; }
declare module 'node:path' { export function basename(path: string, suffix?: string): string; }

declare module 'node:http' { export function createServer(handler:(req:any,res:any)=>void): any; }

declare module 'node:child_process' { export function spawn(command:string,args?:string[],options?:any): any; }
declare module 'node:url' { export function fileURLToPath(url: URL): string; }
declare module 'node:fs' { export function realpathSync(path: string | URL): string; }
declare module 'node:url' { export function fileURLToPath(url: string | URL): string; }
