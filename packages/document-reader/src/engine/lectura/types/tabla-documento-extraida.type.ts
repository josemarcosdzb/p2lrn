import type { TipoArchivoDetectado } from './tipo-archivo-detectado.type.js';

export interface CeldaTablaDocumentoExtraida {
  texto: string;
  colspan?: number;
  rowspan?: number;
  esHeader?: boolean;
  fuente?: {
    tipo: TipoArchivoDetectado;
    raw?: Record<string, unknown>;
  };
}

export interface CeldasTablaDocumentoExtraida {
  headers: CeldaTablaDocumentoExtraida[][];
  rows: CeldaTablaDocumentoExtraida[][];
}

export interface TablaDocumentoExtraida {
  tempId: string;
  orden: number;
  pagina?: number;
  hoja?: string;
  nombre?: string;
  columnas: string[];
  filas: Array<Record<string, string>>;
  celdas?: CeldasTablaDocumentoExtraida;
  posicion?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
  fuente?: {
    tipo: TipoArchivoDetectado;
    raw?: Record<string, unknown>;
  };
}
