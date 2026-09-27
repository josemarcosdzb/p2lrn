import {ReaderInputError} from '../../reader-error.js';
import type { ResultadoDeteccionArchivo } from '../../deteccion-archivo/types/resultado-deteccion-archivo.type.js';
import type { DocumentoExtraidoCanonico } from '../types/documento-extraido-canonico.type.js';
import { crearTempId } from '../../utils/temp-id.util.js';
import { columnasTablaUnicas, filaConEnfasisEsCabecera } from './utils/tabla-documento.util.js';
import type { ArchivoImportacionSubido } from '../../types/archivo-importacion-subido.type.js';
import { leerEntradasZipBuffer } from './utils/lector-zip-buffer.util.js';
import {ReaderAssetCollector as IngestionAssetsService} from '../../assets/reader-asset-collector.js';
import type {StoredExtractedImageAsset} from '../../assets/reader-assets.types.js';
import {
  DocumentAssetPlacementService,
  type DocumentoAssetPlacement,
} from '../placement/document-asset-placement.service.js';

interface EstiloDocx {
  id: string;
  nombre?: string;
  basedOn?: string;
  outlineLevel?: number;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  spacingBefore?: number;
  spacingAfter?: number;
}

function limpiarXml(value: string): string {
  return value
    .replace(/<w:(?:br|cr)[^>]*\/>/g, '\n')
    .replace(/<w:tab[^>]*\/>/g, '\t')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

export class ExtractorDocxService {
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
    const documentXml = entradas.get('word/document.xml')?.toString('utf8');

    if (!documentXml) {
      throw new ReaderInputError(
        'No se pudo leer word/document.xml dentro del DOCX.',
      );
    }

    const stylesXml = entradas.get('word/styles.xml')?.toString('utf8') ?? '';
    const numberingXml = entradas.get('word/numbering.xml')?.toString('utf8') ?? '';
    const estilos = this.extraerEstilos(stylesXml);
    const numeraciones = this.extraerNumeraciones(numberingXml);
    const bloques: DocumentoExtraidoCanonico['bloques'] = [];
    const tablas = this.extraerTablas(documentXml);
    const paragraphs: string[] =
      documentXml.match(/<w:p[\s\S]*?<\/w:p>/g) ?? [];
    const placements = this.placementService?.resolverDocxImagenes(entradas) ?? [];
    const placementsPorParrafo = new Map<number, DocumentoAssetPlacement[]>();
    let tituloDocumento: string | undefined;

    for (const placement of placements) {
      const indice = placement.paragraphIndex ?? Number.MAX_SAFE_INTEGER;
      placementsPorParrafo.set(indice, [
        ...(placementsPorParrafo.get(indice) ?? []),
        placement,
      ]);
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
              process.env.IMPORT_DOCX_MAX_IMAGES ?? Number.POSITIVE_INFINITY,
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

    paragraphs.forEach((paragraph, paragraphIndex) => {
      const texto = limpiarXml(paragraph);
      const styleId =
        paragraph.match(/<w:pStyle[^>]+w:val="([^"]+)"/i)?.[1] ?? '';
      const estiloResuelto = this.resolverEstilo(styleId, estilos);
      const nombreEstilo = estiloResuelto.nombre || styleId;
      const nivel = this.nivelHeadingDocx(
        styleId,
        nombreEstilo,
        estiloResuelto.outlineLevel,
      );
      const fontSize =
        this.fontSizeDirecto(paragraph) ?? estiloResuelto.fontSize;
      const bold = this.boldDirecto(paragraph) ?? estiloResuelto.bold ?? false;
      const italic = this.italicDirecto(paragraph) ?? estiloResuelto.italic ?? false;
      const spacingBefore =
        this.spacingDirecto(paragraph, 'before') ??
        estiloResuelto.spacingBefore ??
        0;
      const spacingAfter =
        this.spacingDirecto(paragraph, 'after') ??
        estiloResuelto.spacingAfter ??
        0;
      const lista = this.infoNumeracionParrafo(paragraph, numeraciones);

      if (texto) {
        if (!tituloDocumento && /^(?:title|titulo|título)$/i.test(nombreEstilo)) {
          tituloDocumento = texto.replace(/\s+/g, ' ').trim();
        }
        const partes = texto
          .split('\n')
          .map((parte) => parte.trim())
          .filter(Boolean);
        for (const parte of partes) {
          bloques.push({
            tempId: crearTempId(nivel ? 'docx_heading' : 'docx_parrafo'),
            tipo: nivel ? 'TITULO' : lista ? 'LISTA' : 'PARRAFO',
            texto: parte,
            nivel,
            orden: bloques.length + 1,
            estilo: {
              fontSize,
              bold,
              italic,
            },
            fuente: {
              tipo: 'DOCX',
              raw: {
                estilo: nombreEstilo,
                styleId,
                outlineLevel: estiloResuelto.outlineLevel,
                headingLevel: nivel,
                fontSize,
                bold,
                italic,
                separacionAntes: spacingBefore,
                separacionDespues: spacingAfter,
                numId: lista?.numId,
                numLevel: lista?.level,
                numFmt: lista?.format,
                paragraphIndex,
                documentoOrigen: params.deteccion.nombreArchivo,
              },
            },
          });
        }
      }

      const imagenesParrafo = placementsPorParrafo.get(paragraphIndex) ?? [];
      for (const placement of imagenesParrafo) {
        const ruta =
          this.placementService?.normalizarRuta(placement.path) ?? placement.path;
        const imagen = imagenesPorRuta.get(ruta);
        if (!imagen) continue;
        imagenesReferenciadas.add(imagen.id);
        bloques.push(
          this.crearBloqueImagenDocx(
            imagen,
            bloques.length + 1,
            params.deteccion.nombreArchivo,
            placement,
          ),
        );
      }
    });

    for (const imagen of imagenesGuardadas) {
      if (imagenesReferenciadas.has(imagen.id)) continue;
      bloques.push(
        this.crearBloqueImagenDocx(
          imagen,
          bloques.length + 1,
          params.deteccion.nombreArchivo,
        ),
      );
    }

    if (bloques.length === 0) {
      throw new ReaderInputError('El DOCX no contiene texto ni imágenes legibles.');
    }

    return {
      version: 'p2lrn.source-reader.documento.extraido.v1',
      origen: {
        nombreArchivo: params.deteccion.nombreArchivo,
        extensionOriginal: params.deteccion.extension,
        mimeOriginal: params.deteccion.mimeType,
        tipoArchivoDetectado: 'DOCX',
        estrategiaExtraccion: 'DOCX_XML',
      },
      metadatos: {
        tituloDetectado:
          tituloDocumento ??
          bloques.find(
            (bloque) =>
              bloque.tipo === 'TITULO' &&
              !/^(?:toc|tableofcontents|indice|índice)/i.test(
                String(bloque.fuente?.raw?.estilo ?? ''),
              ),
          )?.texto,
      },
      bloques,
      tablas,
      advertencias: [
        {
          ruta: 'docx.estructura',
          mensaje: `DOCX leído conservando estilos, outline, espaciado y numeración de párrafos (${estilos.size} estilo(s)).`,
          nivel: 'INFO',
        },
        ...(imagenesGuardadas.length > 0
          ? [
              {
                ruta: 'docx.imagenes',
                mensaje: `DOCX: ${imagenesGuardadas.length} imagen(es) guardada(s) con colocación por párrafo cuando document.xml.rels lo permite.`,
                nivel: 'INFO' as const,
              },
            ]
          : []),
      ],
    };
  }

  private extraerEstilos(xml: string) {
    const estilos = new Map<string, EstiloDocx>();
    for (const match of xml.matchAll(/<w:style\b([\s\S]*?)<\/w:style>/gi)) {
      const bloque = match[0];
      const cabecera = match[1] ?? '';
      const id = cabecera.match(/w:styleId="([^"]+)"/i)?.[1];
      if (!id) continue;
      const nombre = bloque.match(/<w:name[^>]+w:val="([^"]+)"/i)?.[1];
      const basedOn = bloque.match(/<w:basedOn[^>]+w:val="([^"]+)"/i)?.[1];
      const outlineRaw = bloque.match(/<w:outlineLvl[^>]+w:val="(\d+)"/i)?.[1];
      const szRaw = bloque.match(/<w:sz[^>]+w:val="(\d+)"/i)?.[1];
      const spacingTag = bloque.match(/<w:spacing\b[^>]*>/i)?.[0] ?? '';
      estilos.set(id, {
        id,
        nombre,
        basedOn,
        outlineLevel: outlineRaw == null ? undefined : Number(outlineRaw),
        fontSize: szRaw == null ? undefined : Number(szRaw) / 2,
        bold: /<w:b(?:\s|\/|>)/i.test(bloque) ? true : undefined,
        italic: /<w:i(?:\s|\/|>)/i.test(bloque) ? true : undefined,
        spacingBefore: this.valorTwips(spacingTag, 'before'),
        spacingAfter: this.valorTwips(spacingTag, 'after'),
      });
    }
    return estilos;
  }

  private resolverEstilo(
    id: string,
    estilos: Map<string, EstiloDocx>,
    visitados = new Set<string>(),
  ): EstiloDocx {
    if (!id || visitados.has(id)) return { id };
    visitados.add(id);
    const actual = estilos.get(id);
    if (!actual) return { id };
    const padre = actual.basedOn
      ? this.resolverEstilo(actual.basedOn, estilos, visitados)
      : ({ id: '' } as EstiloDocx);
    return {
      ...padre,
      ...actual,
      nombre: actual.nombre ?? padre.nombre,
      outlineLevel: actual.outlineLevel ?? padre.outlineLevel,
      fontSize: actual.fontSize ?? padre.fontSize,
      bold: actual.bold ?? padre.bold,
      italic: actual.italic ?? padre.italic,
      spacingBefore: actual.spacingBefore ?? padre.spacingBefore,
      spacingAfter: actual.spacingAfter ?? padre.spacingAfter,
    };
  }

  private nivelHeadingDocx(
    styleId: string,
    nombre: string,
    outlineLevel?: number,
  ) {
    if (/^(?:toc|tableofcontents|indice|índice)/i.test(`${styleId} ${nombre}`)) {
      return undefined;
    }
    const heading =
      `${styleId} ${nombre}`.match(/heading\s*([1-9])/i) ??
      `${styleId} ${nombre}`.match(/t[ií]tulo\s*([1-9])/i);
    if (heading) return Number(heading[1]);
    if (outlineLevel != null && outlineLevel >= 0 && outlineLevel <= 8) {
      return outlineLevel + 1;
    }
    return undefined;
  }

  private fontSizeDirecto(paragraph: string) {
    const valores = [...paragraph.matchAll(/<w:sz[^>]+w:val="(\d+)"/gi)].map(
      (match) => Number(match[1]) / 2,
    );
    return valores.length > 0 ? Math.max(...valores) : undefined;
  }

  private boldDirecto(paragraph: string) {
    if (/<w:b(?:\s|\/|>)/i.test(paragraph)) return true;
    if (/<w:b[^>]+w:val="(?:0|false|off)"/i.test(paragraph)) return false;
    return undefined;
  }

  private italicDirecto(paragraph: string) {
    if (/<w:i(?:\s|\/|>)/i.test(paragraph)) return true;
    if (/<w:i[^>]+w:val="(?:0|false|off)"/i.test(paragraph)) return false;
    return undefined;
  }

  private spacingDirecto(paragraph: string, atributo: 'before' | 'after') {
    const tag = paragraph.match(/<w:pPr[\s\S]*?<\/w:pPr>/i)?.[0] ?? '';
    const spacing = tag.match(/<w:spacing\b[^>]*>/i)?.[0] ?? '';
    return this.valorTwips(spacing, atributo);
  }

  private valorTwips(tag: string, atributo: 'before' | 'after') {
    const raw = tag.match(new RegExp(`w:${atributo}="(\\d+)"`, 'i'))?.[1];
    return raw == null ? undefined : Number(raw) / 20;
  }

  private extraerNumeraciones(xml: string) {
    const abstractos = new Map<string, Map<number, string>>();
    for (const match of xml.matchAll(/<w:abstractNum\b([\s\S]*?)<\/w:abstractNum>/gi)) {
      const bloque = match[0];
      const id = bloque.match(/w:abstractNumId="(\d+)"/i)?.[1];
      if (!id) continue;
      const niveles = new Map<number, string>();
      for (const nivel of bloque.matchAll(/<w:lvl\b([\s\S]*?)<\/w:lvl>/gi)) {
        const nivelXml = nivel[0];
        const ilvl = Number(nivelXml.match(/w:ilvl="(\d+)"/i)?.[1] ?? 0);
        const format = nivelXml.match(/<w:numFmt[^>]+w:val="([^"]+)"/i)?.[1] ?? 'unknown';
        niveles.set(ilvl, format);
      }
      abstractos.set(id, niveles);
    }

    const nums = new Map<string, { abstractId: string; niveles: Map<number, string> }>();
    for (const match of xml.matchAll(/<w:num\b([\s\S]*?)<\/w:num>/gi)) {
      const bloque = match[0];
      const id = bloque.match(/w:numId="(\d+)"/i)?.[1];
      const abstractId = bloque.match(/<w:abstractNumId[^>]+w:val="(\d+)"/i)?.[1];
      if (!id || !abstractId) continue;
      nums.set(id, { abstractId, niveles: abstractos.get(abstractId) ?? new Map() });
    }
    return nums;
  }

  private infoNumeracionParrafo(
    paragraph: string,
    numeraciones: Map<string, { abstractId: string; niveles: Map<number, string> }>,
  ) {
    const pPr = paragraph.match(/<w:pPr[\s\S]*?<\/w:pPr>/i)?.[0] ?? '';
    const numPr = pPr.match(/<w:numPr[\s\S]*?<\/w:numPr>/i)?.[0];
    if (!numPr) return null;
    const numId = numPr.match(/<w:numId[^>]+w:val="(\d+)"/i)?.[1];
    if (!numId) return null;
    const level = Number(numPr.match(/<w:ilvl[^>]+w:val="(\d+)"/i)?.[1] ?? 0);
    const definicion = numeraciones.get(numId);
    return {
      numId,
      level,
      format: definicion?.niveles.get(level) ?? 'unknown',
      abstractId: definicion?.abstractId,
    };
  }

  private crearBloqueImagenDocx(
    imagen: StoredExtractedImageAsset,
    orden: number,
    documentoOrigen: string,
    placement?: DocumentoAssetPlacement,
  ) {
    return {
      tempId: crearTempId('docx_imagen'),
      tipo: 'IMAGEN_REFERENCIADA' as const,
      texto: imagen.name,
      orden,
      posicion: placement?.posicion,
      archivoId: imagen.archivo.id,
      archivo: imagen.archivo,
      fuente: {
        tipo: 'DOCX' as const,
        raw: {
          rutaArchivo: imagen.source.path,
          archivoId: imagen.archivo.id,
          archivoGuardado: imagen.archivo,
          ocr: imagen.ocr,
          paragraphIndex: placement?.paragraphIndex,
          runIndex: placement?.runIndex,
          placement: placement?.raw,
          documentoOrigen,
        },
      },
    };
  }

  private extraerTablas(xml: string): DocumentoExtraidoCanonico['tablas'] {
    const tablasXml = xml.match(/<w:tbl[\s\S]*?<\/w:tbl>/g) ?? [];

    return tablasXml
      .map((tablaXml, tablaIndex) => {
        const filas = (tablaXml.match(/<w:tr[\s\S]*?<\/w:tr>/g) ?? [])
          .map((filaXml) =>
            (filaXml.match(/<w:tc[\s\S]*?<\/w:tc>/g) ?? [])
              .map((celdaXml) => limpiarXml(celdaXml))
              .filter(Boolean),
          )
          .filter((fila) => fila.length > 0);

        if (filas.length === 0) return null;

        const primeraFilaXml = (tablaXml.match(/<w:tr[\s\S]*?<\/w:tr>/i) ?? [])[0] ?? '';
        const celdasPrimeraFila = primeraFilaXml.match(/<w:tc[\s\S]*?<\/w:tc>/gi) ?? [];
        const primeraEsCabecera = filaConEnfasisEsCabecera({
          totalCeldas: celdasPrimeraFila.length,
          celdasEnfatizadas: celdasPrimeraFila.filter((celda) =>
            /<w:b(?:\s|\/|>)/i.test(celda),
          ).length,
          marcadaComoCabecera: /<w:tblHeader(?:\s|\/|>)/i.test(primeraFilaXml),
        });
        const ancho = Math.max(...filas.map((fila) => fila.length));
        const columnas = columnasTablaUnicas(
          Array.from({ length: ancho }, (_, index) =>
            primeraEsCabecera && filas[0]?.[index]
              ? filas[0][index]
              : `Columna ${index + 1}`,
          ),
        );
        const datos = primeraEsCabecera ? filas.slice(1) : filas;
        const filasDatos = datos.map((fila) =>
          Object.fromEntries(
            columnas.map((columna, index) => [columna, fila[index] ?? '']),
          ),
        );

        return {
          tempId: crearTempId('docx_tabla'),
          orden: tablaIndex + 1,
          nombre: `Tabla ${tablaIndex + 1}`,
          columnas,
          filas: filasDatos,
          fuente: {
            tipo: 'DOCX',
            raw: { tablaIndex, cabeceraDetectada: primeraEsCabecera },
          },
        };
      })
      .filter(Boolean) as DocumentoExtraidoCanonico['tablas'];
  }
}
