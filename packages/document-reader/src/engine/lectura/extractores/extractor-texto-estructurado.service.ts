import {ReaderInputError} from '../../reader-error.js';
import path from 'node:path';
import type { ResultadoDeteccionArchivo } from '../../deteccion-archivo/types/resultado-deteccion-archivo.type.js';
import type { ArchivoImportacionSubido } from '../../types/archivo-importacion-subido.type.js';
import { crearTempId } from '../../utils/temp-id.util.js';
import { listarEntradasZipBuffer } from './utils/lector-zip-buffer.util.js';
import { columnasTablaUnicas } from './utils/tabla-documento.util.js';
import { limpiarTextoImportacion } from '../../utils/texto-importacion.util.js';
import type { DocumentoExtraidoCanonico } from '../types/documento-extraido-canonico.type.js';
import type { TablaDocumentoExtraida } from '../types/tabla-documento-extraida.type.js';
import type { BloqueDocumentoExtraido } from '../types/bloque-documento-extraido.type.js';
import type {
  EstrategiaExtraccionDocumento,
  TipoArchivoDetectado,
} from '../types/tipo-archivo-detectado.type.js';

interface BloqueTextoIntermedio {
  texto: string;
  tipo?: BloqueDocumentoExtraido['tipo'];
  nivel?: number;
  estilo?: BloqueDocumentoExtraido['estilo'];
  raw?: Record<string, unknown>;
  hoja?: string;
  separacionAntes?: number;
}

interface NodoXmlSimple {
  tag: string;
  attrs: Record<string, string>;
  hijos: NodoXmlSimple[];
  textos: string[];
  sourceOffset?: number;
}

export class ExtractorTextoEstructuradoService {
  async extraer(params: {
    archivo: ArchivoImportacionSubido;
    deteccion: ResultadoDeteccionArchivo;
  }): Promise<DocumentoExtraidoCanonico> {
    const { archivo, deteccion } = params;
    const tipo = deteccion.tipo;
    const perfilEstructural = this.perfilEstructural(tipo, archivo.buffer);
    const bloquesIntermedios = await this.extraerBloques({
      buffer: archivo.buffer,
      tipo,
    });
    const tablas = await this.extraerTablas({
      buffer: archivo.buffer,
      tipo,
    });
    const bloques = bloquesIntermedios
      .map((bloque, index) => this.aBloqueCanonico(bloque, tipo, index))
      .filter((bloque) => Boolean(bloque.texto));

    if (bloques.length === 0 && tablas.length === 0) {
      throw new ReaderInputError(
        `El archivo ${this.nombreFormato(tipo)} no contiene texto legible.`,
      );
    }

    return {
      version: 'p2lrn.source-reader.documento.extraido.v1',
      origen: {
        nombreArchivo: deteccion.nombreArchivo,
        extensionOriginal: deteccion.extension,
        mimeOriginal: deteccion.mimeType,
        tipoArchivoDetectado: tipo,
        estrategiaExtraccion: this.estrategia(tipo),
      },
      metadatos: {
        tituloDetectado:
          bloques.find((bloque) => bloque.tipo === 'TITULO' && bloque.nivel === 1)
            ?.texto ??
          bloques.find(
            (bloque) => bloque.texto.length >= 4 && bloque.texto.length <= 120,
          )?.texto,
      },
      bloques,
      tablas,
      raw: {
        parserEstructurado: {
          version: 'TEXT_STRUCTURED_V2',
          tablas: tablas.length,
          perfilEstructural,
          fidelidadLimitada: this.fidelidadLimitada(tipo),
          caracteristicasNoConvertidas: this.caracteristicasNoConvertidas(tipo),
        },
      },
      advertencias: [
        {
          ruta: `${tipo.toLowerCase()}.estructura`,
          mensaje: `${this.nombreFormato(tipo)} leído conservando jerarquía nativa cuando el formato la declara${tablas.length ? ` y ${tablas.length} tabla(s) estructurada(s)` : ''}.`,
          nivel: 'INFO',
        },
        ...(perfilEstructural === 'GENERICO_DESCONOCIDO'
          ? [
              {
                ruta: `${tipo.toLowerCase()}.perfil`,
                mensaje:
                  'El documento no declara un perfil estructural pedagógico reconocido; se conserva el texto y la estructura observable sin asumir semántica de curso.',
                nivel: 'ADVERTENCIA' as const,
              },
            ]
          : []),
      ],
    };
  }

  private perfilEstructural(tipo: TipoArchivoDetectado, buffer: Buffer) {
    if (!['XML', 'YAML'].includes(tipo)) return 'FORMATO_CONOCIDO';
    const texto = buffer.toString('utf8');
    if (tipo === 'XML') {
      return /<(?:curso|course|modulo|module|unidad|unit|leccion|lesson|chapter|section|subsection|titulo|title|h[1-6])\b/i.test(
        texto,
      )
        ? 'CURSO_RECONOCIBLE'
        : 'GENERICO_DESCONOCIDO';
    }
    return /^(?:\s*-?\s*)?(?:curso|course|modulos?|modules?|unidades?|units?|lecciones?|lessons?|capitulos?|chapters?|secciones?|sections?)\s*:/im.test(
      texto,
    )
      ? 'CURSO_RECONOCIBLE'
      : 'GENERICO_DESCONOCIDO';
  }

  async extraerTexto(params: {
    buffer: Buffer;
    tipo: TipoArchivoDetectado;
  }): Promise<string> {
    const bloques = await this.extraerBloques(params);
    return bloques.map((bloque) => bloque.texto).filter(Boolean).join('\n');
  }

  private async extraerBloques(params: {
    buffer: Buffer;
    tipo: TipoArchivoDetectado;
  }): Promise<BloqueTextoIntermedio[]> {
    const texto = params.buffer.toString('utf8');
    switch (params.tipo) {
      case 'HTML':
        return this.htmlABloques(texto);
      case 'RTF':
        return this.rtfABloques(texto);
      case 'TEX':
        return this.texABloques(texto);
      case 'XML':
        return this.xmlABloques(texto);
      case 'YAML':
        return this.yamlABloques(texto);
      case 'ODT':
        return this.odtABloques(params.buffer);
      case 'EPUB':
        return this.epubABloques(params.buffer);
      default:
        return this.textoPlanoABloques(texto);
    }
  }

