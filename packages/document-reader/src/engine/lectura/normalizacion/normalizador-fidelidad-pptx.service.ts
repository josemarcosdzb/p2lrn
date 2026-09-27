import type { ArchivoImportacionSubido } from '../../types/archivo-importacion-subido.type.js';
import { leerEntradasZipBuffer } from '../extractores/utils/lector-zip-buffer.util.js';
import type { BloqueDocumentoExtraido } from '../types/bloque-documento-extraido.type.js';
import type { DocumentoExtraidoCanonico } from '../types/documento-extraido-canonico.type.js';

interface TextoSlide {
  texto: string;
  enTabla: boolean;
  ordenFuente: number;
}

interface AnalisisSlide {
  slide: number;
  textos: TextoSlide[];
  titulos: Set<string>;
  ordenesTabla: number[];
  ordenImagenPorRelacion: Map<string, number>;
}

export class NormalizadorFidelidadPptxService {
  async normalizar(
    documento: DocumentoExtraidoCanonico,
    archivo: ArchivoImportacionSubido,
  ): Promise<DocumentoExtraidoCanonico> {
    if (documento.origen.tipoArchivoDetectado !== 'PPTX') return documento;

    const entradas = await leerEntradasZipBuffer(archivo.buffer);
    const caracteristicasNoConvertidas =
      this.caracteristicasNoConvertidas(entradas);
    const slides = [...entradas.entries()]
      .filter(([nombre]) => /^ppt\/slides\/slide\d+\.xml$/i.test(nombre))
      .map(([nombre, buffer]) => ({
        slide: Number(nombre.match(/slide(\d+)\.xml/i)?.[1] ?? 0),
        xml: buffer.toString('utf8'),
      }))
      .filter((item) => item.slide > 0)
      .sort((a, b) => a.slide - b.slide);

    const analisis = new Map<number, AnalisisSlide>(
      slides.map((item) => [item.slide, this.analizarSlide(item.slide, item.xml)]),
    );
    const eliminar = new Set<string>();
    const ordenBloque = new Map<string, number>();
    let coincidenciasIncompletas = 0;

    for (const item of slides) {
      const info = analisis.get(item.slide)!;
      const bloques = documento.bloques.filter(
        (bloque) => this.slideBloque(bloque) === item.slide,
      );
      const textosUsados = new Set<number>();
      const offsets = new Map<number, number>();

      for (const bloque of bloques) {
        const rawBloque = this.registro(bloque.fuente?.raw);
        if (rawBloque.tituloSuperficieSintetico === true) {
          ordenBloque.set(
            bloque.tempId,
            this.ordenGlobal(
              item.slide,
              0,
              this.siguienteOffset(offsets, 0),
            ),
          );
          continue;
        }

        if (bloque.tipo === 'IMAGEN_REFERENCIADA') {
          const relacion = this.relationshipIdBloque(bloque);
          const orden = relacion
            ? info.ordenImagenPorRelacion.get(relacion)
            : undefined;
          if (orden != null) {
            ordenBloque.set(
              bloque.tempId,
              this.ordenGlobal(item.slide, orden, this.siguienteOffset(offsets, orden)),
            );
          }
          continue;
        }

        const clave = this.normalizarTexto(bloque.texto);
        let encontrado = -1;
        for (let index = 0; index < info.textos.length; index += 1) {
          if (
            !textosUsados.has(index) &&
            this.normalizarTexto(info.textos[index].texto) === clave
          ) {
            encontrado = index;
            break;
          }
        }
        if (encontrado < 0) {
          const existeOcurrenciaFisica = Boolean(
            clave &&
              info.textos.some(
                (texto) => this.normalizarTexto(texto.texto) === clave,
              ),
          );
          if (existeOcurrenciaFisica) {
            // INVARIANTE PPTX: si ya consumimos todas las formas XML con este
            // texto, cualquier copia adicional procede de otra capa del
            // extractor. No puede convertirse en una lección/bloque visible
            // adicional ni desplazarse al final de la presentación.
            eliminar.add(bloque.tempId);
            continue;
          }
          coincidenciasIncompletas += 1;
          continue;
        }
        const texto = info.textos[encontrado];
        if (texto.enTabla) {
          eliminar.add(bloque.tempId);
        } else {
          ordenBloque.set(
            bloque.tempId,
            this.ordenGlobal(
              item.slide,
              texto.ordenFuente,
              this.siguienteOffset(offsets, texto.ordenFuente),
            ),
          );
        }
        textosUsados.add(encontrado);
      }
    }

    let fallback = slides.length * 1_000_000 + 900_000;
    const fallbackPorSlide = new Map<number, number>();
    const bloques = documento.bloques
      .filter((bloque) => !eliminar.has(bloque.tempId))
      .map((bloque) => this.marcarTituloPlaceholder(bloque, analisis))
      .map((bloque) => {
        const orden = ordenBloque.get(bloque.tempId);
        if (orden != null) return { ...bloque, orden };

        const slide = this.slideBloque(bloque);
        if (slide) {
          // Un fragmento no emparejado sigue perteneciendo físicamente a su
          // diapositiva. Mantenerlo en ese rango evita el drift que convertía
          // contenido de la slide 1 en una falsa última lección tras la 31.
          const offset = (fallbackPorSlide.get(slide) ?? 0) + 1;
          fallbackPorSlide.set(slide, offset);
          return {
            ...bloque,
            orden: this.ordenGlobal(slide, 999, offset),
          };
        }

        fallback += 1;
        return { ...bloque, orden: fallback };
      });

    const contadorTabla = new Map<number, number>();
    const tablas = documento.tablas.map((tabla) => {
      const slide = this.slideTabla(tabla.hoja);
      if (!slide) return tabla;
      const indice = contadorTabla.get(slide) ?? 0;
      contadorTabla.set(slide, indice + 1);
      const ordenFuente = analisis.get(slide)?.ordenesTabla[indice];
      return ordenFuente == null
        ? tabla
        : { ...tabla, orden: this.ordenGlobal(slide, ordenFuente, 0) };
    });

    const cambioTitulo = bloques.some((bloque) => {
      const original = documento.bloques.find(
        (item) => item.tempId === bloque.tempId,
      );
      return original?.tipo !== bloque.tipo || original?.nivel !== bloque.nivel;
    });
    const cambioOrden = bloques.some((bloque) => {
      const original = documento.bloques.find(
        (item) => item.tempId === bloque.tempId,
      );
      return original?.orden !== bloque.orden;
    }) || tablas.some((tabla, index) => tabla.orden !== documento.tablas[index]?.orden);

    if (
      eliminar.size === 0 &&
      coincidenciasIncompletas === 0 &&
      !cambioTitulo &&
      !cambioOrden &&
      caracteristicasNoConvertidas.length === 0
    ) {
      return documento;
    }

    return {
      ...documento,
      bloques,
      tablas,
      raw: {
        ...this.registro(documento.raw),
        fidelidadPptx: {
          version: 'PPTX_SHAPE_ORDER_V2',
          fragmentosTablaEliminados: eliminar.size,
          coincidenciasIncompletas,
          ordenFuenteIntercalado: true,
          caracteristicasNoConvertidas,
          diapositivasConTituloNativo: [...analisis.values()]
            .filter((item) => item.titulos.size > 0)
            .map((item) => item.slide),
        },
      },
      advertencias: [
        ...documento.advertencias,
        ...(eliminar.size > 0
          ? [
              {
                ruta: 'pptx.tablas.duplicacion',
                mensaje: `${eliminar.size} fragmento(s) de celdas se retiraron de los bloques de texto porque ya están conservados en tablas estructuradas.`,
                nivel: 'INFO' as const,
              },
            ]
          : []),
        ...(cambioOrden
          ? [
              {
                ruta: 'pptx.formas.orden',
                mensaje:
                  'Se restauró el orden relativo de formas de texto, imágenes y tablas según la diapositiva de origen.',
                nivel: 'INFO' as const,
              },
            ]
          : []),
        ...(coincidenciasIncompletas > 0
          ? [
              {
                ruta: 'pptx.formas.coincidencia',
                mensaje: `${coincidenciasIncompletas} fragmento(s) no pudieron vincularse con precisión a su forma XML y requieren revisión de orden.`,
                nivel: 'ADVERTENCIA' as const,
              },
            ]
          : []),
        ...(caracteristicasNoConvertidas.length > 0
          ? [
              {
                ruta: 'pptx.caracteristicas.parciales',
                mensaje: `El PPTX contiene características que no se convierten íntegramente a contenido editable: ${caracteristicasNoConvertidas.join(', ')}.`,
                nivel: 'ADVERTENCIA' as const,
              },
            ]
          : []),
      ],
    };
  }

