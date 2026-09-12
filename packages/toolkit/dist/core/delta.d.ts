import { ValidationError } from './errors.js';
export declare const DELTA_SCHEMA_ID: string;
export declare const DELTA_MANIFEST = "META-INF/delta.json";
export declare const TARGET_MANIFEST = "target/META-INF/manifest.json";
export declare const TARGET_GRAPH = "target/content/graph.json";
export declare class DeltaError extends ValidationError {
}
export declare function inspectDelta(path: string): any;
export declare function createDelta(base: string, target: string, output: string, force?: boolean): any;
export declare function applyDelta(base: string, delta: string, output: string, force?: boolean): any;
