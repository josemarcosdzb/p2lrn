type JsonValue = null | boolean | number | string | JsonValue[] | {
    [key: string]: JsonValue;
};
export declare function validateIJsonValue(value: unknown, label?: string): void;
export declare function parseIJson(data: Uint8Array, label?: string): JsonValue;
export {};
