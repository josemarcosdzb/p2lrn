import { ValidationError } from './errors.js';
export declare const COMPONENT_CATALOG_SCHEMA_ID: string;
export declare const COMPONENT_EDITOR_SCHEMA_ID: string;
export declare class ComponentAuthoringError extends ValidationError {
}
export declare function resolveReferenceDocument(identifier: string): any;
export declare class ReferenceComponentCatalog {
    readonly document: any;
    private definitions;
    constructor(document?: any);
    private validateDefinition;
    definition(id: string, version: string): any | null;
    list(): any[];
    authoringDocuments(id: string, version: string): any;
    validateInstanceData(instance: any, requireKnown?: boolean): any;
}
export declare function referenceComponentCatalog(): ReferenceComponentCatalog;
