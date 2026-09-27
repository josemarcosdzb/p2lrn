import { createHash } from 'node:crypto';
import type {
  DocumentoExtraidoCanonico,
  DocumentoExtraidoFinalCanonico,
} from './types/documento-extraido-canonico.type.js';
import type { NodoDocumentoMultimodalV2 } from './types/documento-multimodal-canonico-v2.type.js';
import type {
  InventarioTrazabilidadDocumento,
  OrigenNodoDocumento,
  SpanFuenteDocumento,
  TrazabilidadNodoDocumento,
} from './types/documento-canonico-v2.type.js';
import type { MotorExtraccionDocumento } from './types/procedencia-extraccion-documento.type.js';

export class TrazadorDocumentoCanonicoService {
  trazar(documento: DocumentoExtraidoCanonico): DocumentoExtraidoFinalCanonico {
    const bloquesOrdenados = [...documento.bloques].sort(
      (a, b) => a.orden - b.orden,
    );
    const tablasOrdenadas = [...documento.tablas].sort(
      (a, b) => a.orden - b.orden,
    );
    const secuenciaMultimodal = {
      version: 'p2lrn.source-reader.documento.multimodal.v2' as const,
      nodos: this.secuenciaCompleta(documento),
    };
    const hashDocumento = this.hash(
      JSON.stringify({
        origen: documento.origen,
        metadatos: documento.metadatos,
        bloques: bloquesOrdenados.map((bloque) => {
          const raw = this.registro(bloque.fuente?.raw);
          return {
            orden: bloque.orden,
            tipo: bloque.tipo,
            texto: bloque.texto,
            nivel: bloque.nivel,
            pagina: bloque.pagina,
            hoja: bloque.hoja,
            posicion: bloque.posicion,
            estilo: bloque.estilo,
            fuenteTipo: bloque.fuente?.tipo,
            asset: bloque.archivo
              ? {
                  nombre: bloque.archivo.nombre,
                  mimeType: bloque.archivo.mimeType,
                  tamanoBytes: bloque.archivo.tamanoBytes,
                }
              : undefined,
            rutaFuente: this.texto(
              raw.archivoZip ?? raw.rutaArchivo ?? raw.documentoOrigen,
            ),
          };
        }),
        tablas: tablasOrdenadas.map((tabla) => ({
          orden: tabla.orden,
          nombre: tabla.nombre,
          columnas: tabla.columnas,
          filas: tabla.filas,
          celdas: tabla.celdas,
          pagina: tabla.pagina,
          hoja: tabla.hoja,
          posicion: tabla.posicion,
          fuenteTipo: tabla.fuente?.tipo,
        })),
        secuenciaMultimodal: secuenciaMultimodal.nodos.map((nodo) =>
          this.nodoSemanticoParaHash(nodo),
        ),
        contenedor: documento.contenedor ?? null,
      }),
    );
    const documentoId = `doc_${hashDocumento.slice(0, 24)}`;
    let cursor = 0;
    const nodos: InventarioTrazabilidadDocumento['nodos'] = [];
    const bloques = bloquesOrdenados.map((bloque) => {
      const texto = String(bloque.texto ?? '');
      const charInicio = cursor;
      const charFin = charInicio + texto.length;
      cursor = charFin + 1;
      const raw = bloque.fuente?.raw ?? {};
      const hashContenido = this.hash(texto);
      const nodoId = `node_${hashContenido.slice(0, 16)}_${bloque.orden}`;
      const diapositiva = this.numero(raw.slide);
      const archivoInterno = this.texto(
        raw.archivoZip ?? raw.documentoOrigen ?? raw.rutaArchivo,
      );
      const span: SpanFuenteDocumento = {
        documentoId,
        bloqueOrigenId: bloque.tempId,
        archivoInterno,
        pagina: bloque.pagina,
        diapositiva,
        hoja: bloque.hoja,
        charInicio,
        charFin,
        bbox: bloque.posicion
          ? {
              x: bloque.posicion.x ?? 0,
              y: bloque.posicion.y ?? 0,
              ancho: bloque.posicion.width ?? 0,
              alto: bloque.posicion.height ?? 0,
            }
          : undefined,
      };
      const trazabilidad: TrazabilidadNodoDocumento = {
        version: 'p2lrn.source-reader.document.trace.v1',
        documentoId,
        nodoId,
        origen: this.origenNodo(raw),
        hashContenido,
        ordenFuente: bloque.orden,
        spans: [span],
      };
      nodos.push({
        nodoId,
        bloqueOrigenId: bloque.tempId,
        hashContenido,
        charInicio,
        charFin,
        pagina: bloque.pagina,
        diapositiva,
        hoja: bloque.hoja,
        archivoInterno,
      });
      return {
        ...bloque,
        trazabilidad,
        fuente: {
          tipo: bloque.fuente?.tipo ?? documento.origen.tipoArchivoDetectado,
          raw: Object.keys(raw).length > 0 ? raw : undefined,
        },
      };
    });

    const tablas = tablasOrdenadas.map((tabla) => {
      const contenido = JSON.stringify({
        nombre: tabla.nombre,
        columnas: tabla.columnas,
        filas: tabla.filas,
        celdas: tabla.celdas,
      });
      return {
        tablaId: tabla.tempId,
        hashContenido: this.hash(contenido),
        pagina: tabla.pagina,
        hoja: tabla.hoja,
      };
    });
    const inventario: InventarioTrazabilidadDocumento = {
      version: 'p2lrn.source-reader.document.inventory.v1',
      documentoId,
      hashDocumento,
      totalBloques: bloques.length,
      totalTablas: tablas.length,
      totalCaracteres: Math.max(0, cursor - 1),
      nodos,
      tablas,
    };

    return {
      ...documento,
      version: 'p2lrn.source-reader.documento.extraido.v2',
      bloques,
      tablas: tablasOrdenadas,
      secuenciaMultimodal,
      procedenciaExtraccion: {
        ...(documento.procedenciaExtraccion ?? {}),
        version: 'p2lrn.source-reader.extraccion.procedencia.v1',
        motorAutoritativo: this.motorAutoritativo(documento),
      },
      trazabilidadDocumento: inventario,
      raw: documento.raw,
    };
  }

