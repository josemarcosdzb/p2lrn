export type P2LRNAnalyticsHostGrant={
  role:'learner'|'teacher'|'admin';
  learnerId?:string;
  tenantId?:string;
  allowedLearnerIds?:string[];
  allowPii?:boolean;
  allowAuthoritativeGrades?:boolean;
};
export type P2LRNAnalyticsDatasetHandlerOptions={
  allowedOrigins:string[];
  authenticate:(request:any)=>unknown|Promise<unknown>;
  authorize:(context:{
    principal:unknown;tenantId:string;courseId:string;operation:'analytics:read';
  })=>P2LRNAnalyticsHostGrant|null|false|Promise<P2LRNAnalyticsHostGrant|null|false>;
  loadDataset:(context:{principal:unknown;tenantId:string;courseId:string})=>unknown|Promise<unknown>;
  basePath?:string;
  maxResponseBytes?:number;
};
export declare function createP2LRNAnalyticsDatasetHandler(options:P2LRNAnalyticsDatasetHandlerOptions):
  (request:any,response:any,next?:()=>void)=>Promise<void>;
