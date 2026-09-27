import {ReaderInputError} from '../../reader-error.js';
import type { ResultadoDeteccionArchivo } from '../../deteccion-archivo/types/resultado-deteccion-archivo.type.js';
import type { DocumentoExtraidoCanonico } from '../types/documento-extraido-canonico.type.js';
import { crearTempId } from '../../utils/temp-id.util.js';
import type { ArchivoImportacionSubido } from '../../types/archivo-importacion-subido.type.js';
import { leerEntradasZipBuffer } from './utils/lector-zip-buffer.util.js';
import {ReaderAssetCollector as IngestionAssetsService} from '../../assets/reader-asset-collector.js';
import type {StoredExtractedImageAsset} from '../../assets/reader-assets.types.js';
import {
  DocumentAssetPlacementService,
  type DocumentoAssetPlacement,
} from '../placement/document-asset-placement.service.js';

interface HojaWorkbookXlsx {
  nombre: string;
  path: string;
  orden: number;
  estado: 'visible' | 'hidden' | 'veryHidden';
}

interface ResultadoLecturaHojaXlsx {
  filas: string[][];
  formulas: number;
  formulasSinValorCache: number;
  celdasFecha: number;
  celdasError: number;
  rangosCombinados: string[];
}

function limpiarXml(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, value: string) =>
      String.fromCodePoint(Number(value)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, value: string) =>
      String.fromCodePoint(Number.parseInt(value, 16)),
    )
    .replace(/\s+/g, ' ')
    .trim();
}

export class ExtractorExcelService {
  constructor(
    private readonly ingestionAssets?: IngestionAssetsService,
    private readonly placementService?: DocumentAssetPlacementService,
  ) {}

