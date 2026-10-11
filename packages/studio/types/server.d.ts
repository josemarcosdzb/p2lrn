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
