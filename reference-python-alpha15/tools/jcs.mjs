#!/usr/bin/env node
// Minimal RFC 8785 JCS serializer for parsed JSON values.
// Key ordering relies on JavaScript's UTF-16 code unit string ordering.

function canonicalize(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('JCS forbids non-finite numbers');
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
  }
  throw new Error('Unsupported JSON value');
}

let input = '';
for await (const chunk of process.stdin) input += chunk;
const value = JSON.parse(input);
process.stdout.write(canonicalize(value));
