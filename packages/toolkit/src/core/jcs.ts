import {ValidationError} from './errors.js';
import {validateIJsonValue} from './ijson.js';

const encoder = new TextEncoder();

function quote(value: string): string { return JSON.stringify(value); }
function keyCompare(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }

export function canonicalize(value: unknown): string {
  validateIJsonValue(value, 'JCS input');
  if (value === null) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ValidationError('JCS forbids non-finite numbers');
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return quote(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort(keyCompare).map((key) => `${quote(key)}:${canonicalize(record[key])}`).join(',')}}`;
  }
  throw new ValidationError(`unsupported JSON value for JCS: ${typeof value}`);
}

export function canonicalizeBytes(value: unknown): Uint8Array { return encoder.encode(canonicalize(value)); }
