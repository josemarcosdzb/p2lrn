export type TipoNodoMultimodal =
  | 'TITULO'
  | 'PARRAFO'
  | 'LISTA'
  | 'TABLA'
  | 'IMAGEN'
  | 'GRAFICO'
  | 'FORMULA'
  | 'PREGUNTA'
  | 'SOLUCION';

export interface BoundingBoxMultimodal {
  x: number;
  y: number;
  width: number;
  height: number;
  sistemaCoordenadas: 'TOP_LEFT' | 'BOTTOM_LEFT' | 'DESCONOCIDO';
  anchoLienzo?: number;
  altoLienzo?: number;
}

export interface NodoDocumentoMultimodalV2 {
  id: string;
  tipo: TipoNodoMultimodal;
  orden: number;
  texto?: string;
  pagina?: number;
  diapositiva?: number;
  hoja?: string;
  bbox?: BoundingBoxMultimodal;
  confianza?: number;
  procedencia: {
    motor: 'DOCLING' | 'PDFJS' | 'NATIVO' | 'OCR';
    referencia?: string;
    /**
     * Ruta estable del documento hijo cuando el nodo procede de un contenedor.
     * No debe depender de `raw`: forma parte de la identidad semántica del nodo.
     */
    archivoInterno?: string;
    raw?: Record<string, unknown>;
  };
  datos?: Record<string, unknown>;
}

export interface DocumentoMultimodalCanonicoV2 {
  version: 'p2lrn.source-reader.documento.multimodal.v2';
  nodos: NodoDocumentoMultimodalV2[];
}