  private caracteristicasNoConvertidas(entradas: Map<string, Buffer>) {
    const nombres = [...entradas.keys()];
    const caracteristicas: string[] = [];
    if (nombres.some((nombre) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(nombre))) {
      caracteristicas.push('notas del presentador');
    }
    if (nombres.some((nombre) => /^ppt\/charts\/chart\d+\.xml$/i.test(nombre))) {
      caracteristicas.push('gráficos editables');
    }
    if (nombres.some((nombre) => /^ppt\/diagrams\//i.test(nombre))) {
      caracteristicas.push('SmartArt');
    }
    if (nombres.some((nombre) => /^ppt\/comments\//i.test(nombre))) {
      caracteristicas.push('comentarios');
    }
    return caracteristicas;
  }

  private analizarSlide(slide: number, xml: string): AnalisisSlide {
    const inicios = [...xml.matchAll(/<p:(?:sp|graphicFrame|pic|grpSp)\b/gi)]
      .map((match) => match.index ?? 0)
      .sort((a, b) => a - b);
    const ordenParaIndice = (indice: number) =>
      Math.max(1, inicios.filter((inicio) => inicio <= indice).length);
    const tablas = [...xml.matchAll(/<a:tbl\b[\s\S]*?<\/a:tbl>/gi)].map(
      (match) => ({
        inicio: match.index ?? 0,
        fin: (match.index ?? 0) + match[0].length,
        ordenFuente: ordenParaIndice(match.index ?? 0),
      }),
    );
    const textos = [...xml.matchAll(/<a:p\b[\s\S]*?<\/a:p>/gi)]
      .map((match) => {
        const inicio = match.index ?? 0;
        const texto = [...match[0].matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/gi)]
          .map((run) => this.decodificarXml(run[1] ?? ''))
          .filter(Boolean)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        return {
          texto,
          enTabla: tablas.some(
            (tabla) => inicio >= tabla.inicio && inicio <= tabla.fin,
          ),
          ordenFuente: ordenParaIndice(inicio),
        };
      })
      .filter((item) => item.texto && !this.pareceRuidoXmlOffice(item.texto));

    const ordenImagenPorRelacion = new Map<string, number>();
    for (const match of xml.matchAll(
      /<p:pic\b[\s\S]*?<a:blip\b[^>]*(?:r:embed|r:link)="([^"]+)"[\s\S]*?<\/p:pic>/gi,
    )) {
      const relacion = match[1];
      if (relacion && !ordenImagenPorRelacion.has(relacion)) {
        ordenImagenPorRelacion.set(
          relacion,
          ordenParaIndice(match.index ?? 0),
        );
      }
    }

