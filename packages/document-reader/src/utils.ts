let sequence = 0;

export function nextId(prefix: string) {
  sequence += 1;
  return `${prefix}_${sequence.toString(36)}`;
}

export function normalizeText(value: string) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

export function decodeXmlEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export function stripTags(value: string) {
  return normalizeText(
    decodeXmlEntities(
      value
        .replace(/<br\s*\/?\s*>/gi, '\n')
        .replace(/<\/p\s*>/gi, '\n')
        .replace(/<\/div\s*>/gi, '\n')
        .replace(/<\/li\s*>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
    )
  );
}

export function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function arrayValue<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  return value == null ? [] : [value as T];
}
