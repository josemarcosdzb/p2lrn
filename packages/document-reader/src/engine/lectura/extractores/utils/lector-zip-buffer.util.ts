import {ReaderInputError as BadRequestException} from '../../../reader-error.js';
import JSZip from 'jszip';

export interface EntradaZipBuffer {
  nombre: string;
  buffer: Buffer;
}

interface EntradaJsZip {
  name: string;
  dir: boolean;
  async(type: 'nodebuffer'): Promise<Buffer>;
  _data?: { uncompressedSize?: number; compressedSize?: number };
}

function limite(nombre: string, fallback: number) {
  const raw = process.env[nombre]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function limiteOpcional(nombre: string) {
  const raw = process.env[nombre]?.trim();
  if (!raw) return 0;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function excedeLimite(value: number | bigint, limit: number) {
  if (limit <= 0) return false;
  return typeof value === 'bigint'
    ? value > BigInt(limit)
    : value > limit;
}

const MAX_ZIP_ENTRADAS = limite('IMPORT_ZIP_MAX_ENTRADAS', 5_000);
// La cuota real es la autoridad funcional de tamaño. Estos dos límites sólo
// actúan cuando el operador define un techo técnico explícito para el proceso.
const MAX_ZIP_ENTRY_BYTES = limiteOpcional('IMPORT_ZIP_MAX_ENTRY_BYTES');
const MAX_ZIP_TOTAL_BYTES = limiteOpcional('IMPORT_ZIP_MAX_TOTAL_BYTES');
const MAX_ZIP_RATIO_COMPRESION = limite(
  'IMPORT_ZIP_MAX_RATIO_COMPRESION',
  250,
);
const MAX_ZIP_NOMBRE_BYTES = limite('IMPORT_ZIP_MAX_NOMBRE_BYTES', 2_048);
const MAX_ZIP_PROFUNDIDAD_RUTA = limite(
  'IMPORT_ZIP_MAX_PROFUNDIDAD_RUTA',
  32,
);

export async function leerEntradasZipBuffer(
  buffer: Buffer,
): Promise<Map<string, Buffer>> {
  const archivos = await cargarArchivosZip(buffer);

  const entradas = new Map<string, Buffer>();
  let totalDescomprimido = 0n;

  for (const archivo of archivos) {
    validarNombreEntradaZip(archivo.name);
    const tamanoDeclarado = obtenerTamanoDeclarado(archivo);
    const tamanoComprimido = obtenerTamanoComprimido(archivo);
    validarTamanoEntradaZip(archivo.name, tamanoComprimido, tamanoDeclarado);

    if (
      excedeLimite(
        totalDescomprimido + BigInt(tamanoDeclarado),
        MAX_ZIP_TOTAL_BYTES,
      )
    ) {
      throw new BadRequestException(
        `El ZIP supera el techo técnico configurado de ${MAX_ZIP_TOTAL_BYTES} bytes descomprimidos`,
      );
    }

    const contenido = await archivo.async('nodebuffer');
    if (excedeLimite(contenido.length, MAX_ZIP_ENTRY_BYTES)) {
      throw new BadRequestException(
        `La entrada ZIP ${archivo.name} supera el techo técnico configurado de ${MAX_ZIP_ENTRY_BYTES} bytes`,
      );
    }
    validarRatioReal(archivo.name, tamanoComprimido, contenido.length);

    totalDescomprimido += BigInt(contenido.length);
    if (excedeLimite(totalDescomprimido, MAX_ZIP_TOTAL_BYTES)) {
      throw new BadRequestException(
        `El ZIP supera el techo técnico configurado de ${MAX_ZIP_TOTAL_BYTES} bytes descomprimidos`,
      );
    }

    entradas.set(archivo.name, contenido);
  }

  return entradas;
}

export async function estimarTamanoDescomprimidoZip(
  buffer: Buffer,
): Promise<bigint> {
  if (!pareceZip(buffer)) return 0n;
  const archivos = await cargarArchivosZip(buffer);
  return archivos.reduce(
    (total, archivo) => total + BigInt(obtenerTamanoDeclarado(archivo)),
    0n,
  );
}

async function cargarArchivosZip(buffer: Buffer): Promise<EntradaJsZip[]> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer, { checkCRC32: false });
  } catch {
    throw new BadRequestException('El ZIP no se puede abrir o está dañado');
  }

  const archivos = (Object.values(zip.files) as EntradaJsZip[]).filter(
    (archivo) => !archivo.dir && !archivo.name.includes('__MACOSX/'),
  );

  if (archivos.length > MAX_ZIP_ENTRADAS) {
    throw new BadRequestException(
      `El ZIP supera el límite estructural de ${MAX_ZIP_ENTRADAS} entradas`,
    );
  }

  const nombres = new Set<string>();
  let totalDeclarado = 0n;
  for (const archivo of archivos) {
    validarNombreEntradaZip(archivo.name);
    const claveNombre = normalizarClaveNombre(archivo.name);
    if (nombres.has(claveNombre)) {
      throw new BadRequestException(
        `El ZIP contiene una ruta interna duplicada: ${archivo.name}`,
      );
    }
    nombres.add(claveNombre);

    const tamanoDeclarado = obtenerTamanoDeclarado(archivo);
    const tamanoComprimido = obtenerTamanoComprimido(archivo);
    validarTamanoEntradaZip(archivo.name, tamanoComprimido, tamanoDeclarado);
    totalDeclarado += BigInt(tamanoDeclarado);
    if (excedeLimite(totalDeclarado, MAX_ZIP_TOTAL_BYTES)) {
      throw new BadRequestException(
        `El ZIP supera el techo técnico configurado de ${MAX_ZIP_TOTAL_BYTES} bytes descomprimidos`,
      );
    }
  }

  return archivos;
}

