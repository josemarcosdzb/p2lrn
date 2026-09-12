export declare const NATIVE_QUESTIONNAIRE_PROFILE: string;
export declare const NATIVE_QUESTIONNAIRE_SCHEMA: string;
export declare const NATIVE_QUESTIONNAIRE_MEDIA_TYPE: "application/vnd.p2lrn.questionnaire+json";
export declare const NATIVE_QUESTIONNAIRE_VERSION = "0.4.0";
export declare function validateQuestionnaire(payload: any): any;
export declare function normalizeQuestionText(value: any): string;
export declare function scoreQuestion(question: any, answer: any): any;
export declare function scoreQuestionnaire(payload: any, answers: any): any;
