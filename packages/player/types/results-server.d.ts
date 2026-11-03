import type {IncomingMessage,ServerResponse} from 'node:http';
export interface P2LRNResultPrincipal {
  tenantId:string;
  issuer:string;
  mode?:'platform'|'code';
  subjectId?:string;
  code?:string;
}
export declare function createP2LRNResultsHttpHandler(options:{
  directory:string;
  basePath?:string;
  authenticate:(request:IncomingMessage)=>P2LRNResultPrincipal|null|Promise<P2LRNResultPrincipal|null>;
  authorize:(input:{principal:P2LRNResultPrincipal;action:'write'|'read-own'|'read-course';courseId:string})=>boolean|Promise<boolean>;
  checkCsrf:(request:IncomingMessage,principal:P2LRNResultPrincipal)=>boolean|Promise<boolean>;
}):(request:IncomingMessage,response:ServerResponse,next?:()=>void)=>Promise<void>;