  async extraer(params: {
    archivo: ArchivoImportacionSubido;
    deteccion: ResultadoDeteccionArchivo;
    usuarioId?: number;
  }): Promise<DocumentoExtraidoCanonico> {
    const entradas = await leerEntradasZipBuffer(params.archivo.buffer);
    const sharedStrings = this.leerSharedStrings(
      entradas.get('xl/sharedStrings.xml')?.toString('utf8') ?? '',
    );
    const estilosFecha = this.estilosFecha(
      entradas.get('xl/styles.xml')?.toString('utf8') ?? '',
    );
    const hojasWorkbook = this.hojasWorkbook(entradas);
    const imagePlacements =
      this.placementService?.resolverXlsxImagenes(entradas) ?? [];

    if (hojasWorkbook.length === 0) {
      throw new ReaderInputError(
        'No se encontraron hojas legibles dentro del XLSX.',
      );
    }

    const tablas: DocumentoExtraidoCanonico['tablas'] = [];
    const bloques: DocumentoExtraidoCanonico['bloques'] = [];
    const diagnosticoHojas: Array<Record<string, unknown>> = [];

    for (const hojaWorkbook of hojasWorkbook) {
      const sheetBuffer = entradas.get(hojaWorkbook.path);
      if (!sheetBuffer) {
        diagnosticoHojas.push({
          nombre: hojaWorkbook.nombre,
          path: hojaWorkbook.path,
          estado: hojaWorkbook.estado,
          legible: false,
        });
        continue;
      }

      const lectura = this.leerSheet(
        sheetBuffer.toString('utf8'),
        sharedStrings,
        estilosFecha,
      );
      diagnosticoHojas.push({
        nombre: hojaWorkbook.nombre,
        path: hojaWorkbook.path,
        estado: hojaWorkbook.estado,
        legible: true,
        filas: lectura.filas.length,
        formulas: lectura.formulas,
        formulasSinValorCache: lectura.formulasSinValorCache,
        celdasFecha: lectura.celdasFecha,
        celdasError: lectura.celdasError,
        rangosCombinados: lectura.rangosCombinados,
      });
      if (lectura.filas.length === 0) continue;

      const columnas = this.nombresColumnasUnicos(lectura.filas[0]);
      const filas = lectura.filas.slice(1).map((row) =>
        Object.fromEntries(
          columnas.map((columna, index) => [columna, row[index] ?? '']),
        ),
      );

      tablas.push({
        tempId: crearTempId('xlsx_tabla'),
        orden: hojaWorkbook.orden,
        hoja: hojaWorkbook.nombre,
        nombre: hojaWorkbook.nombre,
        columnas,
        filas,
      });
    }

    const imagenesGuardadas =
      params.usuarioId && this.ingestionAssets
        ? await this.ingestionAssets.extraerYGuardarAssets({
            usuarioId: params.usuarioId,
            buffer: params.archivo.buffer,
            mimeType: params.deteccion.mimeType,
            nombreArchivo: params.deteccion.nombreArchivo,
            includeDataUrl: false,
            maxImages: Number(
              process.env.IMPORT_XLSX_MAX_IMAGES ?? Number.POSITIVE_INFINITY,
            ),
            packageHint: 'DOCUMENT',
            runOcr: true,
          })
        : [];

    const imagenesPorRuta =
      this.placementService?.indexarPorRuta(imagenesGuardadas) ??
      new Map(
        imagenesGuardadas
          .filter((asset) => asset.source.path)
          .map((asset) => [asset.source.path!, asset]),
      );
    const imagenesReferenciadas = new Set<string>();

    for (const placement of imagePlacements) {
      const ruta =
        this.placementService?.normalizarRuta(placement.path) ?? placement.path;
      const imagen = imagenesPorRuta.get(ruta);
      if (!imagen) continue;
      imagenesReferenciadas.add(imagen.id);
      bloques.push(
        this.crearBloqueImagenXlsx(
          imagen,
          bloques.length + 1,
          params.deteccion.nombreArchivo,
          placement,
        ),
      );
    }

    for (const imagen of imagenesGuardadas) {
      if (imagenesReferenciadas.has(imagen.id)) continue;
      bloques.push(
        this.crearBloqueImagenXlsx(
          imagen,
          bloques.length + 1,
          params.deteccion.nombreArchivo,
        ),
      );
    }

    const hojasOcultas = hojasWorkbook.filter(
      (hoja) => hoja.estado !== 'visible',
    );
    const formulasSinCache = diagnosticoHojas.reduce(
      (total, hoja) => total + Number(hoja.formulasSinValorCache ?? 0),
      0,
    );

    return {
      version: 'p2lrn.source-reader.documento.extraido.v1',
      origen: {
        nombreArchivo: params.deteccion.nombreArchivo,
        extensionOriginal: params.deteccion.extension,
        mimeOriginal: params.deteccion.mimeType,
        tipoArchivoDetectado: 'XLSX',
        estrategiaExtraccion: 'XLSX_WORKBOOK_V3',
      },
      metadatos: {
        hojas: hojasWorkbook.map((hoja) => hoja.nombre),
      },
      bloques,
      tablas,
      raw: {
        xlsx: {
          version: 'XLSX_WORKBOOK_V3',
          representacionFilas: 'TABLAS_ONLY',
          hojas: diagnosticoHojas,
          formulasRecalculadas: false,
          hojasOcultas: hojasOcultas.map((hoja) => ({
            nombre: hoja.nombre,
            estado: hoja.estado,
          })),
        },
      },
      advertencias: [
        ...(imagenesGuardadas.length > 0
          ? [
              {
                ruta: 'xlsx.imagenes',
                mensaje: `XLSX: ${imagenesGuardadas.length} imagen(es) guardada(s) con anclaje por hoja/celda cuando drawing*.xml lo permite.`,
                nivel: 'INFO' as const,
              },
            ]
          : []),
        ...(hojasOcultas.length > 0
          ? [
              {
                ruta: 'xlsx.hojas-ocultas',
                mensaje: `${hojasOcultas.length} hoja(s) oculta(s) se conservaron y se marcaron en metadatos; revisa si forman parte del curso.`,
                nivel: 'ADVERTENCIA' as const,
              },
            ]
          : []),
        ...(formulasSinCache > 0
          ? [
              {
                ruta: 'xlsx.formulas-sin-cache',
                mensaje: `${formulasSinCache} fórmula(s) no contienen un valor calculado almacenado. El importador no ejecuta Excel ni recalcula fórmulas.`,
                nivel: 'ADVERTENCIA' as const,
              },
            ]
          : []),
      ],
    };
  }

