import {ValidationError} from './errors.js';

const decoder = new TextDecoder('utf-8', {fatal: true});
const SAFE_INT = Number.MAX_SAFE_INTEGER;

type JsonValue = null | boolean | number | string | JsonValue[] | {[key: string]: JsonValue};

class Parser {
  private i = 0;
  constructor(private readonly text: string, private readonly label: string) {}

  parse(): JsonValue {
    this.ws();
    const value = this.value();
    this.ws();
    if (this.i !== this.text.length) this.fail('trailing data');
    return value;
  }
  private fail(message: string): never { throw new ValidationError(`${this.label}: invalid JSON/I-JSON at offset ${this.i}: ${message}`); }
  private ws(): void { while (this.i < this.text.length && /[\x20\x09\x0a\x0d]/.test(this.text[this.i]!)) this.i += 1; }
  private value(): JsonValue {
    const c = this.text[this.i];
    if (c === '"') return this.string();
    if (c === '{') return this.object();
    if (c === '[') return this.array();
    if (c === 't' && this.text.slice(this.i, this.i + 4) === 'true') { this.i += 4; return true; }
    if (c === 'f' && this.text.slice(this.i, this.i + 5) === 'false') { this.i += 5; return false; }
    if (c === 'n' && this.text.slice(this.i, this.i + 4) === 'null') { this.i += 4; return null; }
    if (c === '-' || (c != null && c >= '0' && c <= '9')) return this.number();
    return this.fail('expected JSON value');
  }
  private string(): string {
    const start = this.i++;
    let escaped = false;
    while (this.i < this.text.length) {
      const code = this.text.charCodeAt(this.i);
      if (!escaped && code === 0x22) {
        this.i += 1;
        const token = this.text.slice(start, this.i);
        let value: string;
        try { value = JSON.parse(token) as string; } catch { return this.fail('invalid string escape'); }
        validateIJsonValue(value, this.label);
        return value;
      }
      if (!escaped && code < 0x20) return this.fail('unescaped control character in string');
      if (!escaped && code === 0x5c) escaped = true; else escaped = false;
      this.i += 1;
    }
    return this.fail('unterminated string');
  }
  private number(): number {
    const rest = this.text.slice(this.i);
    const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(rest);
    if (!m) return this.fail('invalid number');
    this.i += m[0].length;
    const value = Number(m[0]);
    if (!Number.isFinite(value)) return this.fail('non-finite number');
    if (!m[0].includes('.') && !/[eE]/.test(m[0])) {
      try {
        const big = BigInt(m[0]);
        if (big > BigInt(SAFE_INT) || big < BigInt(-SAFE_INT)) return this.fail(`integer outside interoperable IEEE-754 safe range: ${m[0]}`);
      } catch { return this.fail('invalid integer'); }
    }
    return value;
  }
  private array(): JsonValue[] {
    this.i += 1; this.ws();
    const out: JsonValue[] = [];
    if (this.text[this.i] === ']') { this.i += 1; return out; }
    while (true) {
      this.ws(); out.push(this.value()); this.ws();
      const c = this.text[this.i++];
      if (c === ']') return out;
      if (c !== ',') return this.fail('expected comma or ]');
    }
  }
  private object(): {[key: string]: JsonValue} {
    this.i += 1; this.ws();
    const out: {[key: string]: JsonValue} = {};
    const keys = new Set<string>();
    if (this.text[this.i] === '}') { this.i += 1; return out; }
    while (true) {
      this.ws();
      if (this.text[this.i] !== '"') return this.fail('object member name must be a string');
      const key = this.string();
      if (keys.has(key)) throw new ValidationError(`${this.label}: duplicate JSON member name: ${JSON.stringify(key)}`);
      keys.add(key); this.ws();
      if (this.text[this.i++] !== ':') return this.fail('expected colon');
      this.ws(); out[key] = this.value(); this.ws();
      const c = this.text[this.i++];
      if (c === '}') return out;
      if (c !== ',') return this.fail('expected comma or }');
    }
  }
}

export function validateIJsonValue(value: unknown, label = 'JSON'): void {
  if (typeof value === 'string') {
    for (let i = 0; i < value.length; i += 1) {
      const c = value.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff) {
        const n = value.charCodeAt(i + 1);
        if (!(n >= 0xdc00 && n <= 0xdfff)) throw new ValidationError(`${label}: unpaired Unicode surrogate is not allowed`);
        i += 1;
      } else if (c >= 0xdc00 && c <= 0xdfff) throw new ValidationError(`${label}: unpaired Unicode surrogate is not allowed`);
    }
  } else if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ValidationError(`${label}: non-finite number`);
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) throw new ValidationError(`${label}: integer outside interoperable IEEE-754 safe range: ${value}`);
  } else if (Array.isArray(value)) {
    for (const item of value) validateIJsonValue(item, label);
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) { validateIJsonValue(key, label); validateIJsonValue(item, label); }
  }
}

export function parseIJson(data: Uint8Array, label = 'JSON'): JsonValue {
  let text: string;
  try { text = decoder.decode(data); } catch (error) { throw new ValidationError(`${label}: not valid UTF-8`, {cause: error}); }
  return new Parser(text, label).parse();
}
