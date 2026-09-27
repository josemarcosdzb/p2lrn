const EMU_PER_PIXEL_96 = 9525;
const EMU_PER_POINT = 12700;
const XLSX_DEFAULT_COLUMN_PX = 64;
const XLSX_DEFAULT_ROW_PX = 20;

export interface DocumentoAssetPlacement {
  path: string;
  relationshipId?: string;
  orden: number;
  hoja?: string;
  pagina?: number;
  paragraphIndex?: number;
  runIndex?: number;
  cell?: string;
  cellFrom?: string;
  cellTo?: string;
  posicion?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
  lienzo?: {
    width: number;
    height: number;
  };
  raw: Record<string, unknown>;
}

interface OfficeRelationship {
  id: string;
  target: string;
  type: string;
}

interface SheetInfo {
  name: string;
  path: string;
  relationshipId: string;
  sheetId?: string;
}

export class DocumentAssetPlacementService {
  resolverPptxImagenesPorSlide(entradas: Map<string, Buffer>) {
    const resultado = new Map<number, DocumentoAssetPlacement[]>();
    const lienzo = this.resolverPptxLienzo(entradas);

    for (const [nombre, buffer] of entradas.entries()) {
      if (!/^ppt\/slides\/slide\d+\.xml$/i.test(nombre)) continue;

      const slide = numeroDesdeNombre(nombre, /slide(\d+)\.xml/i);
      const xml = buffer.toString('utf8');
      const relsPath = nombre.replace('/slides/', '/slides/_rels/') + '.rels';
      const rels = this.parsearRels(
        entradas.get(relsPath)?.toString('utf8') ?? '',
        nombre,
        'ppt',
      );
      const placements = this.extraerImagenesPptxSlide(
        xml,
        rels,
        slide,
        lienzo,
      );

      if (placements.length > 0) {
        resultado.set(slide, placements);
      }
    }

    return resultado;
  }

  resolverPptxLienzo(entradas: Map<string, Buffer>) {
    const xml = entradas.get('ppt/presentation.xml')?.toString('utf8') ?? '';
    const atributos = xml.match(/<p:sldSz\b([^>]*)\/?\s*>/i)?.[1] ?? '';
    const width = this.convertirEmuAPx(numeroAtributo(atributos, 'cx'));
    const height = this.convertirEmuAPx(numeroAtributo(atributos, 'cy'));

    if (!width || !height) return undefined;
    return { width, height };
  }

  resolverDocxImagenes(entradas: Map<string, Buffer>) {
    const documentXml =
      entradas.get('word/document.xml')?.toString('utf8') ?? '';
    const rels = this.parsearRels(
      entradas.get('word/_rels/document.xml.rels')?.toString('utf8') ?? '',
      'word/document.xml',
      'word',
    );

    const paragraphs: string[] =
      documentXml.match(/<w:p[\s\S]*?<\/w:p>/g) ?? [];
    const placements: DocumentoAssetPlacement[] = [];

    paragraphs.forEach((paragraphXml, paragraphIndex) => {
      const runs: string[] =
        paragraphXml.match(/<w:r[\s\S]*?<\/w:r>/g) ?? [paragraphXml];
      runs.forEach((runXml, runIndex) => {
        const referencias = this.extraerReferenciasImagenOffice(runXml);
        for (const referencia of referencias) {
          const path = rels.get(referencia.relationshipId);
          if (!path) continue;
          const dimensiones = this.extraerDimensionesDocx(runXml);
          const posicion = this.extraerPosicionAnchorDocx(runXml);
          const layout = /<wp:inline\b/i.test(runXml)
            ? 'inline'
            : /<wp:anchor\b/i.test(runXml)
              ? 'anchor'
              : 'unknown';

          placements.push({
            path,
            relationshipId: referencia.relationshipId,
            orden: placements.length + 1,
            paragraphIndex,
            runIndex,
            posicion: {
              ...(posicion ?? {}),
              ...(dimensiones ?? {}),
            },
            raw: compactarObjeto({
              formato: 'DOCX',
              layout,
              paragraphIndex,
              runIndex,
              relationshipId: referencia.relationshipId,
              rutaArchivo: path,
              textoParrafo: limpiarTextoXmlOffice(paragraphXml),
              widthEmu: dimensiones?.rawWidthEmu,
              heightEmu: dimensiones?.rawHeightEmu,
              xEmu: posicion?.rawXEmu,
              yEmu: posicion?.rawYEmu,
            }),
          });
        }
      });
    });

    return placements;
  }

