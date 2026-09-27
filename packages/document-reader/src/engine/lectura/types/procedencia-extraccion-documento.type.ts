export type MotorExtraccionDocumento = 'NATIVE' | 'DOCLING';

export interface PuntuacionCandidatoExtraccionDocumento {
  score: number;
  legibilidad: number;
  coberturaTextoRelativa: number;
  ratioDuplicacion: number;
  bloques: number;
  titulos: number;
  tablas: number;
  imagenes: number;
  posiciones: number;
}

export interface SeleccionExtraccionDocumento {
  version: 'p2lrn.source-reader.extraccion.seleccion.v1';
  motorSeleccionado: MotorExtraccionDocumento;
  motivo: string;
  candidatos: {
    DOCLING: PuntuacionCandidatoExtraccionDocumento;
    NATIVE: PuntuacionCandidatoExtraccionDocumento;
  };
}

export interface EstadisticasReconciliacionDocumento {
  primarios: number;
  secundarios: number;
  anadidosSecundario: number;
  deduplicados: number;
  enriquecidos: number;
}

export interface ReconciliacionExtraccionDocumento {
  version: 'p2lrn.source-reader.extraccion.reconciliacion.v1';
  estrategia: 'PRIMARY_AUTHORITY_PLUS_COMPLEMENTARY_EVIDENCE';
  motorPrimario: MotorExtraccionDocumento;
  motorSecundario: MotorExtraccionDocumento;
  bloques: EstadisticasReconciliacionDocumento & {
    imagenesNoMaterializadasSuprimidas: number;
  };
  tablas: EstadisticasReconciliacionDocumento;
  secuenciaMultimodal: EstadisticasReconciliacionDocumento;
  metadatosCompletados: string[];
  advertenciasAnadidas: number;
  evidenciasEstructurales: Array<Record<string, unknown>>;
  evidenciasNoMaterializadas: Array<Record<string, unknown>>;
}

/**
 * Estado interno mientras se decide o reconcilia el motor de extracción.
 * Puede estar incompleto porque todavía no ha cruzado la frontera del Reader.
 */
export interface ProcedenciaExtraccionEnProceso {
  seleccion?: SeleccionExtraccionDocumento;
  reconciliacion?: ReconciliacionExtraccionDocumento;
}

/**
 * Procedencia estable del único contrato público del Reader.
 * Siempre identifica explícitamente qué motor quedó como autoridad final.
 */
export interface ProcedenciaExtraccionDocumento
  extends ProcedenciaExtraccionEnProceso {
  version: 'p2lrn.source-reader.extraccion.procedencia.v1';
  motorAutoritativo: MotorExtraccionDocumento;
}