  private htmlABloques(html: string, hoja?: string): BloqueTextoIntermedio[] {
    const ocultar = (valor: string) => ' '.repeat(valor.length);
    const limpio = html
      .replace(/<script[\s\S]*?<\/script>/gi, ocultar)
      .replace(/<style[\s\S]*?<\/style>/gi, ocultar)
      .replace(/<!--([\s\S]*?)-->/g, ocultar)
      .replace(/<table\b[\s\S]*?<\/table>/gi, ocultar);
    const bloques: BloqueTextoIntermedio[] = [];
    const regex = /<(h[1-6]|p|li|dt|dd|blockquote|figcaption|title)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
    let match: RegExpExecArray | null;
    let separacionPendiente = 0;
    let finBloqueAnterior = 0;
    while ((match = regex.exec(limpio))) {
      separacionPendiente += this.contarSeparacionHtml(
        limpio.slice(finBloqueAnterior, match.index),
      );
      finBloqueAnterior = regex.lastIndex;
      const tag = match[1].toLowerCase();
      const texto = this.textoHtml(match[3]);

      // INVARIANTE EPUB: <title> pertenece al contenedor XHTML, no al árbol
      // pedagógico. Generadores como Pandoc producen "ch001.xhtml" y
      // "ch002.xhtml"; promoverlos a heading crea módulos artificiales y
      // reordena la introducción respecto al cuerpo. En HTML independiente
      // se conserva el <title> porque sí puede ser el título documental.
      if (tag === 'title' && hoja) {
        separacionPendiente = 0;
        continue;
      }

      if (!texto) {
        separacionPendiente += 1;
        continue;
      }
      const heading = tag.match(/^h([1-6])$/)?.[1];
      const nivel = heading ? Number(heading) : tag === 'title' ? 1 : undefined;
      const contextoLista =
        tag === 'li' ? this.contextoListaHtml(limpio, match.index) : undefined;
      bloques.push({
        texto,
        tipo: nivel ? 'TITULO' : tag === 'li' ? 'LISTA' : 'PARRAFO',
        nivel,
        hoja,
        separacionAntes: bloques.length === 0 ? 0 : separacionPendiente,
        raw: {
          tag,
          atributos: match[2]?.trim() || undefined,
          selector: tag,
          sourceOffset: match.index,
          sourceOrder: match.index + 1,
          ...(contextoLista ?? {}),
        },
      });
      separacionPendiente = 0;
    }

    if (bloques.length > 0) return bloques;
    return this.textoPlanoABloques(this.htmlATexto(limpio));
  }

  private contarSeparacionHtml(fragmento: string) {
    if (!fragmento) return 0;
    const saltosBr = [...fragmento.matchAll(/<br\s*\/?>/gi)].length;
    return Math.floor(saltosBr / 2);
  }

  private contextoListaHtml(html: string, hasta: number) {
    const pila: Array<{ ordered: boolean; nextOrdinal: number }> = [];
    const tokens = html
      .slice(0, Math.max(0, hasta))
      .match(/<\/?(?:ol|ul|li)\b[^>]*>/gi) ?? [];

    for (const token of tokens) {
      if (/^<\/(?:ol|ul)\b/i.test(token)) {
        pila.pop();
        continue;
      }
      const apertura = token.match(/^<(ol|ul)\b([^>]*)>/i);
      if (apertura) {
        const ordered = apertura[1].toLowerCase() === 'ol';
        const startRaw = ordered
          ? this.atributosXml(`<ol ${apertura[2] ?? ''}>`).start
          : undefined;
        const start = Number(startRaw);
        pila.push({
          ordered,
          nextOrdinal:
            ordered && Number.isInteger(start) && start > 0 ? start : 1,
        });
        continue;
      }
      if (/^<li\b/i.test(token) && pila.length > 0) {
        pila[pila.length - 1].nextOrdinal += 1;
      }
    }

    const actual = pila[pila.length - 1];
    if (!actual) {
      return { ordered: false, listLevel: 0 };
    }
    return {
      ordered: actual.ordered,
      listLevel: Math.max(0, pila.length - 1),
      ordinal: actual.ordered ? actual.nextOrdinal : undefined,
    };
  }

  private texABloques(tex: string): BloqueTextoIntermedio[] {
    // El preambulo TeX contiene metadatos y configuracion, no contenido del
    // curso. La jerarquia documental empieza en \begin{document}.
    const inicioDocumento = tex.search(/\\begin\{document\}/i);
    const finDocumento = tex.search(/\\end\{document\}/i);
    const cuerpo =
      inicioDocumento >= 0
        ? tex.slice(
            inicioDocumento + tex.slice(inicioDocumento).match(/^\\begin\{document\}/i)![0].length,
            finDocumento > inicioDocumento ? finDocumento : undefined,
          )
        : tex;
    const bloques: BloqueTextoIntermedio[] = [];
    const patron = /\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\{([^{}]+)\}/g;
    let ultimo = 0;
    let match: RegExpExecArray | null;
    while ((match = patron.exec(cuerpo))) {
      const separacionAntes = this.anadirParrafosTex(
        bloques,
        cuerpo.slice(ultimo, match.index).replace(/^\r?\n/, '').replace(/\r?\n$/, ''),
      );
      const comando = match[1];
      const nivel = this.nivelTex(comando);
      bloques.push({
        texto: this.limpiarTex(match[2]),
        tipo: 'TITULO',
        nivel,
        separacionAntes: bloques.length === 0 ? 0 : separacionAntes,
        raw: { comando: `\\${comando}`, nivel },
      });
      ultimo = patron.lastIndex;
    }
    this.anadirParrafosTex(
      bloques,
      cuerpo.slice(ultimo).replace(/^\r?\n/, ''),
    );
    return bloques.filter((bloque) => Boolean(bloque.texto));
  }