  private nodoSemanticoParaHash(nodo: NodoDocumentoMultimodalV2) {
    return {
      orden: nodo.orden,
      tipo: nodo.tipo,
      texto: nodo.texto,
      pagina: nodo.pagina,
      diapositiva: nodo.diapositiva,
      hoja: nodo.hoja,
      bbox: nodo.bbox,
      confianza: nodo.confianza,
      motor: nodo.procedencia.motor,
      archivoInterno: this.archivoInternoNodo(nodo),
      datos: nodo.datos,
    };
  }

  private motorAutoritativo(
    documento: DocumentoExtraidoCanonico,
  ): MotorExtraccionDocumento {
    const procedencia = documento.procedenciaExtraccion;
    if (procedencia?.reconciliacion?.motorPrimario) {
      return procedencia.reconciliacion.motorPrimario;
    }
    if (procedencia?.seleccion?.motorSeleccionado) {
      return procedencia.seleccion.motorSeleccionado;
    }
    return documento.origen.estrategiaExtraccion === 'DOCLING_JSON'
      ? 'DOCLING'
      : 'NATIVE';
  }

  private secuenciaCompleta(documento: DocumentoExtraidoCanonico) {
    const separarPorArchivoInterno =
      documento.origen.tipoArchivoDetectado === 'ZIP';
    const existentes = [...(documento.secuenciaMultimodal?.nodos ?? [])].map(
      (nodo) => {
        const archivoInterno = this.archivoInternoNodo(nodo);
        return {
          ...nodo,
          procedencia: {
            ...nodo.procedencia,
            archivoInterno,
          },
        };
      },
    );
    const disponibles = this.contarFirmas(
      existentes,
      separarPorArchivoInterno,
    );
    const sintetizados: NodoDocumentoMultimodalV2[] = [];

    for (const bloque of documento.bloques) {
      const tipo = this.tipoNodoBloque(bloque.tipo);
      if (!tipo) continue;
      const raw = this.registro(bloque.fuente?.raw);
      const archivoInterno = this.texto(
        raw.archivoZip ?? raw.documentoOrigen,
      );
      const candidato: NodoDocumentoMultimodalV2 = {
        id: bloque.tempId,
        tipo,
        orden: bloque.orden,
        texto: bloque.texto || undefined,
        pagina: bloque.pagina,
        hoja: bloque.hoja,
        bbox: bloque.posicion
          ? {
              x: bloque.posicion.x ?? 0,
              y: bloque.posicion.y ?? 0,
              width: bloque.posicion.width ?? 0,
              height: bloque.posicion.height ?? 0,
              sistemaCoordenadas: 'DESCONOCIDO',
            }
          : undefined,
        procedencia: {
          motor: this.motorNodo(bloque.fuente?.raw),
          referencia: bloque.tempId,
          archivoInterno,
        },
        datos:
          bloque.tipo === 'SUBTITULO' || bloque.tipo === 'OPCION'
            ? { tipoBloqueOrigen: bloque.tipo, nivel: bloque.nivel }
            : undefined,
      };
      if (
        !this.consumirOcurrencia(
          disponibles,
          candidato,
          separarPorArchivoInterno,
        )
      ) {
        sintetizados.push(candidato);
      }
    }

    for (const tabla of documento.tablas) {
      const raw = this.registro(tabla.fuente?.raw);
      const archivoInterno = this.texto(
        raw.archivoZip ?? raw.documentoOrigen,
      );
      const candidato: NodoDocumentoMultimodalV2 = {
        id: tabla.tempId,
        tipo: 'TABLA',
        orden: tabla.orden,
        texto: tabla.nombre,
        pagina: tabla.pagina,
        hoja: tabla.hoja,
        bbox: tabla.posicion
          ? {
              x: tabla.posicion.x ?? 0,
              y: tabla.posicion.y ?? 0,
              width: tabla.posicion.width ?? 0,
              height: tabla.posicion.height ?? 0,
              sistemaCoordenadas: 'DESCONOCIDO',
            }
          : undefined,
        procedencia: {
          motor: this.motorNodo(tabla.fuente?.raw),
          referencia: tabla.tempId,
          archivoInterno,
        },
        datos: {
          columnas: tabla.columnas,
          filas: tabla.filas,
          celdas: tabla.celdas,
        },
      };
      if (
        !this.consumirOcurrencia(
          disponibles,
          candidato,
          separarPorArchivoInterno,
        )
      ) {
        sintetizados.push(candidato);
      }
    }

    return [...existentes, ...sintetizados]
      .sort(
        (a, b) =>
          a.orden - b.orden ||
          this.claveOrdenNodo(a).localeCompare(this.claveOrdenNodo(b)) ||
          String(a.id).localeCompare(String(b.id)),
      )
      .map((nodo, index) => ({ ...nodo, orden: index + 1 }));
  }

