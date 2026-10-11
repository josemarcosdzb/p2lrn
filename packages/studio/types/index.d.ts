export interface P2LRNStudioSaveDetail { filename:string; coursePath:string; result:unknown; }
export class P2LRNStudioElement extends HTMLElement {
  static readonly p2lrnStudioVersion:string;
  src:string;
  saveEndpoint:string;
  coursePath:string;
  createCourse(options?:{title?:string;language?:string;description?:string}):Promise<unknown>;
  openFile(file:File):Promise<void>;
  openUrl(url:string):Promise<void>;
  setMode(mode:'edit'|'preview'):Promise<void>;
  addUnit(options?:{title?:string;language?:string}):Promise<unknown>;
  addLesson(options?:{title?:string;language?:string}):Promise<unknown>;
  exportPackage():Promise<{bytes:Uint8Array;filename:string;manifest:unknown;graph:unknown}>;
  download():Promise<void>;
  saveCourse():Promise<unknown>;
}
export const P2LRN_STUDIO_VERSION:string;
declare global { interface HTMLElementTagNameMap {'p2lrn-studio':P2LRNStudioElement} var P2LRNStudioReady:Promise<unknown>|undefined; }