  private crearBloqueImagenXlsx(
    imagen: StoredExtractedImageAsset,
    orden: number,
    documentoOrigen: string,
    placement?: DocumentoAssetPlacement,
  ) {
    return {
      tempId: crearTempId('xlsx_imagen'),
      tipo: 'IMAGEN_REFERENCIADA' as const,
      texto: imagen.name,
      orden,
      hoja:
        placement?.hoja ??
        (imagen.source.path?.includes('xl/') ? 'Excel' : undefined),
      posicion: placement?.posicion,
      archivoId: imagen.archivo.id,
      archivo: imagen.archivo,
      fuente: {
        tipo: 'XLSX' as const,
        raw: {
          rutaArchivo: imagen.source.path,
          archivoId: imagen.archivo.id,
          archivoGuardado: imagen.archivo,
          ocr: imagen.ocr,
          celda: placement?.cell,
          celdaDesde: placement?.cellFrom,
          celdaHasta: placement?.cellTo,
          placement: placement?.raw,
          documentoOrigen,
        },
      },
    };
  }

  private hojasWorkbook(entradas: Map<string, Buffer>): HojaWorkbookXlsx[] {
    const workbookXml = entradas.get('xl/workbook.xml')?.toString('utf8') ?? '';
    const relsXml =
      entradas.get('xl/_rels/workbook.xml.rels')?.toString('utf8') ?? '';
    const targets = new Map<string, string>();

    for (const match of relsXml.matchAll(/<Relationship\b([^>]*)\/?\s*>/gi)) {
      const atributos = match[1] ?? '';
      const id = this.atributoXml(atributos, 'Id');
      const target = this.atributoXml(atributos, 'Target');
      if (!id || !target) continue;
      const normalizado = this.normalizarRutaWorkbook(target);
      targets.set(id, normalizado);
    }

    const hojas: HojaWorkbookXlsx[] = [];
    for (const match of workbookXml.matchAll(/<sheet\b([^>]*)\/?\s*>/gi)) {
      const atributos = match[1] ?? '';
      const nombre = this.decodificarAtributoXml(
        this.atributoXml(atributos, 'name') ?? `Hoja ${hojas.length + 1}`,
      );
      const relationshipId =
        this.atributoXml(atributos, 'r:id') ??
        this.atributoXml(atributos, 'id');
      const path = relationshipId ? targets.get(relationshipId) : undefined;
      if (!path || !/^xl\/worksheets\/[^/]+\.xml$/i.test(path)) continue;
      const state = this.atributoXml(atributos, 'state');
      const estado: HojaWorkbookXlsx['estado'] =
        state === 'hidden' || state === 'veryHidden' ? state : 'visible';
      hojas.push({ nombre, path, orden: hojas.length + 1, estado });
    }

    if (hojas.length > 0) return hojas;

    return [...entradas.keys()]
      .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
      .sort((a, b) => this.numeroHoja(a) - this.numeroHoja(b))
      .map((path, index) => ({
        nombre: `Hoja ${index + 1}`,
        path,
        orden: index + 1,
        estado: 'visible' as const,
      }));
  }

  private leerSharedStrings(xml: string): string[] {
    if (!xml) return [];
    return (xml.match(/<si\b[\s\S]*?<\/si>/g) ?? []).map((item) =>
      limpiarXml(item),
    );
  }

  private leerSheet(
    xml: string,
    sharedStrings: string[],
    estilosFecha: Set<number>,
  ): ResultadoLecturaHojaXlsx {
    const rows: string[][] = [];
    const rowMatches = xml.match(/<row\b[\s\S]*?<\/row>/g) ?? [];
    let formulas = 0;
    let formulasSinValorCache = 0;
    let celdasFecha = 0;
    let celdasError = 0;

    for (const rowXml of rowMatches) {
      const cells: string[] = [];
      const cellMatches = rowXml.match(/<c\b[\s\S]*?<\/c>/g) ?? [];

      for (const cellXml of cellMatches) {
        const type = cellXml.match(/\st="([^"]+)"/)?.[1];
        const ref = cellXml.match(/\sr="([A-Z]+)\d+"/i)?.[1];
        const styleId = Number(cellXml.match(/\ss="(\d+)"/)?.[1] ?? -1);
        const cellIndex = ref ? this.indiceColumna(ref) : cells.length;
        const valueMatch = cellXml.match(/<v>([\s\S]*?)<\/v>/);
        const rawValue = valueMatch?.[1] ?? '';
        const inline = cellXml.match(/<is>([\s\S]*?)<\/is>/)?.[1];
        const formula = cellXml.match(/<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/)?.[1];
        if (formula !== undefined) {
          formulas += 1;
          if (!valueMatch) formulasSinValorCache += 1;
        }

        let value = rawValue;
        if (type === 's') value = sharedStrings[Number(rawValue)] ?? '';
        else if (type === 'inlineStr' && inline) value = limpiarXml(inline);
        else if (type === 'str') value = limpiarXml(rawValue);
        else if (type === 'b') value = rawValue === '1' ? 'TRUE' : 'FALSE';
        else if (type === 'e') {
          value = rawValue;
          celdasError += 1;
        } else if (
          estilosFecha.has(styleId) &&
          rawValue &&
          Number.isFinite(Number(rawValue))
        ) {
          const fecha = this.fechaExcel(Number(rawValue));
          if (fecha) {
            value = fecha;
            celdasFecha += 1;
          }
        }

        cells[cellIndex] = limpiarXml(value);
      }

      if (cells.some((cell) => String(cell ?? '').trim())) rows.push(cells);
    }

