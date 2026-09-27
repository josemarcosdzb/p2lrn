import type {
  EstrategiaExtraccionDocumento,
  TipoArchivoDetectado,
} from './tipo-archivo-detectado.type';

export interface DocumentoInternoContenedorCanonico {
  nombreArchivo: string;
  ordenArchivo: number;
  origen: {
    extensionOriginal?: string;
    mimeOriginal?: string;
    tipoArchivoDetectado: TipoArchivoDetectado;
    estrategiaExtraccion: EstrategiaExtraccionDocumento;
  };
  metadatos: {
    tituloDetectado?: string;
    autor?: string;
    paginas?: number;
    hojas?: string[];
    idiomaDetectado?: string;
  };
}

/**
 * Inventario estructural estable de un documento contenedor. No duplica los
 * documentos hijos: su contenido vive una sola vez en bloques, tablas y
 * secuenciaMultimodal del documento canónico agregado.
 */
export interface ContenedorDocumentoExtraidoCanonico {
  version: 'p2lrn.source-reader.documento.contenedor.v1';
  tipo: 'ZIP';
  orden: 'ARCHIVE_ENTRY_ORDER';
  documentos: DocumentoInternoContenedorCanonico[];
}
