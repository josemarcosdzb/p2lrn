export declare const AULAP2P_QUESTION_TYPE: Record<string, string>;
export declare class AulaP2PQuestionnaireError extends Error {
    constructor(message: string);
}
export declare function questionFromAulaP2P(question: any, index: number): any;
export declare function questionnaireFromAulaP2P(quiz: any, language?: string): any;
/** Serialize the reconciled questionnaire exactly like Python json.dumps(sort_keys=True,separators=(",",":"))
 * for the numeric fields produced by _positive_number. This is kept only for cross-language
 * Alpha15 byte parity; semantic JSON consumers should use questionnaireFromAulaP2P(). */
export declare function serializeAulaP2PQuestionnaire(payload: any): string;