    return {
      slide,
      textos,
      titulos: new Set(
        this.titulosPlaceholder(xml).map((texto) =>
          this.normalizarTexto(texto),
        ),
      ),
      ordenesTabla: tablas.map((tabla) => tabla.ordenFuente),
      ordenImagenPorRelacion,
    };
  }

  private titulosPlaceholder(xml: string) {
    return [...xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/gi)]
      .filter((match) =>
        /<p:ph\b[^>]*type="(?:title|ctrTitle)"/i.test(match[0]),
      )
      .map((match) =>
        [...match[0].matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/gi)]
          .map((texto) => this.decodificarXml(texto[1] ?? ''))
          .filter(Boolean)
          .join(' ')
          .trim(),
      )
      .filter(Boolean);
  }

  private marcarTituloPlaceholder(
    bloque: BloqueDocumentoExtraido,
    analisis: Map<number, AnalisisSlide>,
  ): BloqueDocumentoExtraido {
    if (bloque.tipo === 'IMAGEN_REFERENCIADA') return bloque;
    const slide = this.slideBloque(bloque);
    const titulos = slide ? analisis.get(slide)?.titulos : undefined;
    if (!titulos?.has(this.normalizarTexto(bloque.texto))) return bloque;
    return {
      ...bloque,
      tipo: 'TITULO',
      nivel: 2,
      fuente: {
        tipo: bloque.fuente?.tipo ?? 'PPTX',
        raw: {
          ...(bloque.fuente?.raw ?? {}),
          placeholderTituloNativo: true,
        },
      },
    };
  }

  private relationshipIdBloque(bloque: BloqueDocumentoExtraido) {
    const raw = bloque.fuente?.raw as
      | {
          relationshipId?: unknown;
          placement?: { relationshipId?: unknown };
        }
      | undefined;
    const value = raw?.relationshipId ?? raw?.placement?.relationshipId;
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private slideBloque(bloque: BloqueDocumentoExtraido) {
    const raw = bloque.fuente?.raw as { slide?: unknown } | undefined;
    const numero = Number(raw?.slide);
    if (Number.isInteger(numero) && numero > 0) return numero;
    return this.slideTabla(bloque.hoja);
  }

  private slideTabla(hoja?: string) {
    const value = String(hoja ?? '').match(/diapositiva\s+(\d+)/i)?.[1];
    return value ? Number(value) : undefined;
  }

  private siguienteOffset(offsets: Map<number, number>, orden: number) {
    const next = (offsets.get(orden) ?? 0) + 1;
    offsets.set(orden, next);
    return next;
  }

  private ordenGlobal(slide: number, ordenFuente: number, offset: number) {
    return slide * 1_000_000 + ordenFuente * 1_000 + offset;
  }

  private decodificarXml(valor: string) {
    return valor
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  private pareceRuidoXmlOffice(texto: string) {
    return (
      /<\/?(?:a|p|r|w|wp|v):/i.test(texto) ||
      /(?:effectLst|outerShdw|spPr|bodyPr|txBody|lnSpc|spcPts|schemeClr)/i.test(
        texto,
      )
    );
  }

  private normalizarTexto(texto: string) {
    return texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLocaleLowerCase('es-ES');
  }

  private registro(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
