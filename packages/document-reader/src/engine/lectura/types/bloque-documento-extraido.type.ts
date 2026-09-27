import type { TrazabilidadNodoDocumento } from './documento-canonico-v2.type';
import type { TipoArchivoDetectado } from './tipo-archivo-detectado.type';

export type TipoBloqueDocumentoExtraido =
  | 'TITULO'
  | 'SUBTITULO'
  | 'PARRAFO'
  | 'LISTA'
  | 'TABLA'
  | 'IMAGEN_REFERENCIADA'
  | 'SEPARADOR'
  | 'PREGUNTA'
  | 'OPCION'
  | 'SOLUCION'
  | 'METADATO';

export interface BloqueDocumentoExtraido {
  tempId: string;
  tipo: TipoBloqueDocumentoExtraido;
  texto: string;
  orden: number;
  nivel?: number;
  pagina?: number;
  hoja?: string;
  posicion?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
  estilo?: {
    fontSize?: number;
    fontWeight?: string | number;
    fontFamily?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    color?: string;
    backgroundColor?: string;
    align?: string;
  };
  archivoId?: number | null;
  archivo?: {
    id: number;
    url: string;
    nombre: string;
    mimeType: string;
    tamanoBytes: number | null;
  } | null;
  trazabilidad?: TrazabilidadNodoDocumento;
  fuente?: {
    tipo: TipoArchivoDetectado;
    raw?: Record<string, unknown>;
  };
}
