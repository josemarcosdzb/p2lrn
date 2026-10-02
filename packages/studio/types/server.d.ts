export interface StudioSaveOptions {root?:string;coursePath?:string;filename?:string}
export function saveP2LRNStudioPackage(bytes:Uint8Array|ArrayBuffer,options?:StudioSaveOptions):Promise<{ok:true;path:string;coursePath:string;filename:string;bytes:number}>;
export function handleP2LRNStudioSave(request:Request,options?:{root?:string;maxBytes?:number}):Promise<Response>;
