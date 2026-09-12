export declare const AULAP2P_DOCUMENT_SCHEMA = "aulap2p.documento.extraido.v2";
export declare const AULAP2P_MULTIMODAL_SCHEMA = "aulap2p.documento.multimodal.v2";
export declare const AULAP2P_BRIDGE_SCHEMA = "p2lrn.aulap2p-reader-envelope.v1";
export declare const LEGACY_AULAP2P_BRIDGE_SCHEMA = "p2rln.aulap2p-reader-envelope.v1";
export declare const AULAP2P_PROVENANCE_NS = "https://p2lrn.org/ext/provenance";
export declare class AulaP2PIngestError extends Error {
    constructor(message: string);
}
export interface AulaP2PIngestOptions {
    sourceFile?: string;
    assetRoot?: string;
    language?: string;
    strictProfiles?: boolean;
}
export declare function ingestAulaP2PReader(inputJson: string, output: string, options?: AulaP2PIngestOptions): any;
