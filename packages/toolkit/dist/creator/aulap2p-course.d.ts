export declare const AULAP2P_COURSE_SCHEMA = "aulap2p.curso.v1";
export declare const AULAP2P_COURSE_ENVELOPE = "p2lrn.aulap2p-course-envelope.v1";
export declare const LEGACY_AULAP2P_COURSE_ENVELOPE = "p2rln.aulap2p-course-envelope.v1";
export declare const AULAP2P_COURSE_IMPORT = "p2lrn.aulap2p-course-import.v1";
export declare const LEGACY_AULAP2P_COURSE_IMPORT = "p2rln.aulap2p-course-import.v1";
export declare const AULAP2P_COURSE_EXT = "https://p2lrn.org/ext/aulap2p/course-v1";
export declare class AulaP2PCourseError extends Error {
    constructor(message: string);
}
export interface AulaP2PCourseIngestOptions {
    assetRoot?: string;
    language?: string;
    strictProfiles?: boolean;
}
export declare function ingestAulaP2PCourse(courseJson: string, output: string, options?: AulaP2PCourseIngestOptions): any;
export declare function extractAulaP2PCourse(packagePath: string, outputJson: string): any;