  resolverXlsxImagenes(entradas: Map<string, Buffer>) {
    const workbookXml = entradas.get('xl/workbook.xml')?.toString('utf8') ?? '';
    const workbookRels = this.parsearRels(
      entradas.get('xl/_rels/workbook.xml.rels')?.toString('utf8') ?? '',
      'xl/workbook.xml',
      'xl',
    );
    const sheets = this.extraerHojasWorkbook(workbookXml, workbookRels);
    const placements: DocumentoAssetPlacement[] = [];

    for (const sheet of sheets) {
      const sheetXml = entradas.get(sheet.path)?.toString('utf8') ?? '';
      if (!sheetXml) continue;

      const sheetRelsPath = this.relsPathParaEntrada(sheet.path);
      const sheetRels = this.parsearRels(
        entradas.get(sheetRelsPath)?.toString('utf8') ?? '',
        sheet.path,
        'xl',
      );
      const drawingRelationshipIds = [
        ...sheetXml.matchAll(
          /<drawing\b[^>]*(?:r:id|id)="([^"]+)"[^>]*\/?>(?:<\/drawing>)?/gi,
        ),
      ].map((match) => match[1]);

      for (const drawingRid of drawingRelationshipIds) {
        const drawingPath = sheetRels.get(drawingRid);
        if (!drawingPath) continue;
        const drawingXml = entradas.get(drawingPath)?.toString('utf8') ?? '';
        if (!drawingXml) continue;

        const drawingRels = this.parsearRels(
          entradas
            .get(this.relsPathParaEntrada(drawingPath))
            ?.toString('utf8') ?? '',
          drawingPath,
          'xl',
        );
        placements.push(
          ...this.extraerImagenesDrawingXlsx({
            drawingXml,
            drawingPath,
            drawingRelationshipId: drawingRid,
            drawingRels,
            sheet,
            offsetOrden: placements.length,
          }),
        );
      }
    }

    return placements;
  }

  indexarPorRuta<T extends { source: { path?: string } }>(items: T[]) {
    const mapa = new Map<string, T>();
    for (const item of items) {
      const path = item.source.path;
      if (!path) continue;
      mapa.set(this.normalizarRuta(path), item);
    }
    return mapa;
  }

  normalizarRuta(ruta: string) {
    return ruta
      .replace(/^\//, '')
      .replace(/\\/g, '/')
      .replace(/\/\.\//g, '/');
  }

  convertirEmuAPx(valor?: number) {
    if (!Number.isFinite(valor)) return undefined;
    return redondear(Number(valor) / EMU_PER_PIXEL_96, 2);
  }

  convertirEmuAPuntos(valor?: number) {
    if (!Number.isFinite(valor)) return undefined;
    return redondear(Number(valor) / EMU_PER_POINT, 2);
  }

  private extraerImagenesPptxSlide(
    xml: string,
    rels: Map<string, string>,
    slide: number,
    lienzo?: { width: number; height: number },
  ) {
    const bloquesPic = xml.match(/<p:pic[\s\S]*?<\/p:pic>/g) ?? [];
    const candidatos =
      bloquesPic.length > 0
        ? bloquesPic
        : (xml.match(/<a:blip\b[^>]*(?:r:embed|r:link)="[^"]+"[^>]*\/?/g) ??
          []);

    const placements: DocumentoAssetPlacement[] = [];

    candidatos.forEach((fragmento, index) => {
      const relationshipId = this.extraerRelationshipIdImagen(fragmento);
      if (!relationshipId) return;
      const path = rels.get(relationshipId);
      if (!path) return;
      const transform = this.extraerTransformOffice(fragmento);

      placements.push({
        path,
        relationshipId,
        orden: index + 1,
        hoja: `Diapositiva ${slide}`,
        posicion: transform?.posicion,
        lienzo,
        raw: compactarObjeto({
          formato: 'PPTX',
          slide,
          relationshipId,
          rutaArchivo: path,
          xEmu: transform?.xEmu,
          yEmu: transform?.yEmu,
          widthEmu: transform?.widthEmu,
          heightEmu: transform?.heightEmu,
          unidadPosicion: transform ? 'px@96dpi' : undefined,
          lienzo,
        }),
      });
    });

    return placements.sort((a, b) => ordenarPorPosicion(a, b));
  }

  private extraerImagenesDrawingXlsx(params: {
    drawingXml: string;
    drawingPath: string;
    drawingRelationshipId: string;
    drawingRels: Map<string, string>;
    sheet: SheetInfo;
    offsetOrden: number;
  }) {
    const anchors = [
      ...extraerBloquesXml(params.drawingXml, 'xdr:twoCellAnchor'),
      ...extraerBloquesXml(params.drawingXml, 'xdr:oneCellAnchor'),
      ...extraerBloquesXml(params.drawingXml, 'xdr:absoluteAnchor'),
    ];
    const placements: DocumentoAssetPlacement[] = [];

    anchors.forEach((anchorXml, index) => {
      const relationshipId = this.extraerRelationshipIdImagen(anchorXml);
      if (!relationshipId) return;
      const path = params.drawingRels.get(relationshipId);
      if (!path) return;

      const from = this.extraerMarkerXlsx(anchorXml, 'from');
      const to = this.extraerMarkerXlsx(anchorXml, 'to');
      const ext = this.extraerExtXlsx(anchorXml);
      const absolutePos = this.extraerAbsolutePosXlsx(anchorXml);
      const fromPx = from ? this.markerXlsxAPx(from) : undefined;
      const toPx = to ? this.markerXlsxAPx(to) : undefined;
      const cellFrom = from ? celdaDesdeIndices(from.col, from.row) : undefined;
      const cellTo = to ? celdaDesdeIndices(to.col, to.row) : undefined;
      const cell = cellFrom && cellTo ? `${cellFrom}:${cellTo}` : cellFrom;

      placements.push({
        path,
        relationshipId,
        orden: params.offsetOrden + index + 1,
        hoja: params.sheet.name,
        cell,
        cellFrom,
        cellTo,
        posicion: compactarObjeto({
          x: absolutePos?.xPx ?? fromPx?.x,
          y: absolutePos?.yPx ?? fromPx?.y,
          width:
            ext?.widthPx ??
            (fromPx && toPx ? Math.max(0, toPx.x - fromPx.x) : undefined),
          height:
            ext?.heightPx ??
            (fromPx && toPx ? Math.max(0, toPx.y - fromPx.y) : undefined),
        }) as DocumentoAssetPlacement['posicion'],
        raw: compactarObjeto({
          formato: 'XLSX',
          hoja: params.sheet.name,
          sheetPath: params.sheet.path,
          drawingPath: params.drawingPath,
          drawingRelationshipId: params.drawingRelationshipId,
          relationshipId,
          rutaArchivo: path,
          anchorType: this.tipoAnchorXlsx(anchorXml),
          cell,
          cellFrom,
          cellTo,
          from,
          to,
          ext,
          absolutePos,
          unidadPosicion: absolutePos ? 'px@96dpi' : 'grid-cell',
        }),
      });
    });

    return placements.sort((a, b) => ordenarPorPosicion(a, b));
  }

  private parsearRels(xml: string, sourcePath: string, rootFolder: string) {
    const rels = new Map<string, string>();
    if (!xml) return rels;

    for (const match of xml.matchAll(
      /<Relationship\b([^>]*)\/?>(?:<\/Relationship>)?/g,
    )) {
      const attrs = match[1] ?? '';
      const id = leerAtributoXml(attrs, 'Id');
      const target = leerAtributoXml(attrs, 'Target');
      const type = leerAtributoXml(attrs, 'Type') ?? '';
      if (!id || !target) continue;
      const normalizada = this.resolverTargetRelativo(
        sourcePath,
        target,
        rootFolder,
      );
      rels.set(id, normalizada);
      if (
        /image/i.test(type) ||
        /\.(png|jpe?g|gif|webp|bmp|tiff?|emf|wmf)$/i.test(target)
      ) {
        rels.set(id, normalizada);
      }
    }

    return rels;
  }

  private resolverTargetRelativo(
    sourcePath: string,
    target: string,
    rootFolder: string,
  ) {
    const limpio = target.replace(/^\//, '');
    if (target.startsWith('/')) return this.normalizarRuta(limpio);

    if (
      !target.includes('/') &&
      /^(media|worksheets|drawings|slides)\//i.test(target) === false
    ) {
      const base = sourcePath.includes('/_rels/')
        ? sourcePath.replace('/_rels/', '/').replace(/\.rels$/i, '')
        : sourcePath;
      return this.normalizarRuta(joinPosix(dirnamePosix(base), target));
    }

    if (
      /^(media|worksheets|drawings|slides|theme|embeddings)\//i.test(target)
    ) {
      return this.normalizarRuta(`${rootFolder}/${target}`);
    }

    return this.normalizarRuta(joinPosix(dirnamePosix(sourcePath), target));
  }

  private relsPathParaEntrada(path: string) {
    const dir = dirnamePosix(path);
    const base = basenamePosix(path);
    return `${dir}/_rels/${base}.rels`;
  }

  private extraerRelationshipIdImagen(xml: string) {
    return (
      xml.match(/<a:blip\b[^>]*(?:r:embed|r:link)="([^"]+)"/i)?.[1] ??
      xml.match(/<v:imagedata\b[^>]*(?:r:id|o:relid)="([^"]+)"/i)?.[1] ??
      xml.match(/<asvg:svgBlip\b[^>]*(?:r:embed|r:link)="([^"]+)"/i)?.[1]
    );
  }

  private extraerReferenciasImagenOffice(xml: string) {
    const ids = new Set<string>();
    for (const match of xml.matchAll(
      /<a:blip\b[^>]*(?:r:embed|r:link)="([^"]+)"/gi,
    )) {
      ids.add(match[1]);
    }
    for (const match of xml.matchAll(
      /<v:imagedata\b[^>]*(?:r:id|o:relid)="([^"]+)"/gi,
    )) {
      ids.add(match[1]);
    }
    for (const match of xml.matchAll(
      /<asvg:svgBlip\b[^>]*(?:r:embed|r:link)="([^"]+)"/gi,
    )) {
      ids.add(match[1]);
    }
    return [...ids].map((relationshipId) => ({ relationshipId }));
  }

  private extraerTransformOffice(xml: string) {
    const xfrm = xml.match(/<a:xfrm[\s\S]*?<\/a:xfrm>/i)?.[0] ?? xml;
    const off = xfrm.match(/<a:off\b([^>]*)\/>/i)?.[1] ?? '';
    const ext = xfrm.match(/<a:ext\b([^>]*)\/>/i)?.[1] ?? '';
    const xEmu = numeroAtributo(off, 'x');
    const yEmu = numeroAtributo(off, 'y');
    const widthEmu = numeroAtributo(ext, 'cx');
    const heightEmu = numeroAtributo(ext, 'cy');

    if (
      ![xEmu, yEmu, widthEmu, heightEmu].some((valor) => Number.isFinite(valor))
    ) {
      return null;
    }

    return {
      xEmu,
      yEmu,
      widthEmu,
      heightEmu,
      posicion: compactarObjeto({
        x: this.convertirEmuAPx(xEmu),
        y: this.convertirEmuAPx(yEmu),
        width: this.convertirEmuAPx(widthEmu),
        height: this.convertirEmuAPx(heightEmu),
      }),
    };
  }

  private extraerDimensionesDocx(xml: string) {
    const extentAttrs =
      xml.match(/<wp:extent\b([^>]*)\/>/i)?.[1] ??
      xml.match(/<a:ext\b([^>]*)\/>/i)?.[1] ??
      '';
    const rawWidthEmu = numeroAtributo(extentAttrs, 'cx');
    const rawHeightEmu = numeroAtributo(extentAttrs, 'cy');

    if (![rawWidthEmu, rawHeightEmu].some((valor) => Number.isFinite(valor))) {
      return undefined;
    }

    return compactarObjeto({
      width: this.convertirEmuAPx(rawWidthEmu),
      height: this.convertirEmuAPx(rawHeightEmu),
      rawWidthEmu,
      rawHeightEmu,
    });
  }

  private extraerPosicionAnchorDocx(xml: string) {
    const positionH =
      xml.match(/<wp:positionH\b[\s\S]*?<\/wp:positionH>/i)?.[0] ?? '';
    const positionV =
      xml.match(/<wp:positionV\b[\s\S]*?<\/wp:positionV>/i)?.[0] ?? '';
    const rawXEmu = Number(
      positionH.match(/<wp:posOffset>(-?\d+)<\/wp:posOffset>/i)?.[1],
    );
    const rawYEmu = Number(
      positionV.match(/<wp:posOffset>(-?\d+)<\/wp:posOffset>/i)?.[1],
    );

    if (![rawXEmu, rawYEmu].some((valor) => Number.isFinite(valor))) {
      return undefined;
    }

    return compactarObjeto({
      x: this.convertirEmuAPx(rawXEmu),
      y: this.convertirEmuAPx(rawYEmu),
      rawXEmu,
      rawYEmu,
    });
  }

  private extraerHojasWorkbook(
    xml: string,
    rels: Map<string, string>,
  ): SheetInfo[] {
    const sheets: SheetInfo[] = [];
    for (const sheetMatch of xml.matchAll(
      /<sheet\b([^>]*)\/?>(?:<\/sheet>)?/gi,
    )) {
      const attrs = sheetMatch[1] ?? '';
      const relationshipId =
        leerAtributoXml(attrs, 'r:id') ?? leerAtributoXml(attrs, 'id');
      if (!relationshipId) continue;
      const path = rels.get(relationshipId);
      if (!path) continue;
      sheets.push({
        name: decodificarXml(
          leerAtributoXml(attrs, 'name') ??
            basenamePosix(path).replace(/\.xml$/i, ''),
        ),
        path,
        relationshipId,
        sheetId: leerAtributoXml(attrs, 'sheetId'),
      });
    }
    return sheets;
  }

  private extraerMarkerXlsx(xml: string, marker: 'from' | 'to') {
    const markerXml = xml.match(
      new RegExp(`<xdr:${marker}>[\\s\\S]*?<\\/xdr:${marker}>`, 'i'),
    )?.[0];
    if (!markerXml) return undefined;
    const col = Number(markerXml.match(/<xdr:col>(\d+)<\/xdr:col>/i)?.[1]);
    const row = Number(markerXml.match(/<xdr:row>(\d+)<\/xdr:row>/i)?.[1]);
    const colOffEmu = Number(
      markerXml.match(/<xdr:colOff>(-?\d+)<\/xdr:colOff>/i)?.[1] ?? 0,
    );
    const rowOffEmu = Number(
      markerXml.match(/<xdr:rowOff>(-?\d+)<\/xdr:rowOff>/i)?.[1] ?? 0,
    );

    if (!Number.isFinite(col) || !Number.isFinite(row)) return undefined;

    return {
      col,
      row,
      colHuman: col + 1,
      rowHuman: row + 1,
      colOffEmu,
      rowOffEmu,
      colOffPx: this.convertirEmuAPx(colOffEmu),
      rowOffPx: this.convertirEmuAPx(rowOffEmu),
      cell: celdaDesdeIndices(col, row),
    };
  }

  private markerXlsxAPx(marker: {
    col: number;
    row: number;
    colOffPx?: number;
    rowOffPx?: number;
  }) {
    return {
      x: redondear(
        marker.col * XLSX_DEFAULT_COLUMN_PX + (marker.colOffPx ?? 0),
        2,
      ),
      y: redondear(
        marker.row * XLSX_DEFAULT_ROW_PX + (marker.rowOffPx ?? 0),
        2,
      ),
    };
  }

  private extraerExtXlsx(xml: string) {
    const extAttrs = xml.match(/<xdr:ext\b([^>]*)\/>/i)?.[1] ?? '';
    const widthEmu = numeroAtributo(extAttrs, 'cx');
    const heightEmu = numeroAtributo(extAttrs, 'cy');
    if (![widthEmu, heightEmu].some((valor) => Number.isFinite(valor)))
      return undefined;
    return compactarObjeto({
      widthEmu,
      heightEmu,
      widthPx: this.convertirEmuAPx(widthEmu),
      heightPx: this.convertirEmuAPx(heightEmu),
    });
  }

  private extraerAbsolutePosXlsx(xml: string) {
    const posAttrs = xml.match(/<xdr:pos\b([^>]*)\/>/i)?.[1] ?? '';
    const xEmu = numeroAtributo(posAttrs, 'x');
    const yEmu = numeroAtributo(posAttrs, 'y');
    if (![xEmu, yEmu].some((valor) => Number.isFinite(valor))) return undefined;
    return compactarObjeto({
      xEmu,
      yEmu,
      xPx: this.convertirEmuAPx(xEmu),
      yPx: this.convertirEmuAPx(yEmu),
    });
  }

  private tipoAnchorXlsx(xml: string) {
    if (/<xdr:twoCellAnchor\b/i.test(xml)) return 'twoCellAnchor';
    if (/<xdr:oneCellAnchor\b/i.test(xml)) return 'oneCellAnchor';
    if (/<xdr:absoluteAnchor\b/i.test(xml)) return 'absoluteAnchor';
    return 'unknown';
  }
}

