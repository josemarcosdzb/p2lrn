import {ReaderInputError} from '../../reader-error.js';
import type { ResultadoDeteccionArchivo } from '../../deteccion-archivo/types/resultado-deteccion-archivo.type.js';
import type { ArchivoImportacionSubido } from '../../types/archivo-importacion-subido.type.js';
import { crearTempId } from '../../utils/temp-id.util.js';
import {ReaderAssetCollector as IngestionAssetsService} from '../../assets/reader-asset-collector.js';
import type {StoredExtractedImageAsset} from '../../assets/reader-assets.types.js';
import {
  DocumentAssetPlacementService,
  type DocumentoAssetPlacement,
} from '../placement/document-asset-placement.service.js';
import type { BloqueDocumentoExtraido } from '../types/bloque-documento-extraido.type.js';
import type { DocumentoExtraidoCanonico } from '../types/documento-extraido-canonico.type.js';
import {
  columnasTablaUnicas,
  filaConEnfasisEsCabecera,
} from './utils/tabla-documento.util.js';
import type { TablaDocumentoExtraida } from '../types/tabla-documento-extraida.type.js';
import { leerEntradasZipBuffer } from './utils/lector-zip-buffer.util.js';

const EMU_PER_PIXEL_96 = 9525;

interface TextoPptxExtraido {
  texto: string;
  tipo: 'TITULO' | 'PARRAFO';
  nivel?: number;
  ordenFuente: number;
  shapeIndex: number;
  paragraphIndex: number;
  placeholderTitulo: boolean;
  posicion?: { x?: number; y?: number; width?: number; height?: number };
}

function decodificarXml(valor: string) {
  return valor
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function pareceRuidoXmlOffice(texto: string) {
  return (
    /<\/?(?:a|p|r|w|wp|v):/i.test(texto) ||
    /(?:effectLst|outerShdw|spPr|bodyPr|txBody|lnSpc|spcPts|schemeClr)/i.test(
      texto,
    )
  );
}

function textosXml(xml: string): string[] {
  return [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/gi)]
    .map((match) => decodificarXml(match[1] ?? ''))
    .filter(Boolean)
    .filter((texto) => !pareceRuidoXmlOffice(texto));
}

function textoParrafoPptx(xml: string): string {
  const segmentos = xml.split(
    /<a:br\b[^>]*\/>|<a:br\b[^>]*>[\s\S]*?<\/a:br>/gi,
  );
  return segmentos
    .map((segmento) =>
      textosXml(segmento).join(' ').replace(/\s+/g, ' ').trim(),
    )
    .filter(Boolean)
    .join('\n')
    .trim();
}

function numeroAtributo(xml: string, atributo: string) {
  const raw = xml.match(
    new RegExp(`\\b${atributo}="(-?\\d+(?:\\.\\d+)?)"`, 'i'),
  )?.[1];
  const numero = Number(raw);
  return Number.isFinite(numero) ? numero : undefined;
}

function emuAPixel(value?: number) {
  return value == null
    ? undefined
    : Math.round((value / EMU_PER_PIXEL_96) * 100) / 100;
}

function posicionFormaPptx(xml: string) {
  const xfrm =
    xml.match(/<(?:a|p):xfrm\b[\s\S]*?<\/(?:a|p):xfrm>/i)?.[0] ?? '';
  const off = xfrm.match(/<a:off\b([^>]*)\/?\s*>/i)?.[1] ?? '';
  const ext = xfrm.match(/<a:ext\b([^>]*)\/?\s*>/i)?.[1] ?? '';
  const x = emuAPixel(numeroAtributo(off, 'x'));
  const y = emuAPixel(numeroAtributo(off, 'y'));
  const width = emuAPixel(numeroAtributo(ext, 'cx'));
  const height = emuAPixel(numeroAtributo(ext, 'cy'));
  if ([x, y, width, height].every((value) => value == null)) return undefined;
  return { x, y, width, height };
}

