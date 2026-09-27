import type { ArchivoImportacionSubido } from '../../types/archivo-importacion-subido.type.js';
import { leerEntradasZipBuffer } from '../extractores/utils/lector-zip-buffer.util.js';
import type { DocumentoExtraidoCanonico } from '../types/documento-extraido-canonico.type.js';

interface RangoXml {
  inicio: number;
  fin: number;
  indice: number;
}

interface ElementoBodyDocx {
  tipo: 'PARRAFO' | 'TABLA';
  indice: number;
  inicio: number;
  ordenFuente: number;
}

export class NormalizadorFidelidadDocxService {
  async normalizar(
    documento: DocumentoExtraidoCanonico,
    archivo: ArchivoImportacionSubido,
  ): Promise<DocumentoExtraidoCanonico> {
    if (documento.origen.tipoArchivoDetectado !== 'DOCX') return documento;

    const entradas = await leerEntradasZipBuffer(archivo.buffer);
    const xml = entradas.get('word/document.xml')?.toString('utf8');
    if (!xml) return documento;
    const caracteristicasNoConvertidas = this.caracteristicasNoConvertidas(
      entradas,
      xml,
    );

    const parrafos = this.rangos(xml, /<w:p\b[\s\S]*?<\/w:p>/gi);
    const tablas = this.rangos(xml, /<w:tbl\b[\s\S]*?<\/w:tbl>/gi);
    const parrafosEnTabla = new Set<number>();
    const tablaPorParrafo = new Map<number, number>();

    for (const parrafo of parrafos) {
      const tabla = tablas.find(
        (item) => parrafo.inicio >= item.inicio && parrafo.fin <= item.fin,
      );
      if (tabla) {
        parrafosEnTabla.add(parrafo.indice);
        tablaPorParrafo.set(parrafo.indice, tabla.indice);
      }
    }

    const elementos = this.elementosBody(parrafos, tablas, parrafosEnTabla);
    const ordenParrafo = new Map(
      elementos
        .filter((item) => item.tipo === 'PARRAFO')
        .map((item) => [item.indice, item.ordenFuente] as const),
    );
    const ordenTabla = new Map(
      elementos
        .filter((item) => item.tipo === 'TABLA')
        .map((item) => [item.indice, item.ordenFuente] as const),
    );
    const offsetsParrafo = new Map<number, number>();
    const offsetsImagenTabla = new Map<number, number>();
    const maxOrdenFuente = Math.max(0, ...elementos.map((item) => item.ordenFuente));
    let fallback = maxOrdenFuente * 1000 + 900;

    const bloquesFiltrados = documento.bloques
      .filter((bloque) => {
        const indice = Number(bloque.fuente?.raw?.paragraphIndex);
        if (!Number.isInteger(indice) || !parrafosEnTabla.has(indice)) return true;
        // El texto de las celdas ya vive en la tabla canónica. Los assets no se
        // pueden incrustar en una celda del modelo actual, así que se conservan
        // junto a la tabla en vez de eliminarlos silenciosamente.
        return bloque.tipo === 'IMAGEN_REFERENCIADA';
      })
      .map((bloque) => {
        const indice = Number(bloque.fuente?.raw?.paragraphIndex);
        const tablaIndex = Number.isInteger(indice)
          ? tablaPorParrafo.get(indice)
          : undefined;
        if (bloque.tipo === 'IMAGEN_REFERENCIADA' && tablaIndex != null) {
          const base = ordenTabla.get(tablaIndex);
          const offset = (offsetsImagenTabla.get(tablaIndex) ?? 0) + 1;
          offsetsImagenTabla.set(tablaIndex, offset);
          if (base != null) {
            return {
              ...bloque,
              orden: base * 1000 + 500 + offset,
              fuente: {
                tipo: bloque.fuente?.tipo ?? 'DOCX',
                raw: {
                  ...(bloque.fuente?.raw ?? {}),
                  dentroTabla: true,
                  tablaIndex,
                },
              },
            };
          }
        }
        const ordenFuente = Number.isInteger(indice)
          ? ordenParrafo.get(indice)
          : undefined;
        if (ordenFuente == null) {
          fallback += 1;
          return { ...bloque, orden: fallback };
        }
        const offset = (offsetsParrafo.get(indice) ?? 0) + 1;
        offsetsParrafo.set(indice, offset);
        return { ...bloque, orden: ordenFuente * 1000 + offset };
      });
    const eliminados = documento.bloques.length - bloquesFiltrados.length;
    const imagenesInternasTabla = bloquesFiltrados.filter(
      (bloque) => bloque.fuente?.raw?.dentroTabla === true,
    ).length;
    if (
      imagenesInternasTabla > 0 &&
      !caracteristicasNoConvertidas.includes('imágenes embebidas en celdas de tabla')
    ) {
      caracteristicasNoConvertidas.push('imágenes embebidas en celdas de tabla');
    }
    const tablasNormalizadas = documento.tablas.map((tabla, index) => ({
      ...tabla,
      orden:
        ordenTabla.has(index) && ordenTabla.get(index) != null
          ? (ordenTabla.get(index) as number) * 1000
          : tabla.orden,
    }));

    const cambioOrdenBloques = bloquesFiltrados.some((bloque) => {
      const original = documento.bloques.find(
        (item) => item.tempId === bloque.tempId,
      );
      return original?.orden !== bloque.orden;
    });
    const cambioOrdenTablas = tablasNormalizadas.some(
      (tabla, index) => tabla.orden !== documento.tablas[index]?.orden,
    );
    if (
      eliminados === 0 &&
      !cambioOrdenBloques &&
      !cambioOrdenTablas &&
      caracteristicasNoConvertidas.length === 0
    ) {
      return documento;
    }

    return {
      ...documento,
      bloques: bloquesFiltrados,
      tablas: tablasNormalizadas,
      raw: {
        ...this.registro(documento.raw),
        fidelidadDocx: {
          version: 'DOCX_BODY_ORDER_V2',
          parrafosInternosTablaEliminados: eliminados,
          ordenFuenteIntercalado: true,
          caracteristicasNoConvertidas,
          imagenesInternasTablaConservadas: imagenesInternasTabla,
          ordenesTabla: tablasNormalizadas.map((tabla) => ({
            tablaId: tabla.tempId,
            ordenFuente: tabla.orden,
          })),
        },
      },
      advertencias: [
        ...documento.advertencias,
        ...(eliminados > 0
          ? [
              {
                ruta: 'docx.tablas.duplicacion',
                mensaje: `${eliminados} párrafo(s) interno(s) de tabla se retiraron de la secuencia textual para conservar cada celda una sola vez.`,
                nivel: 'INFO' as const,
              },
            ]
          : []),
        ...(imagenesInternasTabla > 0
          ? [
              {
                ruta: 'docx.tablas.imagenes',
                mensaje: `${imagenesInternasTabla} imagen(es) dentro de celdas se conservaron junto a su tabla. La asociación a una celda concreta requiere revisión porque el modelo editable no representa assets embebidos dentro de celdas.`,
                nivel: 'ADVERTENCIA' as const,
              },
            ]
          : []),
        ...(cambioOrdenBloques || cambioOrdenTablas
          ? [
              {
                ruta: 'docx.body.orden',
                mensaje:
                  'Se restauró el orden intercalado real de párrafos, imágenes ancladas y tablas según word/document.xml.',
                nivel: 'INFO' as const,
              },
            ]
          : []),
        ...(caracteristicasNoConvertidas.length > 0
          ? [
              {
                ruta: 'docx.caracteristicas.parciales',
                mensaje: `El DOCX contiene características que no se convierten íntegramente a contenido editable: ${caracteristicasNoConvertidas.join(', ')}.`,
                nivel: 'ADVERTENCIA' as const,
              },
            ]
          : []),
      ],
    };
  }