  private contarFirmas(
    nodos: NodoDocumentoMultimodalV2[],
    separarPorArchivoInterno: boolean,
  ) {
    const conteos = new Map<string, number>();
    for (const nodo of nodos) {
      const firma = this.firmaOcurrencia(nodo, separarPorArchivoInterno);
      conteos.set(firma, (conteos.get(firma) ?? 0) + 1);
    }
    return conteos;
  }

  private consumirOcurrencia(
    disponibles: Map<string, number>,
    candidato: NodoDocumentoMultimodalV2,
    separarPorArchivoInterno: boolean,
  ) {
    const firma = this.firmaOcurrencia(candidato, separarPorArchivoInterno);
    const restantes = disponibles.get(firma) ?? 0;
    if (restantes <= 0) return false;
    if (restantes === 1) disponibles.delete(firma);
    else disponibles.set(firma, restantes - 1);
    return true;
  }

  private firmaOcurrencia(
    nodo: NodoDocumentoMultimodalV2,
    separarPorArchivoInterno: boolean,
  ) {
    const texto = String(nodo.texto ?? '')
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .trim()
      .toLocaleLowerCase('es-ES');
    return JSON.stringify({
      tipo: nodo.tipo,
      texto,
      pagina: nodo.pagina ?? null,
      diapositiva: nodo.diapositiva ?? null,
      hoja: nodo.hoja ?? null,
      archivoInterno: separarPorArchivoInterno
        ? (this.archivoInternoNodo(nodo) ?? null)
        : null,
    });
  }