function pareceZip(buffer: Buffer) {
  if (buffer.length < 4) return false;
  const signature = buffer.readUInt32LE(0);
  return (
    signature === 0x04034b50 ||
    signature === 0x06054b50 ||
    signature === 0x08074b50
  );
}

export async function listarEntradasZipBuffer(
  buffer: Buffer,
): Promise<EntradaZipBuffer[]> {
  const entradas = await leerEntradasZipBuffer(buffer);
  return [...entradas.entries()].map(([nombre, contenido]) => ({
    nombre,
    buffer: contenido,
  }));
}

function obtenerTamanoDeclarado(archivo: EntradaJsZip) {
  const value = Number(archivo._data?.uncompressedSize ?? 0);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function obtenerTamanoComprimido(archivo: EntradaJsZip) {
  const value = Number(archivo._data?.compressedSize ?? 0);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function validarNombreEntradaZip(nombre: string) {
  if (!nombre || Buffer.byteLength(nombre, 'utf8') > MAX_ZIP_NOMBRE_BYTES) {
    throw new BadRequestException('El ZIP contiene una ruta interna inválida');
  }

  const normalizado = nombre.normalize('NFC').replace(/\\/g, '/');
  const segmentos = normalizado.split('/').filter(Boolean);
  if (
    nombre.includes('\0') ||
    nombre.includes('\\') ||
    normalizado.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalizado) ||
    segmentos.some((segmento) => segmento === '..' || segmento === '.') ||
    segmentos.length > MAX_ZIP_PROFUNDIDAD_RUTA
  ) {
    throw new BadRequestException('El ZIP contiene rutas internas no permitidas');
  }
}

function normalizarClaveNombre(nombre: string) {
  return nombre
    .normalize('NFC')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/{2,}/g, '/')
    .toLocaleLowerCase('es-ES');
}

function validarTamanoEntradaZip(
  nombre: string,
  compressedSize: number,
  uncompressedSize: number,
) {
  if (excedeLimite(uncompressedSize, MAX_ZIP_ENTRY_BYTES)) {
    throw new BadRequestException(
      `La entrada ZIP ${nombre} supera el techo técnico configurado de ${MAX_ZIP_ENTRY_BYTES} bytes`,
    );
  }

  validarRatioReal(nombre, compressedSize, uncompressedSize);
}

function validarRatioReal(
  nombre: string,
  compressedSize: number,
  uncompressedSize: number,
) {
  if (
    compressedSize > 0 &&
    uncompressedSize / compressedSize > MAX_ZIP_RATIO_COMPRESION
  ) {
    throw new BadRequestException(
      `La entrada ZIP ${nombre} tiene una ratio de compresión no permitida`,
    );
  }
}
