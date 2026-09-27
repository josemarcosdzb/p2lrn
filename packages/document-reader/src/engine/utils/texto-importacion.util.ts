export function limpiarTextoImportacion(value: unknown): string {
  return String(value ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+(,)/g, '$1')
    .trim();
}

export function normalizarLineaImportacion(value: unknown): string {
  return limpiarTextoImportacion(value).replace(/\s+/g, ' ').trim();
}

export function textoNoVacio(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function truncarTexto(value: unknown, max = 10000): string {
  const texto = limpiarTextoImportacion(value);
  return texto.length > max ? texto.slice(0, max) : texto;
}
