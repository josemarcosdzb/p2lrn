import type { TipoArchivoDetectado } from '../../lectura/types/tipo-archivo-detectado.type.js';

export interface ResultadoDeteccionArchivo {
  tipo: TipoArchivoDetectado;
  extension: string;
  mimeType: string;
  nombreArchivo: string;
  confianza: number;
  motivo: string;
}