  private anadirParrafosTex(
    bloques: BloqueTextoIntermedio[],
    fragmento: string,
  ) {
    let separacionPendiente = 0;
    for (const raw of fragmento.split(/\r?\n/)) {
      const sinComentario = raw.replace(/%.*$/, '');
      if (!sinComentario.trim()) {
        if (!raw.trim()) separacionPendiente += 1;
        continue;
      }

      const normalizado = sinComentario
        .replace(/\\begin\{(?:itemize|enumerate)\}/g, '')
        .replace(/\\end\{(?:itemize|enumerate)\}/g, '')
        .replace(/\\item\s*/g, '• ')
        .replace(/\\(?:title|author|date)\{([^{}]+)\}/g, '$1')
        .replace(/\\begin\{[^{}]+\}|\\end\{[^{}]+\}/g, '')
        .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?(?:\{([^{}]*)\})?/g, '$1')
        .replace(/\\([_#%&{}])/g, '$1');
      const texto = this.limpiarTex(normalizado);
      if (!texto) continue;
      bloques.push({
        texto: texto.replace(/^•\s*/, ''),
        tipo: /^•\s*/.test(texto) ? 'LISTA' : 'PARRAFO',
        separacionAntes: bloques.length === 0 ? 0 : separacionPendiente,
      });
      separacionPendiente = 0;
    }
    return separacionPendiente;
  }

  private xmlABloques(xml: string): BloqueTextoIntermedio[] {
    const xmlSinTablas = xml.replace(
      /<table\b[\s\S]*?<\/table>/gi,
      (tabla) => ' '.repeat(tabla.length),
    );
    try {
      const raiz = this.parsearXmlSimple(xmlSinTablas);
      const fragmentosDocumentales = this.fragmentosXmlDocumentales(raiz);
      if (fragmentosDocumentales.length >= 2) {
        return this.fragmentosDocumentoSerializadoABloques(
          fragmentosDocumentales,
          'XML',
        );
      }
      const bloques: BloqueTextoIntermedio[] = [];
      raiz.hijos.forEach((nodo, index) =>
        this.bloquesDesdeNodoXml(nodo, bloques, `/${nodo.tag}[${index + 1}]`),
      );
      if (bloques.length > 0) return bloques;
    } catch {
      // El fallback textual conserva al menos el contenido legible. La calidad
      // marcará el perfil genérico para revisión en lugar de inventar jerarquía.
    }
    return this.textoPlanoABloques(this.xmlATexto(xmlSinTablas));
  }

  private parsearXmlSimple(xml: string): NodoXmlSimple {
    const raiz: NodoXmlSimple = { tag: '#document', attrs: {}, hijos: [], textos: [] };
    const pila: NodoXmlSimple[] = [raiz];
    const tokens = xml.matchAll(
      /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[^>]*\?>|<!DOCTYPE[\s\S]*?>|<[^>]+>|[^<]+/gi,
    );

    for (const tokenMatch of tokens) {
      const token = tokenMatch[0];
      const sourceOffset = tokenMatch.index ?? 0;
      if (/^<!--|^<\?|^<!DOCTYPE/i.test(token)) continue;
      if (/^<!\[CDATA\[/i.test(token)) {
        pila[pila.length - 1].textos.push(token.replace(/^<!\[CDATA\[/i, '').replace(/\]\]>$/, ''));
        continue;
      }
      if (!token.startsWith('<')) {
        pila[pila.length - 1].textos.push(this.decodificarEntidades(token));
        continue;
      }
      if (/^<\//.test(token)) {
        const cierre = this.nombreLocalXml(token.replace(/^<\//, '').replace(/>.*$/, '').trim());
        for (let index = pila.length - 1; index > 0; index -= 1) {
          if (pila[index].tag === cierre) {
            pila.splice(index);
            break;
          }
        }
        continue;
      }
      if (/^<!/.test(token)) continue;

      const selfClosing = /\/\s*>$/.test(token);
      const cuerpo = token.replace(/^</, '').replace(/\/?>$/, '').trim();
      const nombreRaw = cuerpo.match(/^([^\s/>]+)/)?.[1];
      if (!nombreRaw) continue;
      const nodo: NodoXmlSimple = {
        tag: this.nombreLocalXml(nombreRaw),
        attrs: this.atributosXml(token),
        hijos: [],
        textos: [],
        sourceOffset,
      };
      pila[pila.length - 1].hijos.push(nodo);
      if (!selfClosing) pila.push(nodo);
    }
    return raiz;
  }

  private bloquesDesdeNodoXml(
    nodo: NodoXmlSimple,
    bloques: BloqueTextoIntermedio[],
    ruta: string,
  ) {
    const tag = nodo.tag;
    const nivelContenedor = this.nivelContenedorXml(tag);
    const tituloDirecto = nivelContenedor
      ? nodo.hijos.find((hijo) => this.esTagTituloXml(hijo.tag))
      : undefined;
    const tituloAtributo =
      nodo.attrs.title ?? nodo.attrs.titulo ?? nodo.attrs.name ?? nodo.attrs.nombre;

    if (nivelContenedor) {
      const titulo =
        (tituloDirecto ? this.textoNodoXml(tituloDirecto) : '') ||
        this.decodificarEntidades(tituloAtributo ?? '').trim();
      if (titulo) {
        bloques.push({
          texto: titulo,
          tipo: 'TITULO',
          nivel: nivelContenedor,
          raw: { tag, xmlPath: ruta, attrs: nodo.attrs, contenedorEstructural: true, sourceOffset: tituloDirecto?.sourceOffset ?? nodo.sourceOffset, sourceOrder: (tituloDirecto?.sourceOffset ?? nodo.sourceOffset ?? 0) + 1 },
        });
      }
    } else if (this.esTagTituloXml(tag)) {
      const texto = this.textoNodoXml(nodo);
      if (texto) {
        bloques.push({
          texto,
          tipo: 'TITULO',
          nivel: this.nivelXmlTag(tag, this.attrsComoTexto(nodo.attrs)),
          raw: { tag, xmlPath: ruta, attrs: nodo.attrs, sourceOffset: nodo.sourceOffset, sourceOrder: (nodo.sourceOffset ?? 0) + 1 },
        });
      }
      return;
    } else if (this.esTagTextoXml(tag)) {
      const texto = this.textoNodoXml(nodo);
      if (texto) {
        bloques.push({
          texto,
          tipo: tag === 'li' || tag === 'item' ? 'LISTA' : 'PARRAFO',
          raw: { tag, xmlPath: ruta, attrs: nodo.attrs, sourceOffset: nodo.sourceOffset, sourceOrder: (nodo.sourceOffset ?? 0) + 1 },
        });
      }
      return;
    }

    const hijos = nodo.hijos.filter((hijo) => hijo !== tituloDirecto);
    hijos.forEach((hijo, index) =>
      this.bloquesDesdeNodoXml(
        hijo,
        bloques,
        `${ruta}/${hijo.tag}[${index + 1}]`,
      ),
    );

    if (!nivelContenedor && hijos.length === 0) {
      const texto = nodo.textos.join(' ').replace(/\s+/g, ' ').trim();
      if (texto && !/^#/.test(tag)) {
        bloques.push({
          texto,
          tipo: 'PARRAFO',
          raw: { tag, xmlPath: ruta, attrs: nodo.attrs, hojaGenerica: true, sourceOffset: nodo.sourceOffset, sourceOrder: (nodo.sourceOffset ?? 0) + 1 },
        });
      }
    }
  }

  private textoNodoXml(nodo: NodoXmlSimple): string {
    return [
      ...nodo.textos,
      ...nodo.hijos.map((hijo) => this.textoNodoXml(hijo)),
    ]
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private nombreLocalXml(tag: string) {
    return tag.split(':').pop()?.toLowerCase() ?? tag.toLowerCase();
  }

  private nivelContenedorXml(tag: string) {
    if (/^(?:modulo|module|unidad|unit)$/.test(tag)) return 1;
    if (/^(?:leccion|lesson|chapter)$/.test(tag)) return 2;
    if (tag === 'section') return 3;
    if (tag === 'subsection') return 4;
    return undefined;
  }

  private esTagTituloXml(tag: string) {
    return /^(?:titulo|title|h[1-6])$/.test(tag);
  }

  private esTagTextoXml(tag: string) {
    return /^(?:p|paragraph|texto|text|description|descripcion|content|contenido|li|item|blockquote)$/.test(tag);
  }

  private attrsComoTexto(attrs: Record<string, string>) {
    return Object.entries(attrs)
      .map(([clave, valor]) => `${clave}="${valor}"`)
      .join(' ');
  }

  private yamlABloques(yaml: string): BloqueTextoIntermedio[] {
    const fragmentosDocumentales = this.fragmentosYamlDocumentales(yaml);
    if (fragmentosDocumentales.length >= 2) {
      return this.fragmentosDocumentoSerializadoABloques(
        fragmentosDocumentales,
        'YAML',
      );
    }

    const bloques: BloqueTextoIntermedio[] = [];
    let separacionPendiente = 0;
    const empujar = (bloque: BloqueTextoIntermedio) => {
      bloques.push({
        ...bloque,
        separacionAntes: bloques.length === 0 ? 0 : separacionPendiente,
      });
      separacionPendiente = 0;
    };

    for (const [index, raw] of yaml.split(/\r?\n/).entries()) {
      if (!raw.trim()) {
        separacionPendiente += 1;
        continue;
      }
      if (/^\s*#/.test(raw)) continue;
      const indent = raw.match(/^\s*/)?.[0].length ?? 0;
      const linea = raw.trim().replace(/^[-]\s*/, '');
      const keyValue = linea.match(/^([\wÁÉÍÓÚÑáéíóúñ.-]+)\s*:\s*(.*)$/);
      if (keyValue) {
        const clave = keyValue[1];
        const valor = this.limpiarYaml(keyValue[2]);
        const estructura = /^(?:curso|course|modulos?|modules?|unidades?|units?|lecciones?|lessons?|capitulos?|chapters?|secciones?|sections?)$/i.test(
          clave,
        );
        if (estructura && valor) {
          empujar({
            texto: valor,
            tipo: 'TITULO',
            nivel: Math.min(4, Math.floor(indent / 2) + 1),
            raw: { key: clave, indent, line: index + 1 },
          });
        } else if (valor) {
          empujar({
            texto: valor,
            tipo: 'PARRAFO',
            raw: { key: clave, indent, line: index + 1 },
          });
        }
        continue;
      }
      const texto = this.limpiarYaml(linea);
      if (texto) empujar({ texto, tipo: 'PARRAFO', raw: { indent } });
    }
    return bloques;
  }

  /**
   * Reconoce el caso comun en el que YAML/XML solo serializan fragmentos de
   * un documento. La coleccion es transporte; la jerarquia se obtiene luego
   * de las evidencias del texto, no de las claves del contenedor.
   */
  private fragmentosDocumentoSerializadoABloques(
    fragmentos: string[],
    formato: 'YAML' | 'XML',
  ): BloqueTextoIntermedio[] {
    const bloques: BloqueTextoIntermedio[] = [];
    for (const [fragmentoIndex, fragmento] of fragmentos.entries()) {
      for (const [lineaIndex, raw] of limpiarTextoImportacion(fragmento)
        .split('\n')
        .entries()) {
        const texto = raw.replace(/\s+/g, ' ').trim();
        if (!texto) continue;
        bloques.push({
          texto,
          tipo: 'PARRAFO',
          separacionAntes: lineaIndex === 0 && bloques.length > 0 ? 1 : 0,
          raw: {
            documentoSerializado: true,
            formato,
            fragmentoIndex,
            lineaIndex,
          },
        });
      }
    }
    return bloques;
  }

  private fragmentosYamlDocumentales(yaml: string) {
    const lineas = yaml.split(/\r?\n/);
    const inicio = lineas.findIndex((linea) =>
      /^\s*(?:contenido|content|bloques|blocks)\s*:\s*$/i.test(linea),
    );
    if (inicio < 0) return [];

    const fragmentos: string[] = [];
    let actual: string[] | null = null;
    let comilla: "'" | '"' | null = null;

    const cerrar = () => {
      if (!actual) return;
      let texto = actual.join('\n').trim();
      if (comilla && texto.startsWith(comilla) && texto.endsWith(comilla)) {
        texto = texto.slice(1, -1);
      }
      if (comilla === "'") texto = texto.replace(/''/g, "'");
      if (comilla === '"') {
        texto = texto
          .replace(/\\n/g, '\n')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
      }
      if (texto.trim()) fragmentos.push(texto);
      actual = null;
      comilla = null;
    };

    for (let index = inicio + 1; index < lineas.length; index += 1) {
      const linea = lineas[index];
      const nuevoItem = linea.match(/^\s*-\s?(.*)$/);
      if (nuevoItem && !comilla) {
        cerrar();
        const valor = nuevoItem[1] ?? '';
        actual = [valor];
        if (valor.startsWith("'") && !this.esScalarYamlCerrado(valor, "'")) {
          comilla = "'";
        } else if (
          valor.startsWith('"') &&
          !this.esScalarYamlCerrado(valor, '"')
        ) {
          comilla = '"';
        }
        continue;
      }

      if (actual) {
        actual.push(linea.replace(/^\s{2}/, ''));
        if (comilla && this.esScalarYamlCerrado(actual.join('\n'), comilla)) {
          cerrar();
        }
        continue;
      }

      if (/^\S[^:]*\s*:\s*/.test(linea)) break;
    }
    cerrar();
    return fragmentos;
  }

  private esScalarYamlCerrado(texto: string, comilla: "'" | '"') {
    if (!texto.startsWith(comilla)) return true;
    if (comilla === '"') {
      let escapada = false;
      for (let index = 1; index < texto.length; index += 1) {
        const char = texto[index];
        if (char === '"' && !escapada && texto.slice(index + 1).trim() === '') {
          return true;
        }
        escapada = char === '\\' ? !escapada : false;
      }
      return false;
    }
    return /'\s*$/.test(texto) && !/''\s*$/.test(texto);
  }

  private fragmentosXmlDocumentales(raiz: NodoXmlSimple) {
    const buscar = (nodo: NodoXmlSimple, profundidad: number): string[] => {
      if (profundidad > 2) return [];
      const hijosBloque = nodo.hijos.filter((hijo) =>
        /^(?:bloque|block|fragmento|fragment)$/.test(hijo.tag),
      );
      const hijosEstructurales = nodo.hijos.some((hijo) =>
        /^(?:modulo|module|unidad|unit|leccion|lesson|chapter|section|subsection)$/.test(
          hijo.tag,
        ),
      );
      if (!hijosEstructurales && hijosBloque.length >= 2) {
        return hijosBloque
          .map((hijo) =>
            [...hijo.textos, ...hijo.hijos.map((nieto) => this.textoNodoXml(nieto))]
              .join('\n')
              .trim(),
          )
          .filter(Boolean);
      }
      for (const hijo of nodo.hijos) {
        const encontrados = buscar(hijo, profundidad + 1);
        if (encontrados.length >= 2) return encontrados;
      }
      return [];
    };
    return buscar(raiz, 0);
  }

  private rtfABloques(rtf: string): BloqueTextoIntermedio[] {
    const bloques: BloqueTextoIntermedio[] = [];
    const rtfSinMetadatos = this.eliminarDestinosRtfNoContenido(rtf);
    const parrafos = rtfSinMetadatos.split(/\\par\b/gi);
    let separacionPendiente = 0;
    for (const parrafo of parrafos) {
      const outlineRaw = parrafo.match(/\\outlinelevel(\d+)/i)?.[1];
      const fsRaw = [...parrafo.matchAll(/\\fs(\d+)/gi)].map((match) => Number(match[1]) / 2);
      const texto = this.rtfATexto(parrafo).replace(/\s+/g, ' ').trim();
      if (!texto) {
        separacionPendiente += 1;
        continue;
      }
      const nivel = outlineRaw == null ? undefined : Number(outlineRaw) + 1;
      bloques.push({
        texto,
        tipo: nivel ? 'TITULO' : 'PARRAFO',
        nivel,
        separacionAntes: bloques.length === 0 ? 0 : separacionPendiente,
        estilo: {
          fontSize: fsRaw.length > 0 ? Math.max(...fsRaw) : undefined,
          bold: /\\b(?:\s|\\|$)/i.test(parrafo) && !/\\b0\b/i.test(parrafo),
          italic: /\\i(?:\s|\\|$)/i.test(parrafo) && !/\\i0\b/i.test(parrafo),
        },
        raw: { outlineLevel: outlineRaw == null ? undefined : Number(outlineRaw) },
      });
      separacionPendiente = 0;
    }
    return bloques;
  }

  private async odtABloques(buffer: Buffer): Promise<BloqueTextoIntermedio[]> {
    const entradas = await listarEntradasZipBuffer(buffer);
    const content = entradas
      .find((entrada) => entrada.nombre === 'content.xml')
      ?.buffer.toString('utf8');
    if (!content) {
      throw new ReaderInputError('No se pudo leer content.xml dentro del ODT.');
    }

    const contenidoSinTablas = content.replace(
      /<table:table\b[\s\S]*?<\/table:table>/gi,
      (tabla) => ' '.repeat(tabla.length),
    );
    const bloques: BloqueTextoIntermedio[] = [];
    const regex = /<text:(h|p)\b([^>]*)>([\s\S]*?)<\/text:\1>/gi;
    let match: RegExpExecArray | null;
    let separacionPendiente = 0;
    while ((match = regex.exec(contenidoSinTablas))) {
      const tag = match[1].toLowerCase();
      const attrs = match[2] ?? '';
      const texto = this.decodificarEntidades(match[3].replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim();
      if (!texto) {
        separacionPendiente += 1;
        continue;
      }
      const nivelRaw = attrs.match(/text:outline-level="(\d+)"/i)?.[1];
      const nivel = tag === 'h' ? Number(nivelRaw ?? 1) : undefined;
      const styleName = attrs.match(/text:style-name="([^"]+)"/i)?.[1];
      bloques.push({
        texto,
        tipo: nivel ? 'TITULO' : 'PARRAFO',
        nivel,
        separacionAntes: bloques.length === 0 ? 0 : separacionPendiente,
        raw: { tag: `text:${tag}`, styleName, outlineLevel: nivel, sourceOffset: match.index, sourceOrder: match.index + 1 },
      });
      separacionPendiente = 0;
    }
    return bloques.length > 0
      ? bloques
      : this.textoPlanoABloques(this.xmlATexto(contenidoSinTablas));
  }

  private async epubABloques(buffer: Buffer): Promise<BloqueTextoIntermedio[]> {
    const entradasZip = await listarEntradasZipBuffer(buffer);
    const entradas = this.seleccionarEntradasLecturaEpub(entradasZip);
    if (entradas.length === 0) {
      throw new ReaderInputError(
        'No se encontraron documentos XHTML/HTML dentro del EPUB.',
      );
    }

    const bloquesPorEntrada = entradas.map((entrada) => ({
      entrada,
      bloques: this.htmlABloques(
        entrada.buffer.toString('utf8'),
        entrada.nombre,
      ),
    }));

    // INVARIANTE READER/EPUB - portada estructural y cuerpo son una sola raíz:
    // algunos exportadores (Pandoc/Calibre) separan `Modulo A` en un XHTML que
    // contiene exclusivamente ese H1 y abren el XHTML siguiente con otro H1
    // descriptivo (`El modelo relacional`) antes de las lecciones A.A, A.B...
    // Ese segundo H1 no es un módulo hermano. Si la portada aislada declara una
    // raíz pedagógica y el siguiente recurso contiene hijos numerados con el
    // mismo prefijo, conservamos el texto del segundo H1 pero lo tratamos como
    // contenido del módulo. No se aplica a EPUBs con capítulos H1 independientes.
    for (let index = 0; index < bloquesPorEntrada.length - 1; index += 1) {
      const actual = bloquesPorEntrada[index];
      const siguiente = bloquesPorEntrada[index + 1];
      if (!this.esContinuacionPortadaEpub(actual.bloques, siguiente.bloques)) {
        continue;
      }

      const raiz = siguiente.bloques[0];
      siguiente.bloques[0] = {
        ...raiz,
        tipo: 'PARRAFO',
        nivel: undefined,
        raw: {
          ...(raiz.raw ?? {}),
          epubContinuationRoot: true,
          epubOriginalHeadingLevel: raiz.nivel,
        },
      };
    }

    return bloquesPorEntrada.flatMap(({ entrada, bloques }, entryIndex) =>
      bloques.map((bloque) => {
        const localOrder = Number(bloque.raw?.sourceOrder);
        return {
          ...bloque,
          raw: {
            ...(bloque.raw ?? {}),
            pathInterno: entrada.nombre,
            sourceOrder:
              entryIndex * 10_000_000 +
              (Number.isFinite(localOrder) ? localOrder : 1),
          },
        };
      }),
    );
  }

  private esContinuacionPortadaEpub(
    portada: BloqueTextoIntermedio[],
    cuerpo: BloqueTextoIntermedio[],
  ) {
    if (portada.length !== 1 || cuerpo.length < 2) return false;
    const raizPortada = portada[0];
    const raizCuerpo = cuerpo[0];
    if (
      raizPortada.tipo !== 'TITULO' ||
      raizPortada.nivel !== 1 ||
      raizCuerpo.tipo !== 'TITULO' ||
      raizCuerpo.nivel !== 1
    ) {
      return false;
    }

    const etiqueta = raizPortada.texto.trim().match(
      /^(?:m[oó]dulo|unidad|tema|cap[ií]tulo)\s+([A-Z]|\d+|[IVXLCDM]+)\b/i,
    );
    const prefijo = etiqueta?.[1]?.toUpperCase();
    if (!prefijo) return false;

    return cuerpo.some((bloque) => {
      if (bloque.tipo !== 'TITULO' || bloque.nivel !== 2) return false;
      const numeracion = bloque.texto.trim().match(
        /^((?:\d+|[A-Z]|[IVXLCDM]+)(?:\.(?:\d+|[A-Z]|[IVXLCDM]+)){1,5})\b/i,
      );
      return numeracion?.[1]?.split('.')[0]?.toUpperCase() === prefijo;
    });
  }

  private async extraerTablas(params: {
    buffer: Buffer;
    tipo: TipoArchivoDetectado;
  }): Promise<TablaDocumentoExtraida[]> {
    const texto = params.buffer.toString('utf8');
    if (params.tipo === 'HTML') {
      return this.tablasHtml(texto);
    }
    if (params.tipo === 'ODT') {
      const entradas = await listarEntradasZipBuffer(params.buffer);
      const content = entradas
        .find((entrada) => entrada.nombre === 'content.xml')
        ?.buffer.toString('utf8');
      return content ? this.tablasOdt(content) : [];
    }
    if (params.tipo === 'EPUB') {
      const entradas = this.seleccionarEntradasLecturaEpub(
        await listarEntradasZipBuffer(params.buffer),
      );
      return entradas.flatMap((entrada, index) =>
        this.tablasHtml(
          entrada.buffer.toString('utf8'),
          entrada.nombre,
          'EPUB',
        ).map((tabla) => ({
          ...tabla,
          orden: index * 10_000_000 + tabla.orden,
          hoja: entrada.nombre,
        })),
      );
    }
    if (params.tipo === 'XML') {
      return this.tablasXmlGenericas(texto);
    }
    return [];
  }

  private tablasHtml(
    html: string,
    hoja?: string,
    tipoFuente: 'HTML' | 'EPUB' = 'HTML',
  ): TablaDocumentoExtraida[] {
    return [...html.matchAll(/<table\b([^>]*)>([\s\S]*?)<\/table>/gi)]
      .map((match, index) => {
        const cuerpo = match[2] ?? '';
        const caption = this.textoHtml(
          cuerpo.match(/<caption\b[^>]*>([\s\S]*?)<\/caption>/i)?.[1] ?? '',
        );
        const filas = [...cuerpo.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
          .map((fila) =>
            [...(fila[1] ?? '').matchAll(/<(th|td)\b([^>]*)>([\s\S]*?)<\/\1>/gi)].map(
              (celda) => ({
                texto: this.textoHtml(celda[3] ?? ''),
                header: String(celda[1]).toLowerCase() === 'th',
                colspan: this.spanHtml(celda[2] ?? '', 'colspan'),
                rowspan: this.spanHtml(celda[2] ?? '', 'rowspan'),
              }),
            ),
          )
          .filter((fila) => fila.some((celda) => celda.texto));
        if (filas.length === 0) return null;
        const primera = filas[0];
        const usaCabecera = primera.some((celda) => celda.header);
        const ancho = Math.max(...filas.map((fila) => fila.length));
        const columnas = columnasTablaUnicas(
          Array.from({ length: ancho }, (_, columna) =>
            usaCabecera && primera[columna]?.texto
              ? primera[columna].texto
              : `Columna ${columna + 1}`,
          ),
        );
        const datos = usaCabecera ? filas.slice(1) : filas;
        return {
          tempId: crearTempId('html_tabla'),
          orden: (match.index ?? 0) + 1,
          hoja,
          nombre: caption || `Tabla ${index + 1}`,
          columnas,
          filas: datos.map((fila) =>
            Object.fromEntries(
              columnas.map((columna, columnIndex) => [
                columna,
                fila[columnIndex]?.texto ?? '',
              ]),
            ),
          ),
          celdas: {
            headers: usaCabecera
              ? [primera.map((celda) => ({
                  texto: celda.texto,
                  colspan: celda.colspan,
                  rowspan: celda.rowspan,
                  esHeader: true,
                }))]
              : [],
            rows: datos.map((fila) =>
              fila.map((celda) => ({
                texto: celda.texto,
                colspan: celda.colspan,
                rowspan: celda.rowspan,
                esHeader: celda.header,
              })),
            ),
          },
          fuente: {
            tipo: tipoFuente,
            raw: { sourceOffset: match.index ?? 0 },
          },
        } satisfies TablaDocumentoExtraida;
      })
      .filter((tabla) => tabla !== null);
  }

  private tablasOdt(xml: string): TablaDocumentoExtraida[] {
    return [...xml.matchAll(/<table:table\b([^>]*)>([\s\S]*?)<\/table:table>/gi)]
      .map((match, index) => {
        const attrs = match[1] ?? '';
        const nombre =
          attrs.match(/table:name=["']([^"']+)["']/i)?.[1] ??
          `Tabla ${index + 1}`;
        const cuerpo = match[2] ?? '';
        const usaCabecera = /<table:table-header-rows\b[\s\S]*?<table:table-row\b/i.test(
          cuerpo,
        );
        const filas = [...cuerpo.matchAll(
          /<table:table-row\b[^>]*>([\s\S]*?)<\/table:table-row>/gi,
        )]
          .map((fila) =>
            [...(fila[1] ?? '').matchAll(
              /<table:table-cell\b[^>]*>([\s\S]*?)<\/table:table-cell>/gi,
            )].map((celda) =>
              this.decodificarEntidades((celda[1] ?? '').replace(/<[^>]+>/g, ' '))
                .replace(/\s+/g, ' ')
                .trim(),
            ),
          )
          .filter((fila) => fila.some(Boolean));
        if (filas.length === 0) return null;
        const ancho = Math.max(...filas.map((fila) => fila.length));
        const columnas = columnasTablaUnicas(
          Array.from({ length: ancho }, (_, columnIndex) =>
            usaCabecera && filas[0]?.[columnIndex]
              ? filas[0][columnIndex]
              : `Columna ${columnIndex + 1}`,
          ),
        );
        const datos = usaCabecera ? filas.slice(1) : filas;
        return {
          tempId: crearTempId('odt_tabla'),
          orden: (match.index ?? 0) + 1,
          nombre,
          columnas,
          filas: datos.map((fila) =>
            Object.fromEntries(
              columnas.map((columna, columnIndex) => [
                columna,
                fila[columnIndex] ?? '',
              ]),
            ),
          ),
          fuente: {
            tipo: 'ODT',
            raw: { sourceOffset: match.index ?? 0 },
          },
        } satisfies TablaDocumentoExtraida;
      })
      .filter((tabla) => tabla !== null);
  }

  private tablasXmlGenericas(xml: string): TablaDocumentoExtraida[] {
    const tablas = [...xml.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)];
    return tablas
      .map((match, index) => {
        const filasConTipo = [...(match[1] ?? '').matchAll(
          /<(?:row|tr)\b[^>]*>([\s\S]*?)<\/(?:row|tr)>/gi,
        )]
          .map((fila) =>
            [...(fila[1] ?? '').matchAll(
              /<(cell|td|th)\b[^>]*>([\s\S]*?)<\/(?:cell|td|th)>/gi,
            )].map((celda) => ({
              valor: this.decodificarEntidades((celda[2] ?? '').replace(/<[^>]+>/g, ' '))
                .replace(/\s+/g, ' ')
                .trim(),
              header: String(celda[1]).toLowerCase() === 'th',
            })),
          )
          .filter((fila) => fila.some((celda) => celda.valor));
        if (filasConTipo.length === 0) return null;
        const usaCabecera = filasConTipo[0].some((celda) => celda.header);
        const filas = filasConTipo.map((fila) => fila.map((celda) => celda.valor));
        const ancho = Math.max(...filas.map((fila) => fila.length));
        const columnas = columnasTablaUnicas(
          Array.from({ length: ancho }, (_, columnIndex) =>
            usaCabecera && filas[0]?.[columnIndex]
              ? filas[0][columnIndex]
              : `Columna ${columnIndex + 1}`,
          ),
        );
        const datos = usaCabecera ? filas.slice(1) : filas;
        return {
          tempId: crearTempId('xml_tabla'),
          orden: (match.index ?? 0) + 1,
          nombre: `Tabla ${index + 1}`,
          columnas,
          filas: datos.map((fila) =>
            Object.fromEntries(
              columnas.map((columna, columnIndex) => [
                columna,
                fila[columnIndex] ?? '',
              ]),
            ),
          ),
          fuente: {
            tipo: 'XML',
            raw: { sourceOffset: match.index ?? 0 },
          },
        } satisfies TablaDocumentoExtraida;
      })
      .filter((tabla) => tabla !== null);
  }

  private textoPlanoABloques(texto: string): BloqueTextoIntermedio[] {
    const bloques: BloqueTextoIntermedio[] = [];
    let separacionPendiente = 0;
    for (const raw of limpiarTextoImportacion(texto).split('\n')) {
      const linea = raw.replace(/\s+/g, ' ').trim();
      if (!linea) {
        separacionPendiente += 1;
        continue;
      }
      const index = bloques.length;
      const esTitulo = this.esTituloProbable(linea, index);
      bloques.push({
        texto: linea,
        tipo: esTitulo ? 'TITULO' : 'PARRAFO',
        nivel: esTitulo ? Math.min(index + 1, 3) : undefined,
        separacionAntes: bloques.length === 0 ? 0 : separacionPendiente,
        raw: { fallbackTextoPlano: true },
      });
      separacionPendiente = 0;
    }
    return bloques;
  }

  private aBloqueCanonico(
    bloque: BloqueTextoIntermedio,
    tipo: TipoArchivoDetectado,
    index: number,
  ): BloqueDocumentoExtraido {
    return {
      tempId: crearTempId(`${tipo.toLowerCase()}_${bloque.nivel ? 'heading' : 'linea'}`),
      tipo: bloque.tipo ?? (bloque.nivel ? 'TITULO' : 'PARRAFO'),
      texto: limpiarTextoImportacion(bloque.texto).replace(/\s+/g, ' ').trim(),
      orden:
        Number.isFinite(Number(bloque.raw?.sourceOrder)) &&
        Number(bloque.raw?.sourceOrder) > 0
          ? Number(bloque.raw?.sourceOrder)
          : index + 1,
      nivel: bloque.nivel,
      hoja: bloque.hoja,
      estilo: bloque.estilo,
      fuente: {
        tipo,
        raw: {
          ...(bloque.raw ?? {}),
          headingLevel: bloque.nivel,
          separacionAntes: Math.max(0, Number(bloque.separacionAntes ?? 0)),
        },
      },
    };
  }

  private htmlATexto(html: string): string {
    return this.decodificarEntidades(html)
      .replace(/<script[\s\S]*?<\/script>/gi, '\n')
      .replace(/<style[\s\S]*?<\/style>/gi, '\n')
      .replace(/<\/(?:h[1-6]|p|div|li|tr|section|article|br)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+\n/g, '\n');
  }

  private xmlATexto(xml: string): string {
    return this.decodificarEntidades(xml)
      .replace(/<\?xml[\s\S]*?\?>/gi, '\n')
      .replace(
        /<\/(?:titulo|title|descripcion|description|bloque|section|subsection|leccion|lesson|modulo|module|pregunta|opcion|p|text:p|text:h)>/gi,
        '\n',
      )
      .replace(/<[^>]+>/g, ' ');
  }

  private rtfATexto(rtf: string): string {
    rtf = this.eliminarDestinosRtfNoContenido(rtf);
    let uc = 1;
    const pilaUc: number[] = [];
    let salida = '';
    let indice = 0;

    while (indice < rtf.length) {
      const resto = rtf.slice(indice);

      if (rtf[indice] === '{') {
        pilaUc.push(uc);
        salida += '{';
        indice += 1;
        continue;
      }

      if (rtf[indice] === '}') {
        uc = pilaUc.pop() ?? uc;
        salida += '}';
        indice += 1;
        continue;
      }

      if (rtf[indice] !== '\\') {
        salida += rtf[indice];
        indice += 1;
        continue;
      }

      const controlUc = resto.match(/^\\uc(\d+) ?/i);
      if (controlUc) {
        uc = Math.max(0, Number(controlUc[1]) || 0);
        // Conserva un delimitador: eliminar \\ucN de `\\ansi\\uc1 Texto`
        // sin él convertiría accidentalmente el control anterior en `\\ansiTexto`.
        if (salida && !/\s$/.test(salida)) salida += ' ';
        indice += controlUc[0].length;
        continue;
      }

      const unicode = resto.match(/^\\u(-?\d+) ?/i);
      if (unicode) {
        const raw = Number(unicode[1]);
        const codeUnit = raw < 0 ? raw + 65_536 : raw;
        if (Number.isFinite(codeUnit)) salida += String.fromCharCode(codeUnit);
        indice += unicode[0].length;
        indice = this.saltarFallbackUnicodeRtf(rtf, indice, uc);
        continue;
      }

      const hex = resto.match(/^\\'[0-9a-fA-F]{2}/);
      if (hex) {
        salida += hex[0];
        indice += hex[0].length;
        continue;
      }

      const escapadoLiteral = resto.match(/^\\([{}\\])/);
      if (escapadoLiteral) {
        salida +=
          escapadoLiteral[1] === '{'
            ? '\uE000'
            : escapadoLiteral[1] === '}'
              ? '\uE001'
              : '\uE002';
        indice += escapadoLiteral[0].length;
        continue;
      }

      salida += rtf[indice];
      indice += 1;
    }

    return salida
      .replace(/\\'[0-9a-fA-F]{2}/g, (match) =>
        this.decodificarByteRtf(parseInt(match.slice(2), 16)),
      )
      .replace(/\\(?:line|par)\b ?/gi, '\n')
      .replace(/\\tab\b ?/gi, '\t')
      .replace(/\\~/g, '\u00A0')
      .replace(/\\_/g, '\u2011')
      .replace(/\\-/g, '\u00AD')
      .replace(/\{\\\*[\s\S]*?\}/g, '')
      .replace(/[{}]/g, '')
      .replace(/\\[a-zA-Z]+-?\d* ?/g, '')
      .replace(/\\./g, '')
      .replace(/\uE000/g, '{')
      .replace(/\uE001/g, '}')
      .replace(/\uE002/g, '\\');
  }

  private eliminarDestinosRtfNoContenido(rtf: string) {
    const destinoNoContenido = /^(?:\\\*\\(?:generator|themedata|colorschememapping|datastore|xmlnstbl|listtable|listoverridetable)|\\(?:fonttbl|colortbl|stylesheet|info|pict|object|filetbl|revtbl|rsidtbl|listtable|listoverridetable))(?=[\\\s{};])/i;
    let salida = '';
    let indice = 0;

    while (indice < rtf.length) {
      if (rtf[indice] !== '{') {
        salida += rtf[indice];
        indice += 1;
        continue;
      }

      const cierre = this.finGrupoRtf(rtf, indice);
      if (cierre == null) {
        salida += rtf[indice];
        indice += 1;
        continue;
      }

      const cabecera = rtf
        .slice(indice + 1, Math.min(cierre, indice + 160))
        .trimStart();
      if (destinoNoContenido.test(cabecera)) {
        indice = cierre + 1;
        continue;
      }

      // Se conserva el grupo y se sigue recorriendo carácter a carácter para
      // poder eliminar destinos de metadatos anidados sin tocar texto visible.
      salida += rtf[indice];
      indice += 1;
    }

    return salida;
  }

  private finGrupoRtf(rtf: string, inicio: number) {
    let profundidad = 0;
    let indice = inicio;

    while (indice < rtf.length) {
      if (rtf[indice] === '\\') {
        const binario = rtf.slice(indice).match(/^\\bin(\d+) ?/i);
        if (binario) {
          indice += binario[0].length + Math.max(0, Number(binario[1]) || 0);
          continue;
        }
        if (/[{}\\]/.test(rtf[indice + 1] ?? '')) {
          indice += 2;
          continue;
        }
        indice += 1;
        continue;
      }

      if (rtf[indice] === '{') profundidad += 1;
      if (rtf[indice] === '}') {
        profundidad -= 1;
        if (profundidad === 0) return indice;
      }
      indice += 1;
    }

    return undefined;
  }

  private saltarFallbackUnicodeRtf(rtf: string, inicio: number, uc: number) {
    let indice = inicio;
    let restantes = uc;

    while (restantes > 0 && indice < rtf.length) {
      const resto = rtf.slice(indice);
      const hex = resto.match(/^\\'[0-9a-fA-F]{2}/);
      if (hex) {
        indice += hex[0].length;
        restantes -= 1;
        continue;
      }

      const controlSimbolo = resto.match(/^\\[^a-zA-Z]/);
      if (controlSimbolo) {
        indice += controlSimbolo[0].length;
        restantes -= 1;
        continue;
      }

      if (resto[0] === '{' || resto[0] === '}' || resto[0] === '\r' || resto[0] === '\n') {
        break;
      }

      indice += 1;
      restantes -= 1;
    }

    return indice;
  }

  private decodificarByteRtf(byte: number) {
    const windows1252: Record<number, string> = {
      0x80: '€',
      0x82: '‚',
      0x83: 'ƒ',
      0x84: '„',
      0x85: '…',
      0x86: '†',
      0x87: '‡',
      0x88: 'ˆ',
      0x89: '‰',
      0x8a: 'Š',
      0x8b: '‹',
      0x8c: 'Œ',
      0x8e: 'Ž',
      0x91: '‘',
      0x92: '’',
      0x93: '“',
      0x94: '”',
      0x95: '•',
      0x96: '–',
      0x97: '—',
      0x98: '˜',
      0x99: '™',
      0x9a: 'š',
      0x9b: '›',
      0x9c: 'œ',
      0x9e: 'ž',
      0x9f: 'Ÿ',
    };
    return windows1252[byte] ?? String.fromCharCode(byte);
  }

  private spanHtml(attrs: string, atributo: 'colspan' | 'rowspan') {
    const match = attrs.match(new RegExp(`\\b${atributo}\\s*=\\s*["']?(\\d+)`, 'i'));
    const valor = Number(match?.[1]);
    return Number.isInteger(valor) && valor > 1 ? valor : undefined;
  }

  private textoHtml(html: string) {
    const conReferencias = html
      .replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_match, attrs, contenido) => {
        const href = this.atributosXml(`<a ${attrs}>`).href?.trim();
        const etiqueta = this.decodificarEntidades(String(contenido).replace(/<[^>]+>/g, ' '))
          .replace(/\s+/g, ' ')
          .trim();
        return href ? `${etiqueta || 'Enlace'} (${href})` : etiqueta;
      })
      .replace(/<img\b([^>]*)\/?\s*>/gi, (_match, attrs) => {
        const props = this.atributosXml(`<img ${attrs}>`);
        const alt = props.alt?.trim() || 'Imagen';
        return props.src ? `${alt} [imagen: ${props.src}]` : alt;
      });
    return this.decodificarEntidades(
      conReferencias
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' '),
    )
      .replace(/\s+/g, ' ')
      .trim();
  }

  private limpiarTex(value: string) {
    return this.decodificarEntidades(value)
      .replace(/\\text(?:bf|it|tt|emph)\{([^{}]+)\}/g, '$1')
      .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?(?:\{([^{}]*)\})?/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private limpiarYaml(value: string) {
    return value
      .replace(/^["']|["'],?$/g, '')
      .replace(/\\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private nivelTex(comando: string) {
    return (
      {
        part: 1,
        chapter: 1,
        section: 2,
        subsection: 3,
        subsubsection: 4,
        paragraph: 5,
        subparagraph: 6,
      }[comando] ?? 3
    );
  }

  private nivelXmlTag(tag: string, attrs: string) {
    const heading = tag.match(/^h([1-6])$/)?.[1];
    if (heading) return Number(heading);
    const explicit = attrs.match(/(?:level|nivel|outline-level)=["'](\d+)["']/i)?.[1];
    if (explicit) return Number(explicit);
    if (/^(?:modulo|module|unidad|unit)$/.test(tag)) return 1;
    if (/^(?:leccion|lesson|chapter)$/.test(tag)) return 2;
    if (tag === 'section') return 3;
    if (tag === 'subsection') return 4;
    if (/^(?:titulo|title)$/.test(tag)) return 1;
    return undefined;
  }

  private seleccionarEntradasLecturaEpub(
    entradas: Array<{ nombre: string; buffer: Buffer }>,
  ) {
    const porNombre = new Map(
      entradas.map((entrada) => [this.normalizarRutaEpub(entrada.nombre), entrada]),
    );
    const opf = entradas.find((entrada) => /\.opf$/i.test(entrada.nombre));

    if (opf) {
      const base = path.posix.dirname(this.normalizarRutaEpub(opf.nombre));
      const opfTexto = opf.buffer.toString('utf8');
      const manifest = new Map<
        string,
        { href: string; properties: string; mediaType: string }
      >();

      for (const item of opfTexto.matchAll(/<item\b[^>]*>/gi)) {
        const attrs = this.atributosXml(item[0]);
        if (!attrs.id || !attrs.href) continue;
        manifest.set(attrs.id, {
          href: attrs.href,
          properties: attrs.properties ?? '',
          mediaType: attrs['media-type'] ?? '',
        });
      }

      const seleccionadas: Array<{ nombre: string; buffer: Buffer }> = [];
      for (const itemref of opfTexto.matchAll(/<itemref\b[^>]*>/gi)) {
        const idref = this.atributosXml(itemref[0]).idref;
        if (!idref) continue;
        const item = manifest.get(idref);
        if (!item || !this.esDocumentoLecturaEpub(item.href, item.properties)) {
          continue;
        }
        if (
          item.mediaType &&
          !/(?:xhtml|html|xml)$/i.test(item.mediaType)
        ) {
          continue;
        }
        const ruta = this.normalizarRutaEpub(path.posix.join(base, item.href));
        const entrada = porNombre.get(ruta);
        if (entrada && !seleccionadas.includes(entrada)) seleccionadas.push(entrada);
      }

      if (seleccionadas.length > 0) return seleccionadas;
    }

    return entradas
      .filter(
        (entrada) =>
          /\.(?:xhtml|html|htm)$/i.test(entrada.nombre) &&
          this.esDocumentoLecturaEpub(entrada.nombre, ''),
      )
      .sort((a, b) =>
        a.nombre.localeCompare(b.nombre, 'es', {
          numeric: true,
          sensitivity: 'base',
        }),
      );
  }

  private esDocumentoLecturaEpub(href: string, properties: string) {
    const ruta = this.normalizarRutaEpub(href).toLowerCase();
    if (/\bnav\b/i.test(properties)) return false;
    return !/(^|\/)(?:nav|toc|landmarks|cover|title_page)\.(?:xhtml|html|htm)$/i.test(
      ruta,
    );
  }

  private atributosXml(tag: string) {
    return Object.fromEntries(
      [...tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map(
        ([, nombre, valor]) => [
          nombre.toLowerCase(),
          this.decodificarEntidades(valor),
        ],
      ),
    );
  }

  private normalizarRutaEpub(ruta: string) {
    return path.posix
      .normalize(ruta.replace(/\\/g, '/').split('#')[0] ?? '')
      .replace(/^\/+/, '');
  }

  private esTituloProbable(linea: string, index: number) {
    return index < 12 && linea.length <= 120 && !/[.;]$/.test(linea);
  }

  private fidelidadLimitada(tipo: TipoArchivoDetectado) {
    return ['RTF', 'TEX', 'XML', 'YAML'].includes(tipo);
  }

  private caracteristicasNoConvertidas(tipo: TipoArchivoDetectado): string[] {
    switch (tipo) {
      case 'RTF':
        return ['objetos OLE', 'maquetación RTF avanzada', 'estilos RTF no interpretados'];
      case 'TEX':
        return ['macros TeX', 'fórmulas como render matemático exacto', 'referencias y bibliografía ejecutables'];
      case 'XML':
        return ['semántica de vocabularios XML no reconocidos', 'XSLT ejecutable'];
      case 'YAML':
        return ['anchors y aliases', 'tipos YAML específicos', 'semántica de esquemas no reconocidos'];
      default:
        return [];
    }
  }

  private estrategia(
    tipo: TipoArchivoDetectado,
  ): EstrategiaExtraccionDocumento {
    if (tipo === 'HTML') return 'HTML_TEXTO';
    if (tipo === 'RTF') return 'RTF_TEXTO';
    if (tipo === 'TEX') return 'TEX_TEXTO';
    if (tipo === 'XML') return 'XML_TEXTO';
    if (tipo === 'YAML') return 'YAML_TEXTO';
    if (tipo === 'ODT') return 'ODT_XML';
    if (tipo === 'EPUB') return 'EPUB_XHTML';
    return 'TXT_LINEAS';
  }

  private nombreFormato(tipo: TipoArchivoDetectado) {
    return tipo || 'texto';
  }

  private decodificarEntidades(value: string): string {
    return value
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
        String.fromCharCode(parseInt(code, 16)),
      );
  }
}
