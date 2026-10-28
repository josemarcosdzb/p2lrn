export interface P2LRNAnalyticsLearner {id:string;name:string;email?:string;group?:string;cohort?:string;status?:string;tags?:string[];metadata?:Record<string,unknown>;}
export interface P2LRNAnalyticsCourse {id:string;title:string;code?:string;status?:string;maxScore?:number;metadata?:Record<string,unknown>;}
export interface P2LRNAnalyticsEnrollment {id?:string;learnerId:string;courseId:string;status?:string;progress?:number;enrolledAt?:string;startedAt?:string;completedAt?:string;dueAt?:string;metadata?:Record<string,unknown>;}
export interface P2LRNAnalyticsAttempt {id:string;learnerId:string;courseId:string;entityId?:string;status?:string;startedAt?:string;submittedAt?:string;completedAt?:string;updatedAt?:string;progress?:number;score?:number;maxScore?:number;activeTimeMs?:number;metadata?:Record<string,unknown>;}
export interface P2LRNAnalyticsGrade {id?:string;learnerId:string;courseId:string;entityId?:string;value:number;maxValue:number;passed?:boolean;authoritative:boolean;updatedAt?:string;source?:string;metadata?:Record<string,unknown>;}
export interface P2LRNAnalyticsEvent {id?:string;sequence?:number;type:string;category?:string;timestamp:string;learnerId?:string;courseId?:string;attemptId?:string;context?:Record<string,unknown>;payload?:Record<string,unknown>;}
export interface P2LRNAnalyticsDataset {schema?:string;generatedAt?:string;learners:P2LRNAnalyticsLearner[];courses:P2LRNAnalyticsCourse[];enrollments:P2LRNAnalyticsEnrollment[];attempts:P2LRNAnalyticsAttempt[];grades:P2LRNAnalyticsGrade[];events:P2LRNAnalyticsEvent[];metadata?:Record<string,unknown>;}
export interface P2LRNAnalyticsRiskRules {inactiveDays?:number;lowProgress?:number;lowGrade?:number;failedAttempts?:number;}
export interface P2LRNAnalyticsDataSource {load(filters?:Record<string,unknown>):Promise<P2LRNAnalyticsDataset>;}
export interface P2LRNAnalyticsStore {readonly data:P2LRNAnalyticsDataset;replace(value:P2LRNAnalyticsDataset):P2LRNAnalyticsDataset;upsertLearner(value:P2LRNAnalyticsLearner):P2LRNAnalyticsDataset;upsertCourse(value:P2LRNAnalyticsCourse):P2LRNAnalyticsDataset;upsertEnrollment(value:P2LRNAnalyticsEnrollment):P2LRNAnalyticsDataset;upsertAttempt(value:P2LRNAnalyticsAttempt):P2LRNAnalyticsDataset;upsertGrade(value:P2LRNAnalyticsGrade):P2LRNAnalyticsDataset;addEvent(value:P2LRNAnalyticsEvent):P2LRNAnalyticsDataset;subscribe(listener:(dataset:P2LRNAnalyticsDataset)=>void):()=>void;snapshot(options?:{riskRules?:P2LRNAnalyticsRiskRules;activityDays?:number;now?:number}):unknown;}
export declare const P2LRN_ANALYTICS_VERSION:string;
export declare const ANALYTICS_DATASET_SCHEMA:string;
export declare const ANALYTICS_SNAPSHOT_SCHEMA:string;
export declare const DEFAULT_ANALYTICS_RISK_RULES:Readonly<Required<P2LRNAnalyticsRiskRules>>;
export declare function normalizeAnalyticsDataset(input?:Partial<P2LRNAnalyticsDataset>):Readonly<P2LRNAnalyticsDataset>;
export declare function computeAnalyticsSnapshot(input?:Partial<P2LRNAnalyticsDataset>|P2LRNAnalyticsDataset,options?:{riskRules?:P2LRNAnalyticsRiskRules;activityDays?:number;now?:number}):any;
export declare function filterAnalyticsDataset(input:P2LRNAnalyticsDataset,filters?:{courseId?:string;learnerId?:string;from?:string|Date;to?:string|Date}):P2LRNAnalyticsDataset;
export declare function createAnalyticsStore(seed?:Partial<P2LRNAnalyticsDataset>):P2LRNAnalyticsStore;
export declare function createMemoryAnalyticsDataSource(seed?:Partial<P2LRNAnalyticsDataset>):P2LRNAnalyticsDataSource&{store:P2LRNAnalyticsStore};
export declare function createHttpAnalyticsDataSource(options?:{url?:string;fetch?:typeof fetch;headers?:HeadersInit|((filters:Record<string,unknown>)=>HeadersInit|Promise<HeadersInit>);credentials?:RequestCredentials}):P2LRNAnalyticsDataSource;
export declare function analyticsToCsv(snapshotOrDataset:unknown,options?:{kind?:'learners'|'courses'|'grades';locale?:string}):string;
export declare class P2LRNAnalyticsElement extends HTMLElement {
  data:P2LRNAnalyticsDataset|null;
  dataSource:P2LRNAnalyticsDataSource|null;
  src:string;
  view:string;
  courseId:string;
  period:string;
  locale:string;
  refresh():Promise<P2LRNAnalyticsDataset>;
  setView(view:string):void;
  selectLearner(id:string):void;
  selectCourse(id:string):void;
  exportCsv(kind?:'learners'|'courses'|'grades'):string;
}
declare global {interface HTMLElementTagNameMap {'p2lrn-analytics':P2LRNAnalyticsElement;} var P2LRNAnalyticsReady:Promise<unknown>|undefined; var P2LRNAnalytics:Record<string,unknown>|undefined;}
