export type OrigenNodoDocumento = 'NATIVO' | 'OCR' | 'INFERIDO' | 'USUARIO';

export interface SpanFuenteDocumento {
  documentoId: string;
  bloqueOrigenId?: string;
  archivoInterno?: string;
  pagina?: number;
  diapositiva?: number;
  hoja?: string;
  charInicio?: number;
  charFin?: number;
  bbox?: {
    x: number;
    y: number;
    ancho: number;
    alto: number;
  };
}

export interface TrazabilidadNodoDocumento {
  version: 'p2lrn.source-reader.document.trace.v1';
  documentoId: string;
  nodoId: string;
  origen: OrigenNodoDocumento;
  hashContenido: string;
  ordenFuente: number;
  spans: SpanFuenteDocumento[];
}

export interface InventarioTrazabilidadDocumento {
  version: 'p2lrn.source-reader.document.inventory.v1';
  documentoId: string;
  hashDocumento: string;
  totalBloques: number;
  totalTablas: number;
  totalCaracteres: number;
  nodos: Array<{
    nodoId: string;
    bloqueOrigenId: string;
    hashContenido: string;
    charInicio: number;
    charFin: number;
    pagina?: number;
    diapositiva?: number;
    hoja?: string;
    archivoInterno?: string;
  }>;
  tablas: Array<{
    tablaId: string;
    hashContenido: string;
    pagina?: number;
    hoja?: string;
  }>;
}