    return {
      filas: rows,
      formulas,
      formulasSinValorCache,
      celdasFecha,
      celdasError,
      rangosCombinados: [
        ...xml.matchAll(/<mergeCell\b[^>]*\bref="([^"]+)"[^>]*\/?\s*>/gi),
      ].map((match) => match[1]),
    };
  }

  private estilosFecha(xml: string) {
    const custom = new Map<number, string>();
    for (const match of xml.matchAll(/<numFmt\b([^>]*)\/?\s*>/gi)) {
      const atributos = match[1] ?? '';
      const id = Number(this.atributoXml(atributos, 'numFmtId'));
      const code = this.atributoXml(atributos, 'formatCode') ?? '';
      if (Number.isFinite(id)) custom.set(id, this.decodificarAtributoXml(code));
    }

    const builtIn = new Set([
      14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34,
      35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58,
    ]);
    const fechaStyles = new Set<number>();
    const cellXfs = xml.match(/<cellXfs\b[\s\S]*?<\/cellXfs>/i)?.[0] ?? '';
    const xfs = [...cellXfs.matchAll(/<xf\b([^>]*)\/?\s*>/gi)];
    xfs.forEach((match, index) => {
      const id = Number(this.atributoXml(match[1] ?? '', 'numFmtId'));
      const code = custom.get(id) ?? '';
      const limpio = code
        .replace(/"[^"]*"/g, '')
        .replace(/\[[^\]]*]/g, '')
        .toLowerCase();
      if (builtIn.has(id) || /[ymdhs]/.test(limpio)) fechaStyles.add(index);
    });
    return fechaStyles;
  }

  private fechaExcel(serial: number) {
    if (!Number.isFinite(serial) || serial < 0 || serial > 2_958_465) {
      return undefined;
    }
    const millis = Math.round((serial - 25569) * 86_400_000);
    const date = new Date(millis);
    if (Number.isNaN(date.getTime())) return undefined;
    const tieneHora = Math.abs(serial - Math.trunc(serial)) > 1e-9;
    return tieneHora
      ? date.toISOString().replace(/\.000Z$/, 'Z')
      : date.toISOString().slice(0, 10);
  }

  private nombresColumnasUnicos(headers: string[]) {
    const contador = new Map<string, number>();
    return headers.map((header, index) => {
      const base = String(header ?? '').trim() || `columna_${index + 1}`;
      const key = base.toLocaleLowerCase('es-ES');
      const numero = (contador.get(key) ?? 0) + 1;
      contador.set(key, numero);
      return numero === 1 ? base : `${base}_${numero}`;
    });
  }

  private atributoXml(atributos: string, nombre: string) {
    const escapado = nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return atributos.match(
      new RegExp(`(?:^|\\s)${escapado}="([^"]*)"`, 'i'),
    )?.[1];
  }

  private decodificarAtributoXml(value: string) {
    return value
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }

  private normalizarRutaWorkbook(target: string) {
    const partes = target.replace(/\\/g, '/').split('/');
    const stack = ['xl'];
    for (const parte of partes) {
      if (!parte || parte === '.') continue;
      if (parte === '..') stack.pop();
      else stack.push(parte);
    }
    return stack.join('/');
  }

  private numeroHoja(path: string) {
    return Number(path.match(/sheet(\d+)\.xml/i)?.[1] ?? Number.MAX_SAFE_INTEGER);
  }

  private indiceColumna(ref: string) {
    return (
      ref
        .toUpperCase()
        .split('')
        .reduce((acc, char) => acc * 26 + char.charCodeAt(0) - 64, 0) - 1
    );
  }
}
