export interface SchemaIssue { path: string; message: string; }
export declare function schemaIssues(schemaOrId: any, value: any, registry?: Record<string, any>): SchemaIssue[];
export declare function validateSchema(schemaOrId: any, value: any, label?: string): any;
export declare function schemaById(id: string): any;