function extraerTextosDiapositiva(xml: string): TextoPptxExtraido[] {
  const shapes = [...xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/gi)];
  const resultado: TextoPptxExtraido[] = [];

  shapes.forEach((shape, shapeIndex) => {
    const shapeXml = shape[0];
    const placeholderTitulo = /<p:ph\b[^>]*type="(?:title|ctrTitle)"/i.test(
      shapeXml,
    );
    const posicion = posicionFormaPptx(shapeXml);
    const parrafos = [...shapeXml.matchAll(/<a:p\b[\s\S]*?<\/a:p>/gi)]
      .map((match) => textoParrafoPptx(match[0]))
      .filter(Boolean);

    const textos = parrafos.length ? parrafos : textosXml(shapeXml);
    const total = Math.max(1, textos.length);
    textos.forEach((texto, paragraphIndex) => {
      const posicionParrafo = posicion
        ? {
            ...posicion,
            y:
              posicion.y != null && posicion.height != null
                ? posicion.y + (posicion.height / total) * paragraphIndex
                : posicion.y,
            height:
              posicion.height != null
                ? posicion.height / total
                : posicion.height,
          }
        : undefined;
      resultado.push({
        texto,
        tipo:
          placeholderTitulo && paragraphIndex === 0 ? 'TITULO' : 'PARRAFO',
        nivel: placeholderTitulo && paragraphIndex === 0 ? 2 : undefined,
        ordenFuente: (shapeIndex + 1) * 1000 + paragraphIndex + 1,
        shapeIndex,
        paragraphIndex,
        placeholderTitulo,
        posicion: posicionParrafo,
      });
    });
  });

  if (resultado.length > 0) return resultado;

  return [...xml.matchAll(/<a:p\b[\s\S]*?<\/a:p>/gi)]
    .map((match, paragraphIndex) => ({
      texto: textoParrafoPptx(match[0]),
      tipo: 'PARRAFO' as const,
      ordenFuente: paragraphIndex + 1,
      shapeIndex: paragraphIndex,
      paragraphIndex: 0,
      placeholderTitulo: false,
    }))
    .filter((item) => Boolean(item.texto));
}

export class ExtractorPptxService {
  constructor(
    private readonly ingestionAssets?: IngestionAssetsService,
    private readonly placementService?: DocumentAssetPlacementService,
  ) {}

