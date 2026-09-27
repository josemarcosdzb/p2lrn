import type { BloqueDocumentoExtraido } from './bloque-documento-extraido.type';
import type { ContenedorDocumentoExtraidoCanonico } from './contenedor-documento-extraido.type';
import type { InventarioTrazabilidadDocumento } from './documento-canonico-v2.type';
import type { DocumentoMultimodalCanonicoV2 } from './documento-multimodal-canonico-v2.type';
import type {
  ProcedenciaExtraccionDocumento,
  ProcedenciaExtraccionEnProceso,
} from './procedencia-extraccion-documento.type';
import type { TablaDocumentoExtraida } from './tabla-documento-extraida.type';
import type {
  EstrategiaExtraccionDocumento,
  TipoArchivoDetectado,
} from './tipo-archivo-detectado.type';

interface DocumentoExtraidoBase {
  origen: {
    nombreArchivo: string;
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
  bloques: BloqueDocumentoExtraido[];
  tablas: TablaDocumentoExtraida[];
  contenedor?: ContenedorDocumentoExtraidoCanonico;
  raw?: unknown;
  advertencias: Array<{
    ruta: string;
    mensaje: string;
    nivel?: 'INFO' | 'ADVERTENCIA' | 'ERROR';
  }>;
}

/**
 * Estado exclusivamente interno mientras los extractores y reconciliadores
 * construyen el documento. Nunca debe salir del Reader ni ser consumido como
 * contrato por conversión, P2LRN u otros módulos.
 */
export interface DocumentoExtraidoEnProceso extends DocumentoExtraidoBase {
  version: 'p2lrn.source-reader.documento.extraido.v1' | 'p2lrn.source-reader.documento.extraido.v2';
  secuenciaMultimodal?: DocumentoMultimodalCanonicoV2;
  procedenciaExtraccion?: ProcedenciaExtraccionEnProceso;
  trazabilidadDocumento?: InventarioTrazabilidadDocumento;
}

/**
 * Único contrato canónico que cruza la frontera pública del Reader.
 * Secuencia multimodal, procedencia y trazabilidad estable son obligatorias;
 * cualquier estado antiguo se normaliza antes de salir del lector.
 */
export interface DocumentoExtraidoFinalCanonico extends DocumentoExtraidoBase {
  version: 'p2lrn.source-reader.documento.extraido.v2';
  secuenciaMultimodal: DocumentoMultimodalCanonicoV2;
  procedenciaExtraccion: ProcedenciaExtraccionDocumento;
  trazabilidadDocumento: InventarioTrazabilidadDocumento;
}

/**
 * @deprecated Sólo para código interno de extracción todavía migrándose a
 * DocumentoExtraidoEnProceso. No representa el contrato público del Reader.
 */
export type DocumentoExtraidoCanonico = DocumentoExtraidoEnProceso;
