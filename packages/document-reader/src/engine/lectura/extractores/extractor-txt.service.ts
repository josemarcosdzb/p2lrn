import {ReaderInputError} from '../../reader-error.js';
import type { ResultadoDeteccionArchivo } from '../../deteccion-archivo/types/resultado-deteccion-archivo.type.js';
import type { DocumentoExtraidoCanonico } from '../types/documento-extraido-canonico.type.js';
import { crearTempId } from '../../utils/temp-id.util.js';
import { limpiarTextoImportacion } from '../../utils/texto-importacion.util.js';
import type { ArchivoImportacionSubido } from '../../types/archivo-importacion-subido.type.js';

export class ExtractorTxtService {
  async extraer(params: {
    archivo: ArchivoImportacionSubido;
    deteccion: ResultadoDeteccionArchivo;
  }): Promise<DocumentoExtraidoCanonico> {
    const texto = limpiarTextoImportacion(
      params.archivo.buffer.toString('utf8'),
    );
    if (!texto) throw new ReaderInputError('El archivo TXT está vacío.');

    const lineas = this.extraerLineasConSeparacion(texto);

    return {
      version: 'p2lrn.source-reader.documento.extraido.v1',
      origen: {
        nombreArchivo: params.deteccion.nombreArchivo,
        extensionOriginal: params.deteccion.extension,
        mimeOriginal: params.deteccion.mimeType,
        tipoArchivoDetectado: 'TXT',
        estrategiaExtraccion: 'TXT_LINEAS',
      },
      metadatos: {},
      bloques: lineas.map((linea, index) => ({
        tempId: crearTempId('txt_linea'),
        tipo: 'PARRAFO',
        texto: linea.texto,
        orden: index + 1,
        fuente: {
          tipo: 'TXT',
          raw: { separacionAntes: linea.separacionAntes },
        },
      })),
      tablas: [],
      advertencias: [],
    };
  }

  private extraerLineasConSeparacion(texto: string) {
    const lineas: Array<{ texto: string; separacionAntes: number }> = [];
    let vacias = 0;

    for (const raw of texto.split('\n')) {
      const linea = raw.trim();
      if (!linea) {
        vacias += 1;
        continue;
      }
      lineas.push({
        texto: linea,
        separacionAntes: lineas.length === 0 ? 0 : vacias,
      });
      vacias = 0;
    }

    return lineas;
  }
}
