export interface StudioSaveOptions {root?:string;coursePath?:string;filename?:string}
export interface StudioRequestSaveOptions {
  root?:string;
  coursePath?:string;
  allowClientPath?:boolean;
  maxBytes?:number;
}
export function saveP2LRNStudioPackage(bytes:Uint8Array|ArrayBuffer,options?:StudioSaveOptions):Promise<{ok:true;path:string;coursePath:string;filename:string;bytes:number}>;
export function handleP2LRNStudioSave(request:Request,options?:StudioRequestSaveOptions):Promise<Response>;
export function readP2LRNStudioDocument(bytes:Uint8Array|ArrayBuffer,options?:{filename?:string;mediaType?:string}):Promise<unknown>;
export function handleP2LRNStudioReader(request:Request,options?:{maxBytes?:number}):Promise<Response>;
export function convertP2LRNStudioExternalPackage(bytes:Uint8Array|ArrayBuffer,options?:{filename?:string}):Promise<{bytes:Uint8Array;report:unknown}>;
export function handleP2LRNStudioExternalImport(request:Request,options?:{maxBytes?:number}):Promise<Response>;


export interface StudioHostAuthorizationOptions {
  operation:'save'|'read'|'import';
  coursePath?:string;
  authenticate?: (request:Request)=>unknown|Promise<unknown>;
  authorize?: (context:{principal:unknown;operation:'save'|'read'|'import';coursePath:string;request:Request})=>boolean|Promise<boolean>;
  checkCsrf?: (request:Request,principal:unknown)=>boolean|Promise<boolean>;
}
/** Returns a rejection response, or null only after all Host checks passed. Never reads the upload body. */
export function authorizeP2LRNStudioRequest(request:Request,options:StudioHostAuthorizationOptions):Promise<Response|null>;
