export interface P2LRNStudioSaveDetail { filename:string; coursePath:string; result:unknown; }
export class P2LRNStudioElement extends HTMLElement {
  static readonly p2lrnStudioVersion:string;
  src:string;
  saveEndpoint:string;
  readerEndpoint:string;
  importEndpoint:string;
  offlineRuntimeBaseUrl:string;
  coursePath:string;
  createCourse(options?:{title?:string;language?:string;description?:string;author?:string;createdAt?:string;license?:string;copyrightHolder?:string}):Promise<unknown>;
  openFile(file:File):Promise<void>;
  openUrl(url:string):Promise<void>;
  setMode(mode:'edit'|'preview'):Promise<void>;
  addUnit(options?:{title?:string;language?:string}):Promise<unknown>;
  addLesson(options?:{title?:string;language?:string}):Promise<unknown>;
  addContent(kind:string):Promise<unknown>;
  addResourceFile(file:File):Promise<unknown>;
  importDocument(file:File):Promise<unknown>;
  importExternalPackage(file:File):Promise<unknown>;
  exportPackage():Promise<{bytes:Uint8Array;filename:string;manifest:unknown;graph:unknown}>;
  download():Promise<void>;
  showOfflineExportDialog():void;
  exportOfflineAssignment(options?:{
    runtimeBaseUrl?:string|null;
    availableFrom?:string|null;
    dueAt?:string|null;
    attemptDurationSeconds?:number|null;
    maxAttempts?:number;
    allowResume?:boolean;
    activityTracking?:boolean;
    participantLabel?:string|null;
  }):Promise<{bytes:Uint8Array;filename:string;assignment:unknown;course:unknown;runtimeRelease:unknown}>;
  downloadOfflineAssignment(options?:Record<string,unknown>):Promise<unknown>;
  reviewOfflineResult(file:File):Promise<unknown>;
  saveCourse():Promise<unknown>;
}
export const P2LRN_STUDIO_VERSION:string;
declare global { interface HTMLElementTagNameMap {'p2lrn-studio':P2LRNStudioElement} var P2LRNStudioReady:Promise<unknown>|undefined; }