  private claveOrdenNodo(nodo: NodoDocumentoMultimodalV2) {
    return JSON.stringify({
      tipo: nodo.tipo,
      texto: nodo.texto ?? null,
      pagina: nodo.pagina ?? null,
      diapositiva: nodo.diapositiva ?? null,
      hoja: nodo.hoja ?? null,
      bbox: nodo.bbox ?? null,
      confianza: nodo.confianza ?? null,
      motor: nodo.procedencia.motor,
      archivoInterno: this.archivoInternoNodo(nodo) ?? null,
      datos: nodo.datos ?? null,
    });
  }

  private tipoNodoBloque(
    tipo: DocumentoExtraidoCanonico['bloques'][number]['tipo'],
  ): NodoDocumentoMultimodalV2['tipo'] | undefined {
    switch (tipo) {
      case 'TITULO':
      case 'SUBTITULO':
        return 'TITULO';
      case 'PARRAFO':
      case 'OPCION':
      case 'METADATO':
        return 'PARRAFO';
      case 'LISTA':
        return 'LISTA';
      case 'TABLA':
        return 'TABLA';
      case 'IMAGEN_REFERENCIADA':
        return 'IMAGEN';
      case 'PREGUNTA':
        return 'PREGUNTA';
      case 'SOLUCION':
        return 'SOLUCION';
      case 'SEPARADOR':
        return undefined;
    }
  }

  private archivoInternoNodo(nodo: NodoDocumentoMultimodalV2) {
    const tipado = this.texto(nodo.procedencia.archivoInterno);
    if (tipado) return tipado;

    const raw = this.registro(nodo.procedencia.raw);
    const legacy = this.texto(
      raw.archivoInterno ?? raw.archivoZip ?? raw.documentoOrigen,
    );
    if (legacy) return legacy;

    const referencia = this.texto(nodo.procedencia.referencia);
    const separador = referencia?.indexOf('#') ?? -1;
    return separador > 0 ? referencia?.slice(0, separador) : undefined;
  }

  private motorNodo(raw: unknown): NodoDocumentoMultimodalV2['procedencia']['motor'] {
    const data = this.registro(raw);
    const motor = String(data.motor ?? data.engine ?? '').toUpperCase();
    if (data.ocr != null || data.esOcr === true || motor.includes('OCR')) return 'OCR';
    if (motor.includes('DOCLING')) return 'DOCLING';
    if (motor.includes('PDFJS') || motor.includes('PDF.JS')) return 'PDFJS';
    return 'NATIVO';
  }

  private origenNodo(raw: Record<string, unknown>): OrigenNodoDocumento {
    const inferencia = this.registro(raw.inferenciaSemantica);
    if (
      inferencia.tituloInferido === true ||
      inferencia.segmentoInferido === true
    ) {
      return 'INFERIDO';
    }
    if (
      raw.ocr != null ||
      raw.esOcr === true ||
      String(raw.motor ?? raw.engine ?? '').toUpperCase().includes('OCR')
    ) {
      return 'OCR';
    }
    return 'NATIVO';
  }

  private hash(value: string) {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }

  private numero(value: unknown) {
    const numero = Number(value);
    return Number.isInteger(numero) && numero > 0 ? numero : undefined;
  }

  private texto(value: unknown) {
    const texto = typeof value === 'string' ? value.trim() : '';
    return texto || undefined;
  }

  private registro(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