function leerAtributoXml(attrs: string, nombre: string) {
  const escaped = nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return attrs.match(new RegExp(`(?:^|\\s)${escaped}="([^"]*)"`, 'i'))?.[1];
}

function numeroAtributo(attrs: string, nombre: string) {
  const valor = leerAtributoXml(attrs, nombre);
  if (valor === undefined) return undefined;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : undefined;
}

function decodificarXml(valor: string) {
  return valor
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

function limpiarTextoXmlOffice(xml: string) {
  return decodificarXml(
    xml
      .replace(/<w:(?:br|cr)[^>]*\/>/g, '\n')
      .replace(/<w:tab[^>]*\/>/g, '\t')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' '),
  );
}

function redondear(valor: number, decimales: number) {
  const factor = 10 ** decimales;
  return Math.round(valor * factor) / factor;
}

function compactarObjeto<T extends Record<string, unknown>>(
  objeto: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(objeto).filter(
      ([, valor]) => valor !== undefined && Number.isNaN(valor) === false,
    ),
  ) as Partial<T>;
}

function ordenarPorPosicion(
  a: DocumentoAssetPlacement,
  b: DocumentoAssetPlacement,
) {
  const ay = a.posicion?.y ?? Number.POSITIVE_INFINITY;
  const by = b.posicion?.y ?? Number.POSITIVE_INFINITY;
  if (Math.abs(ay - by) > 0.01) return ay - by;
  const ax = a.posicion?.x ?? Number.POSITIVE_INFINITY;
  const bx = b.posicion?.x ?? Number.POSITIVE_INFINITY;
  if (Math.abs(ax - bx) > 0.01) return ax - bx;
  return a.orden - b.orden;
}