  async extraer(params: {
    archivo: ArchivoImportacionSubido;
    deteccion: ResultadoDeteccionArchivo;
    usuarioId?: number;
  }): Promise<DocumentoExtraidoCanonico> {
    const entradasMap = await leerEntradasZipBuffer(params.archivo.buffer);
    const entradas = [...entradasMap.entries()]
      .map(([nombre, buffer]) => ({ nombre, buffer }))
      .filter((entrada) =>
        /^ppt\/slides\/slide\d+\.xml$/i.test(entrada.nombre),
      )
      .sort((a, b) => numeroSlide(a.nombre) - numeroSlide(b.nombre));

    if (entradas.length === 0) {
      throw new ReaderInputError(
        'No se encontraron diapositivas legibles dentro del PPTX.',
      );
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
              process.env.IMPORT_PPTX_MAX_IMAGES ?? Number.POSITIVE_INFINITY,
            ),
            packageHint: 'DOCUMENT',
            runOcr: true,
          })
        : [];
    const imagenesPorRuta = this.placementService
      ? this.placementService.indexarPorRuta(imagenesGuardadas)
      : new Map(
          imagenesGuardadas
            .filter((asset) => asset.source.path)
            .map((asset) => [
              normalizarRutaPptx(asset.source.path!),
              asset,
            ]),
        );
    const placementsPorSlide =
      this.placementService?.resolverPptxImagenesPorSlide(entradasMap) ??
      new Map<number, DocumentoAssetPlacement[]>();
    const lienzo = this.placementService?.resolverPptxLienzo(entradasMap);

    const bloques: DocumentoExtraidoCanonico['bloques'] = [];
    const tablas: DocumentoExtraidoCanonico['tablas'] = [];

    for (const entrada of entradas) {
      const slide = numeroSlide(entrada.nombre);
      const hoja = `Diapositiva ${slide}`;
      const xml = entrada.buffer.toString('utf8');
      const textos = extraerTextosDiapositiva(xml);
      const titulosNativos = textos.filter((item) => item.tipo === 'TITULO');
      const contenidos = textos.filter((item) => item.tipo !== 'TITULO');
      const textosOrdenados = [...titulosNativos, ...contenidos];

      // La frontera física de la diapositiva es estructura, no contenido. Si
      // existe un placeholder de título, se coloca primero en el orden lógico
      // aunque el XML haya escrito antes un shape de cuerpo. Si no existe,
      // añadimos una cabecera sintética y conservamos TODO el texto real como
      // contenido de la lección. El orden físico original sigue trazado en
      // ordenFuenteShape y en la posición del shape.
      if (titulosNativos.length === 0) {
        bloques.push({
          tempId: crearTempId('pptx_superficie'),
          tipo: 'TITULO',
          texto: `Lección ${slide}`,
          nivel: 2,
          orden: bloques.length + 1,
          hoja,
          fuente: {
            tipo: 'PPTX',
            raw: {
              slide,
              archivo: entrada.nombre,
              documentoOrigen: params.deteccion.nombreArchivo,
              tituloSuperficieSintetico: true,
              ordenFuenteShape: 0,
              lienzo,
            },
          },
        });
      }

      textosOrdenados.forEach((item, ordenLogicoSlide) => {
        bloques.push({
          tempId: crearTempId(
            item.tipo === 'TITULO' ? 'pptx_titulo' : 'pptx_texto',
          ),
          tipo: item.tipo,
          texto: item.texto,
          nivel: item.nivel,
          orden: bloques.length + 1,
          hoja,
          posicion: item.posicion,
          fuente: {
            tipo: 'PPTX',
            raw: {
              slide,
              archivo: entrada.nombre,
              documentoOrigen: params.deteccion.nombreArchivo,
              shapeIndex: item.shapeIndex,
              paragraphIndex: item.paragraphIndex,
              ordenFuenteShape: item.ordenFuente,
              ordenLogicoSlide: ordenLogicoSlide + 1,
              placeholderTituloNativo: item.placeholderTitulo,
              lienzo,
            },
          },
        });
      });

      const imagenesSlide = placementsPorSlide.get(slide) ?? [];
      for (const placement of imagenesSlide) {
        const imagen = imagenesPorRuta.get(
          normalizarRutaPptx(placement.path),
        );
        if (!imagen) continue;
        bloques.push(
          this.crearBloqueImagenPptx(
            imagen,
            slide,
            hoja,
            bloques.length + 1,
            placement,
            params.deteccion.nombreArchivo,
          ),
        );
      }

      tablas.push(
        ...this.extraerTablas(
          xml,
          slide,
          lienzo,
          params.deteccion.nombreArchivo,
        ),
      );
    }

    if (bloques.length === 0 && tablas.length === 0) {
      throw new ReaderInputError(
        'El PPTX no contiene texto, tablas ni imágenes legibles.',
      );
    }

    return {
      version: 'p2lrn.source-reader.documento.extraido.v1',
      origen: {
        nombreArchivo: params.deteccion.nombreArchivo,
        extensionOriginal: params.deteccion.extension,
        mimeOriginal: params.deteccion.mimeType,
        tipoArchivoDetectado: 'PPTX',
        estrategiaExtraccion: 'PPTX_SLIDES_XML',
      },
      metadatos: {
        tituloDetectado: bloques.find((bloque) => bloque.tipo === 'TITULO')
          ?.texto,
        hojas: entradas.map(
          (entrada) => `Diapositiva ${numeroSlide(entrada.nombre)}`,
        ),
      },
      bloques,
      tablas,
      advertencias: [
        {
          ruta: 'pptx',
          mensaje: `PPTX leído: ${entradas.length} diapositiva(s), ${bloques.filter((bloque) => bloque.tipo !== 'IMAGEN_REFERENCIADA').length} párrafo(s), ${tablas.length} tabla(s) y ${imagenesGuardadas.length} imagen(es) guardada(s).`,
          nivel: 'INFO',
        },
      ],
    };
  }

  private crearBloqueImagenPptx(
    imagen: StoredExtractedImageAsset,
    slide: number,
    hoja: string,
    orden: number,
    placement?: DocumentoAssetPlacement,
    documentoOrigen?: string,
  ): BloqueDocumentoExtraido {
    return {
      tempId: crearTempId('pptx_imagen'),
      tipo: 'IMAGEN_REFERENCIADA',
      texto: imagen.name,
      orden,
      hoja,
      posicion: placement?.posicion,
      archivoId: imagen.archivo.id,
      archivo: imagen.archivo,
      fuente: {
        tipo: 'PPTX',
        raw: {
          slide,
          rutaArchivo: imagen.source.path,
          archivoId: imagen.archivo.id,
          archivoGuardado: imagen.archivo,
          ocr: imagen.ocr,
          relationshipId: placement?.relationshipId,
          placement: placement?.raw,
          lienzo: placement?.lienzo,
          documentoOrigen,
        },
      },
    };
  }

  private extraerTablas(
    xml: string,
    slide: number,
    lienzo: { width: number; height: number } | undefined,
    documentoOrigen: string,
  ): TablaDocumentoExtraida[] {
    const frames = [
      ...xml.matchAll(/<p:graphicFrame\b[\s\S]*?<\/p:graphicFrame>/gi),
    ].filter((match) => /<a:tbl\b/i.test(match[0]));

    return frames
      .map((frame, tablaIndex) => {
        const tablaXml = frame[0].match(/<a:tbl\b[\s\S]*?<\/a:tbl>/i)?.[0];
        if (!tablaXml) return null;
        const filasXml = tablaXml.match(/<a:tr\b[\s\S]*?<\/a:tr>/gi) ?? [];
        const filas = filasXml
          .map((filaXml) =>
            (filaXml.match(/<a:tc\b[\s\S]*?<\/a:tc>/gi) ?? []).map(
              (celdaXml) => textosXml(celdaXml).join(' ').trim(),
            ),
          )
          .filter((fila) => fila.some(Boolean));
        if (filas.length === 0) return null;

        const primeraEsCabecera = this.filaEsCabeceraPptx(filasXml[0] ?? '');
        const ancho = Math.max(...filas.map((fila) => fila.length));
        const columnas = columnasTablaUnicas(
          Array.from({ length: ancho }, (_, index) =>
            primeraEsCabecera && filas[0]?.[index]
              ? filas[0][index]
              : `Columna ${index + 1}`,
          ),
        );
        const datos = primeraEsCabecera ? filas.slice(1) : filas;
        const posicion = posicionFormaPptx(frame[0]);

        return {
          tempId: crearTempId('pptx_tabla'),
          orden: tablaIndex + 1,
          hoja: `Diapositiva ${slide}`,
          nombre: `Tabla ${tablaIndex + 1} - diapositiva ${slide}`,
          columnas,
          filas: datos.map((fila) =>
            Object.fromEntries(
              columnas.map((columna, index) => [columna, fila[index] ?? '']),
            ),
          ),
          posicion,
          fuente: {
            tipo: 'PPTX',
            raw: {
              slide,
              tablaIndex,
              cabeceraDetectada: primeraEsCabecera,
              lienzo,
              documentoOrigen,
            },
          },
        } satisfies TablaDocumentoExtraida;
      })
      .filter((tabla) => tabla !== null);
  }

  private filaEsCabeceraPptx(filaXml: string) {
    const celdas = filaXml.match(/<a:tc\b[\s\S]*?<\/a:tc>/gi) ?? [];
    if (!celdas.length) return false;
    const conNegrita = celdas.filter((celda) =>
      /<(?:a:rPr|a:defRPr)\b[^>]*\bb="(?:1|true)"/i.test(celda),
    ).length;
    return filaConEnfasisEsCabecera({
      totalCeldas: celdas.length,
      celdasEnfatizadas: conNegrita,
    });
  }
}

function normalizarRutaPptx(ruta: string) {
  return ruta.replace(/^\//, '').replace(/\\/g, '/');
}

function numeroSlide(nombre: string) {
  return Number(nombre.match(/slide(\d+)\.xml/i)?.[1] ?? 0);
}
