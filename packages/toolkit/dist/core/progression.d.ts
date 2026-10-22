import type { GraphDocument, GraphEntity, Manifest } from './types.js';
export declare const PROGRESSION_REQUIREMENTS: readonly ["viewed", "completed", "passed"];
export declare function progressionExtension(entity: GraphEntity): Record<string, unknown> | null;
export declare function validateProgression(graph: GraphDocument, manifest: Manifest): void;
