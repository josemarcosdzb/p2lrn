import {ReaderInputError} from '../../reader-error.js';
import type { ResultadoDeteccionArchivo } from '../../deteccion-archivo/types/resultado-deteccion-archivo.type.js';
import type { ArchivoImportacionSubido } from '../../types/archivo-importacion-subido.type.js';
import { crearTempId } from '../../utils/temp-id.util.js';
import { limpiarTextoImportacion } from '../../utils/texto-importacion.util.js';
import type { DocumentoExtraidoCanonico } from '../types/documento-extraido-canonico.type.js';
import type { TablaDocumentoExtraida } from '../types/tabla-documento-extraida.type.js';
import { columnasTablaUnicas } from './utils/tabla-documento.util.js';

interface AcumuladorMarkdown {
  bloques: DocumentoExtraidoCanonico['bloques'];
  tablas: TablaDocumentoExtraida[];
  parrafo: string[];
  parrafoLineaInicio?: number;
  codigo: string[];
  codigoLineaInicio?: number;
  enCodigo: boolean;
  lenguajeCodigo?: string;
  separacionPendiente: number;
}

export class ExtractorMarkdownService {
  async extraer(params: {
    archivo: ArchivoImportacionSubido;
    deteccion: ResultadoDeteccionArchivo;
  }): Promise<DocumentoExtraidoCanonico> {
    const texto = limpiarTextoImportacion(
      params.archivo.buffer.toString('utf8'),
    );
    if (!texto) {
      throw new ReaderInputError('El archivo Markdown está vacío.');
    }

    const estado: AcumuladorMarkdown = {
      bloques: [],
      tablas: [],
      parrafo: [],
      codigo: [],
      enCodigo: false,
      separacionPendiente: 0,
    };
    const lineas = texto.split(/\r?\n/);

    for (let index = 0; index < lineas.length; index += 1) {
      const raw = lineas[index];
      const linea = raw.trimEnd();
      const fence = linea.trim().match(/^(```+|~~~+)\s*([^\s]*)?.*$/);
      if (fence) {
        this.volcarParrafo(estado);
        if (!estado.enCodigo) {
          estado.enCodigo = true;
          estado.lenguajeCodigo = fence[2] || undefined;
          estado.codigoLineaInicio = index + 2;
        } else {
          this.volcarCodigo(estado);
          estado.enCodigo = false;
          estado.lenguajeCodigo = undefined;
        }
        continue;
      }
      if (estado.enCodigo) {
        estado.codigo.push(raw);
        continue;
      }

      if (!linea.trim()) {
        this.volcarParrafo(estado);
        estado.separacionPendiente += 1;
        continue;
      }

      const tabla = this.intentarTabla(lineas, index, estado.tablas.length);
      if (tabla) {
        this.volcarParrafo(estado);
        tabla.tabla.fuente = {
          ...(tabla.tabla.fuente ?? { tipo: 'MARKDOWN' }),
          raw: {
            ...(tabla.tabla.fuente?.raw ?? {}),
            separacionAntes: this.tomarSeparacion(estado),
          },
        };
        estado.tablas.push(tabla.tabla);
        index = tabla.fin;
        continue;
      }

      const heading = linea.trim().match(/^(#{1,6})\s+(.+?)\s*#*$/);
      if (heading) {
        this.volcarParrafo(estado);
        this.agregarTitulo(estado, heading[2], heading[1].length, index + 1);
        continue;
      }

      const siguiente = lineas[index + 1]?.trim() ?? '';
      if (linea.trim() && /^(?:=+|-+)\s*$/.test(siguiente)) {
        this.volcarParrafo(estado);
        this.agregarTitulo(
          estado,
          linea.trim(),
          siguiente.startsWith('=') ? 1 : 2,
          index + 1,
        );
        index += 1;
        continue;
      }

      const lista = linea.match(/^(\s*)(?:[-*+]\s+|(\d+)[.)]\s+)(.+)$/);
      if (lista) {
        this.volcarParrafo(estado);
        estado.bloques.push({
          tempId: crearTempId('md_lista'),
          tipo: 'LISTA',
          texto: this.limpiarInline(lista[3]),
          orden: this.ordenLinea(index + 1),
          fuente: {
            tipo: 'MARKDOWN',
            raw: {
              markdown: raw,
              markdownLine: index + 1,
              listLevel: Math.floor((lista[1]?.replace(/\t/g, '  ').length ?? 0) / 2),
              ordered: Boolean(lista[2]),
              ordinal: lista[2] ? Number(lista[2]) : undefined,
              separacionAntes: this.tomarSeparacion(estado),
            },
          },
        });
        continue;
      }

      const cita = linea.match(/^\s*>\s?(.*)$/);
      if (cita) {
        this.volcarParrafo(estado);
        estado.bloques.push({
          tempId: crearTempId('md_cita'),
          tipo: 'PARRAFO',
          texto: this.limpiarInline(cita[1]),
          orden: this.ordenLinea(index + 1),
          fuente: {
            tipo: 'MARKDOWN',
            raw: {
              markdown: raw,
              markdownLine: index + 1,
              role: 'BLOCKQUOTE',
              separacionAntes: this.tomarSeparacion(estado),
            },
          },
        });
        continue;
      }

      if (/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(linea)) {
        this.volcarParrafo(estado);
        const separacionAntes = this.tomarSeparacion(estado);
        estado.bloques.push({
          tempId: crearTempId('md_separador'),
          tipo: 'SEPARADOR',
          texto: '',
          orden: this.ordenLinea(index + 1),
          fuente: {
            tipo: 'MARKDOWN',
            raw: { markdown: raw, markdownLine: index + 1, separacionAntes },
          },
        });
        estado.separacionPendiente = Math.max(estado.separacionPendiente, 1);
        continue;
      }

      if (estado.parrafo.length === 0) estado.parrafoLineaInicio = index + 1;
      estado.parrafo.push(linea.trim());
    }

    this.volcarParrafo(estado);
    if (estado.enCodigo || estado.codigo.length > 0) this.volcarCodigo(estado);

    if (
      estado.bloques.every((bloque) =>
        ['SEPARADOR', 'METADATO'].includes(bloque.tipo),
      ) &&
      estado.tablas.length === 0
    ) {
      throw new ReaderInputError(
        'El archivo Markdown no contiene contenido legible.',
      );
    }

    return {
      version: 'p2lrn.source-reader.documento.extraido.v1',
      origen: {
        nombreArchivo: params.deteccion.nombreArchivo,
        extensionOriginal: params.deteccion.extension,
        mimeOriginal: params.deteccion.mimeType,
        tipoArchivoDetectado: 'MARKDOWN',
        estrategiaExtraccion: 'MARKDOWN_LINEAS',
      },
      metadatos: {
        tituloDetectado: estado.bloques.find(
          (bloque) => bloque.tipo === 'TITULO',
        )?.texto,
      },
      bloques: estado.bloques,
      tablas: estado.tablas,
      raw: {
        markdown: {
          version: 'MARKDOWN_STRUCTURED_V2',
          tablas: estado.tablas.length,
          bloquesCodigo: estado.bloques.filter(
            (bloque) => bloque.fuente?.raw?.role === 'CODE_BLOCK',
          ).length,
        },
      },
      advertencias: [],
    };
  }

  private volcarParrafo(estado: AcumuladorMarkdown) {
    if (estado.parrafo.length === 0) return;
    const texto = estado.parrafo
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const lineaInicio = estado.parrafoLineaInicio;
    estado.parrafo = [];
    estado.parrafoLineaInicio = undefined;
    if (!texto) return;
    estado.bloques.push({
      tempId: crearTempId('md_parrafo'),
      tipo: 'PARRAFO',
      texto: this.limpiarInline(texto),
      orden: this.ordenLinea(lineaInicio ?? estado.bloques.length + 1),
      fuente: {
        tipo: 'MARKDOWN',
        raw: {
          role: 'PARAGRAPH',
          markdownLine: lineaInicio,
          separacionAntes: this.tomarSeparacion(estado),
        },
      },
    });
  }

  private volcarCodigo(estado: AcumuladorMarkdown) {
    const texto = estado.codigo.join('\n').trimEnd();
    const lineaInicio = estado.codigoLineaInicio;
    estado.codigo = [];
    estado.codigoLineaInicio = undefined;
    if (!texto) return;
    estado.bloques.push({
      tempId: crearTempId('md_codigo'),
      tipo: 'PARRAFO',
      texto,
      orden: this.ordenLinea(lineaInicio ?? estado.bloques.length + 1),
      fuente: {
        tipo: 'MARKDOWN',
        raw: {
          role: 'CODE_BLOCK',
          language: estado.lenguajeCodigo,
          markdownLine: lineaInicio,
          preserveWhitespace: true,
          separacionAntes: this.tomarSeparacion(estado),
        },
      },
    });
  }

  private agregarTitulo(
    estado: AcumuladorMarkdown,
    texto: string,
    nivel: number,
    linea: number,
  ) {
    estado.bloques.push({
      tempId: crearTempId('md_heading'),
      tipo: 'TITULO',
      texto: this.limpiarInline(texto),
      nivel,
      orden: this.ordenLinea(linea),
      fuente: {
        tipo: 'MARKDOWN',
        raw: {
          headingLevel: nivel,
          markdownLine: linea,
          separacionAntes: this.tomarSeparacion(estado),
        },
      },
    });
  }

  private intentarTabla(
    lineas: string[],
    inicio: number,
    offset: number,
  ): { tabla: TablaDocumentoExtraida; fin: number } | null {
    const cabeceraRaw = lineas[inicio]?.trim() ?? '';
    const separadorRaw = lineas[inicio + 1]?.trim() ?? '';
    if (!cabeceraRaw.includes('|') || !this.esSeparadorTabla(separadorRaw)) {
      return null;
    }

    const cabecera = this.celdasTabla(cabeceraRaw);
    const separadores = this.celdasTabla(separadorRaw);
    if (
      cabecera.length < 2 ||
      separadores.length !== cabecera.length ||
      !separadores.every((celda) => /^:?-{3,}:?$/.test(celda.replace(/\s+/g, '')))
    ) {
      return null;
    }

    const filas: string[][] = [];
    let fin = inicio + 1;
    for (let index = inicio + 2; index < lineas.length; index += 1) {
      const linea = lineas[index].trim();
      if (!linea || !linea.includes('|')) break;
      const celdas = this.celdasTabla(linea);
      if (celdas.length === 0) break;
      filas.push(
        Array.from({ length: cabecera.length }, (_, columna) =>
          this.limpiarInline(celdas[columna] ?? ''),
        ),
      );
      fin = index;
    }

    if (filas.length === 0) return null;
    const columnas = columnasTablaUnicas(
      cabecera.map(
        (celda, index) => this.limpiarInline(celda) || `Columna ${index + 1}`,
      ),
    );
    return {
      fin,
      tabla: {
        tempId: crearTempId('md_tabla'),
        orden: this.ordenLinea(inicio + 1),
        nombre: `Tabla ${offset + 1}`,
        columnas,
        filas: filas.map((fila) =>
          Object.fromEntries(
            columnas.map((columna, index) => [columna, fila[index] ?? '']),
          ),
        ),
        fuente: {
          tipo: 'MARKDOWN',
          raw: {
            markdownLineStart: inicio + 1,
            markdownLineEnd: fin + 1,
          },
        },
      },
    };
  }

  private tomarSeparacion(estado: AcumuladorMarkdown) {
    const separacion =
      estado.bloques.length === 0 && estado.tablas.length === 0
        ? 0
        : estado.separacionPendiente;
    estado.separacionPendiente = 0;
    return separacion;
  }

  private ordenLinea(linea: number) {
    return Math.max(1, linea) * 1_000;
  }

  private esSeparadorTabla(linea: string) {
    if (!linea.includes('|')) return false;
    const celdas = this.celdasTabla(linea);
    return celdas.length >= 2 && celdas.every((celda) => /^\s*:?-{3,}:?\s*$/.test(celda));
  }

  private celdasTabla(linea: string) {
    let value = linea.trim();
    if (value.startsWith('|')) value = value.slice(1);
    if (value.endsWith('|')) value = value.slice(0, -1);
    const celdas: string[] = [];
    let actual = '';
    let escaped = false;
    for (const char of value) {
      if (escaped) {
        actual += char;
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '|') {
        celdas.push(actual.trim());
        actual = '';
      } else {
        actual += char;
      }
    }
    celdas.push(actual.trim());
    return celdas;
  }

  private limpiarInline(texto: string) {
    return texto
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, url) =>
        `${String(alt).trim() || 'Imagen'} [imagen: ${String(url).trim()}]`,
      )
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, etiqueta, url) =>
        `${String(etiqueta).trim()} (${String(url).trim()})`,
      )
      .replace(/`([^`]+)`/g, '$1')
      .replace(/(?:\*\*|__)(.+?)(?:\*\*|__)/g, '$1')
      .replace(/(?:\*|_)(.+?)(?:\*|_)/g, '$1')
      .replace(/\\([\\`*_[\]{}()#+\-.!|>])/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
