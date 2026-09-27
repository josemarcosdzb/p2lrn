import {ReaderInputError} from '../../reader-error.js';
import type { ResultadoDeteccionArchivo } from '../../deteccion-archivo/types/resultado-deteccion-archivo.type.js';
import type { DocumentoExtraidoCanonico } from '../types/documento-extraido-canonico.type.js';
import { crearTempId } from '../../utils/temp-id.util.js';
import { limpiarTextoImportacion } from '../../utils/texto-importacion.util.js';
import type { ArchivoImportacionSubido } from '../../types/archivo-importacion-subido.type.js';

export class ExtractorJsonService {
  async extraer(params: {
    archivo: ArchivoImportacionSubido;
    deteccion: ResultadoDeteccionArchivo;
  }): Promise<DocumentoExtraidoCanonico> {
    const texto = limpiarTextoImportacion(
      params.archivo.buffer.toString('utf8'),
    );
    if (!texto) throw new ReaderInputError('El archivo JSON está vacío.');

    let raw: unknown;
    try {
      raw = JSON.parse(texto);
    } catch (error) {
      throw new ReaderInputError(
        `El JSON no es válido${error instanceof Error ? `: ${error.message}` : '.'}`,
      );
    }

    const bloquesTexto = this.extraerBloquesTexto(raw);

    return {
      version: 'p2lrn.source-reader.documento.extraido.v1',
      origen: {
        nombreArchivo: params.deteccion.nombreArchivo,
        extensionOriginal: params.deteccion.extension,
        mimeOriginal: params.deteccion.mimeType,
        tipoArchivoDetectado: 'JSON',
        estrategiaExtraccion: 'JSON_CANONICO',
      },
      metadatos: { tituloDetectado: this.detectarTitulo(raw) },
      bloques:
        bloquesTexto.length > 0
          ? bloquesTexto.map((linea, index) => ({
              tempId: crearTempId('json_linea'),
              tipo: 'PARRAFO' as const,
              texto: linea,
              orden: index + 1,
              fuente: { tipo: 'JSON' as const, raw: {} },
            }))
          : [
              {
                tempId: crearTempId('json_raw'),
                tipo: 'METADATO',
                texto,
                orden: 1,
                fuente: { tipo: 'JSON', raw: this.objeto(raw) ?? {} },
              },
            ],
      tablas: [],
      raw,
      advertencias: [],
    };
  }

  private detectarTitulo(raw: unknown): string | undefined {
    const obj = this.objeto(raw);
    const curso = this.objeto(obj?.curso);
    const titulo = curso?.titulo ?? obj?.titulo ?? obj?.title;
    return typeof titulo === 'string' && titulo.trim()
      ? titulo.trim()
      : undefined;
  }

  private extraerBloquesTexto(raw: unknown): string[] {
    const obj = this.objeto(raw);
    const contenido = Array.isArray(obj?.contenido) ? obj.contenido : [];
    return contenido
      .flatMap((item) => (typeof item === 'string' ? item.split(/\r?\n/) : []))
      .map((linea) => limpiarTextoImportacion(linea))
      .filter(Boolean);
  }

  private objeto(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }
}