function joinPosix(...parts: string[]) {
  return parts
    .join('/')
    .replace(/\/\.\//g, '/')
    .replace(/\/[^/]+\/\.\.\//g, '/')
    .replace(/\/+/g, '/');
}

function dirnamePosix(ruta: string) {
  const limpia = ruta.replace(/\\/g, '/');
  const index = limpia.lastIndexOf('/');
  return index >= 0 ? limpia.slice(0, index) : '';
}

function basenamePosix(ruta: string) {
  const limpia = ruta.replace(/\\/g, '/');
  const index = limpia.lastIndexOf('/');
  return index >= 0 ? limpia.slice(index + 1) : limpia;
}

function numeroDesdeNombre(nombre: string, regex: RegExp) {
  return Number(nombre.match(regex)?.[1] ?? 0);
}

function extraerBloquesXml(xml: string, tag: string) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (
    xml.match(new RegExp(`<${escaped}\\b[\\s\\S]*?<\\/${escaped}>`, 'gi')) ?? []
  );
}

function celdaDesdeIndices(colZeroBased: number, rowZeroBased: number) {
  return `${columnaExcel(colZeroBased)}${rowZeroBased + 1}`;
}

function columnaExcel(colZeroBased: number) {
  let numero = colZeroBased + 1;
  let texto = '';
  while (numero > 0) {
    const resto = (numero - 1) % 26;
    texto = String.fromCharCode(65 + resto) + texto;
    numero = Math.floor((numero - 1) / 26);
  }
  return texto;
}
