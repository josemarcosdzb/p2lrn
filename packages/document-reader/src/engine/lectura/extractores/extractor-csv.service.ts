import {ReaderInputError} from '../../reader-error.js';
import type { ResultadoDeteccionArchivo } from '../../deteccion-archivo/types/resultado-deteccion-archivo.type.js';
import type { ArchivoImportacionSubido } from '../../types/archivo-importacion-subido.type.js';
import { crearTempId } from '../../utils/temp-id.util.js';
import { limpiarTextoImportacion } from '../../utils/texto-importacion.util.js';
import type { DocumentoExtraidoCanonico } from '../types/documento-extraido-canonico.type.js';

export class ExtractorCsvService {
  async extraer(params: {
    archivo: ArchivoImportacionSubido;
    deteccion: ResultadoDeteccionArchivo;
  }): Promise<DocumentoExtraidoCanonico> {
    const texto = limpiarTextoImportacion(
      params.archivo.buffer.toString('utf8').replace(/^\uFEFF/, ''),
    );
    if (!texto) throw new ReaderInputError('El archivo CSV está vacío.');

    const separador = this.detectarSeparador(texto);
    const matriz = this.parseCsv(texto, separador);
    if (matriz.length === 0) {
      throw new ReaderInputError('El CSV no contiene filas legibles.');
    }

    const ancho = Math.max(...matriz.map((fila) => fila.length), 1);
    const columnas = this.columnasUnicas(
      Array.from({ length: ancho }, (_, index) =>
        matriz[0]?.[index]?.trim() || `columna_${index + 1}`,
      ),
    );
    const filas = matriz.slice(1).map((fila) =>
      Object.fromEntries(
        columnas.map((columna, index) => [columna, fila[index] ?? '']),
      ),
    );

    return {
      version: 'p2lrn.source-reader.documento.extraido.v1',
      origen: {
        nombreArchivo: params.deteccion.nombreArchivo,
        extensionOriginal: params.deteccion.extension,
        mimeOriginal: params.deteccion.mimeType,
        tipoArchivoDetectado: 'CSV',
        estrategiaExtraccion: 'CSV_TABLA',
      },
      metadatos: {},
      // La tabla es la representación canónica. No se replica cada fila como
      // METADATO porque eso duplica el contenido y distorsiona la cobertura.
      bloques: [],
      tablas: [
        {
          tempId: crearTempId('csv_tabla'),
          orden: 1,
          nombre: 'CSV importado',
          columnas,
          filas,
        },
      ],
      raw: {
        csv: {
          version: 'CSV_RFC4180_COMPAT_V2',
          separador,
          columnas: columnas.length,
          filas: filas.length,
        },
      },
      advertencias: [],
    };
  }

  private detectarSeparador(texto: string) {
    const candidatos = [',', ';', '\t'];
    const evaluados = candidatos.map((separador) => {
      try {
        const filas = this.parseCsv(texto, separador).slice(0, 30);
        const anchos = filas.map((fila) => fila.length).filter((ancho) => ancho > 1);
        const frecuencia = new Map<number, number>();
        for (const ancho of anchos) {
          frecuencia.set(ancho, (frecuencia.get(ancho) ?? 0) + 1);
        }
        const [anchoModal = 1, coincidencias = 0] = [...frecuencia.entries()].sort(
          (a, b) => b[1] - a[1] || b[0] - a[0],
        )[0] ?? [1, 0];
        const consistencia = coincidencias / Math.max(1, filas.length);
        return {
          separador,
          score: anchoModal > 1 ? consistencia * 100 + anchoModal : 0,
        };
      } catch {
        return { separador, score: -1 };
      }
    });
    return evaluados.sort((a, b) => b.score - a.score)[0]?.separador ?? ',';
  }

  private parseCsv(texto: string, separador: string): string[][] {
    const filas: string[][] = [];
    let fila: string[] = [];
    let celda = '';
    let entreComillas = false;
    let celdaEntreComillas = false;

    const cerrarCelda = () => {
      fila.push(celdaEntreComillas ? celda : celda.trim());
      celda = '';
      celdaEntreComillas = false;
    };

    for (let i = 0; i < texto.length; i += 1) {
      const char = texto[i];
      const next = texto[i + 1];

      if (char === '"' && entreComillas && next === '"') {
        celda += '"';
        i += 1;
        continue;
      }

      if (char === '"') {
        if (!entreComillas && celda.trim().length === 0) {
          if (celda.length > 0) celda = '';
          entreComillas = true;
          celdaEntreComillas = true;
          continue;
        }
        if (entreComillas) {
          entreComillas = false;
          continue;
        }
        celda += char;
        continue;
      }

      if (char === separador && !entreComillas) {
        cerrarCelda();
        continue;
      }

      if ((char === '\n' || char === '\r') && !entreComillas) {
        if (char === '\r' && next === '\n') i += 1;
        cerrarCelda();
        if (fila.some((value) => value.length > 0)) filas.push(fila);
        fila = [];
        continue;
      }

      celda += char;
    }

    if (entreComillas) {
      throw new ReaderInputError(
        'El CSV contiene una celda entre comillas sin cierre.',
      );
    }

    cerrarCelda();
    if (fila.some((value) => value.length > 0)) filas.push(fila);
    return filas;
  }

  private columnasUnicas(columnas: string[]) {
    const usadas = new Map<string, number>();
    return columnas.map((columna, index) => {
      const base = columna.trim() || `columna_${index + 1}`;
      const key = base.toLocaleLowerCase('es-ES');
      const aparicion = (usadas.get(key) ?? 0) + 1;
      usadas.set(key, aparicion);
      return aparicion === 1 ? base : `${base}_${aparicion}`;
    });
  }
}