  private caracteristicasNoConvertidas(
    entradas: Map<string, Buffer>,
    documentXml: string,
  ) {
    const caracteristicas: string[] = [];
    const nombres = [...entradas.keys()];
    if (nombres.some((nombre) => /^word\/header\d+\.xml$/i.test(nombre))) {
      caracteristicas.push('encabezados de página');
    }
    if (nombres.some((nombre) => /^word\/footer\d+\.xml$/i.test(nombre))) {
      caracteristicas.push('pies de página');
    }
    if (entradas.has('word/footnotes.xml')) caracteristicas.push('notas al pie');
    if (entradas.has('word/endnotes.xml')) caracteristicas.push('notas finales');
    if (entradas.has('word/comments.xml')) caracteristicas.push('comentarios');
    if (/<w:txbxContent\b/i.test(documentXml)) {
      caracteristicas.push('cuadros de texto');
    }
    return caracteristicas;
  }

  private rangos(xml: string, regex: RegExp): RangoXml[] {
    return [...xml.matchAll(regex)].map((match, index) => ({
      inicio: match.index ?? 0,
      fin: (match.index ?? 0) + match[0].length,
      indice: index,
    }));
  }

  private elementosBody(
    parrafos: RangoXml[],
    tablas: RangoXml[],
    parrafosEnTabla: Set<number>,
  ): ElementoBodyDocx[] {
    return [
      ...parrafos
        .filter((parrafo) => !parrafosEnTabla.has(parrafo.indice))
        .map((parrafo) => ({
          tipo: 'PARRAFO' as const,
          indice: parrafo.indice,
          inicio: parrafo.inicio,
        })),
      ...tablas.map((tabla) => ({
        tipo: 'TABLA' as const,
        indice: tabla.indice,
        inicio: tabla.inicio,
      })),
    ]
      .sort((a, b) => a.inicio - b.inicio)
      .map((item, index) => ({ ...item, ordenFuente: index + 1 }));
  }

  private registro(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
