import {Buffer} from 'node:buffer';
import {
  CANONICAL_DOCUMENT_SCHEMA,CANONICAL_DOCUMENT_VERSION,DOCUMENT_INVENTORY_SCHEMA,DOCUMENT_PROVENANCE_SCHEMA,DOCUMENT_TRACE_SCHEMA,
  type BoundingBox,type CanonicalBlock,type CanonicalDocument,type CanonicalNode,type CanonicalTable,type DocumentReadResult,type ExtractionStrategy,type SourceDocumentFormat,type SourceDocumentInput
} from './types.js';
import type {DocumentReadContext} from './contracts.js';
import {DetectorTipoArchivoService} from './engine/deteccion-archivo/detector-tipo-archivo.service.js';
import {ExtractorTxtService} from './engine/lectura/extractores/extractor-txt.service.js';
import {ExtractorMarkdownService} from './engine/lectura/extractores/extractor-markdown.service.js';
import {ExtractorCsvService} from './engine/lectura/extractores/extractor-csv.service.js';
import {ExtractorJsonService} from './engine/lectura/extractores/extractor-json.service.js';
import {ExtractorTextoEstructuradoService} from './engine/lectura/extractores/extractor-texto-estructurado.service.js';
import {TrazadorDocumentoCanonicoService} from './engine/lectura/trazador-documento-canonico.service.js';
import type {ArchivoImportacionSubido} from './engine/types/archivo-importacion-subido.type.js';
import type {DocumentoExtraidoFinalCanonico} from './engine/lectura/types/documento-extraido-canonico.type.js';
import type {TipoArchivoDetectado,EstrategiaExtraccionDocumento} from './engine/lectura/types/tipo-archivo-detectado.type.js';

const COPIED_FORMATS=new Set<TipoArchivoDetectado>(['TXT','MARKDOWN','HTML','RTF','TEX','XML','YAML','ODT','EPUB','CSV','JSON']);

function sourceFile(input:SourceDocumentInput):ArchivoImportacionSubido{
  const buffer=Buffer.from(input.bytes.buffer,input.bytes.byteOffset,input.bytes.byteLength);
  return{originalname:input.name,mimetype:input.mediaType??'application/octet-stream',size:buffer.byteLength,buffer};
}
function format(value:TipoArchivoDetectado):SourceDocumentFormat{return value==='DESCONOCIDO'?'UNKNOWN':value as SourceDocumentFormat;}
const STRATEGY:Record<EstrategiaExtraccionDocumento,ExtractionStrategy>={
  PDF_TEXTO:'PDF_TEXT',PDF_OCR:'PDF_OCR',DOCX_XML:'DOCX_XML',PPTX_SLIDES_XML:'PPTX_SLIDES_XML',
  TXT_LINEAS:'TXT_LINES',MARKDOWN_LINEAS:'MARKDOWN',HTML_TEXTO:'HTML',RTF_TEXTO:'RTF',TEX_TEXTO:'TEX',XML_TEXTO:'XML',YAML_TEXTO:'YAML',
  CSV_TABLA:'CSV_TABLE',EXCEL_TABLA:'XLSX_WORKBOOK',XLSX_WORKBOOK_V3:'XLSX_WORKBOOK',ODT_XML:'ODT_XML',EPUB_XHTML:'EPUB_XHTML',JSON_CANONICO:'JSON',
  ZIP_CONTENEDOR:'ZIP_CONTAINER',SCORM_MANIFEST:'SCORM_MANIFEST',IMSCC_MANIFEST:'IMSCC_MANIFEST',CMI5_PACKAGE:'CMI5_PACKAGE',
  XAPI_TINCAN_PACKAGE:'XAPI_PACKAGE',H5P_PACKAGE:'H5P_PACKAGE',MOODLE_MBZ_MANIFEST:'MOODLE_BACKUP',CHAMILO_COURSE_ZIP_MANIFEST:'CHAMILO_COURSE_ZIP',
  OPEN_EDX_OLX_MANIFEST:'OPEN_EDX_OLX',DOCLING_JSON:'DOCLING'
};
function bbox(position:{x?:number;y?:number;width?:number;height?:number}|undefined):BoundingBox|undefined{
  if(!position)return undefined;
  return{x:position.x,y:position.y,width:position.width,height:position.height,coordinateSystem:'UNKNOWN'};
}
function blockType(value:string):CanonicalBlock['type']{
  switch(value){
    case'TITULO':return'TITLE';case'SUBTITULO':return'SUBTITLE';case'PARRAFO':return'PARAGRAPH';case'LISTA':return'LIST';
    case'TABLA':return'TABLE';case'IMAGEN_REFERENCIADA':return'IMAGE';case'SEPARADOR':return'SEPARATOR';case'PREGUNTA':return'QUESTION';
    case'OPCION':return'OPTION';case'SOLUCION':return'SOLUTION';default:return'METADATA';
  }
}
function nodeType(value:string):CanonicalNode['type']{
  switch(value){case'TITULO':return'TITLE';case'PARRAFO':return'PARAGRAPH';case'LISTA':return'LIST';case'TABLA':return'TABLE';case'IMAGEN':return'IMAGE';case'GRAFICO':return'CHART';case'FORMULA':return'FORMULA';case'PREGUNTA':return'QUESTION';case'SOLUCION':return'SOLUTION';default:return'PARAGRAPH';}
}
function engine(value:string):CanonicalNode['provenance']['engine']{return value==='NATIVO'?'NATIVE':value as CanonicalNode['provenance']['engine'];}
function traceOrigin(value:string){return value==='NATIVO'?'NATIVE':value==='INFERIDO'?'INFERRED':value as 'NATIVE'|'OCR'|'INFERRED'|'USER';}
function score(value:any){return{score:value.score,readability:value.legibilidad,textCoverage:value.coberturaTextoRelativa,duplicateRatio:value.ratioDuplicacion,blocks:value.bloques,titles:value.titulos,tables:value.tablas,images:value.imagenes,positioned:value.posiciones};}

function toPublic(document:DocumentoExtraidoFinalCanonico,input:SourceDocumentInput):CanonicalDocument{
  const blocks:CanonicalBlock[]=document.bloques.map(item=>{
    const raw=item.fuente?.raw??{};
    const slide=Number((raw as any).slide);
    const t=item.trazabilidad;
    const trace=t?{
      schema:DOCUMENT_TRACE_SCHEMA,documentId:t.documentoId,nodeId:t.nodoId,origin:traceOrigin(t.origen),contentHash:t.hashContenido,sourceOrder:t.ordenFuente,
      spans:t.spans.map(span=>({documentId:span.documentoId,sourceBlockId:span.bloqueOrigenId,internalFile:span.archivoInterno,page:span.pagina,slide:span.diapositiva,sheet:span.hoja,charStart:span.charInicio,charEnd:span.charFin,bbox:span.bbox?{x:span.bbox.x,y:span.bbox.y,width:span.bbox.ancho,height:span.bbox.alto,coordinateSystem:'UNKNOWN' as const}:undefined}))
    }:undefined;
    return{
      id:item.tempId,type:blockType(item.tipo),text:item.texto,order:item.orden,level:item.nivel,page:item.pagina,slide:Number.isInteger(slide)&&slide>0?slide:undefined,sheet:item.hoja,
      bbox:bbox(item.posicion),style:item.estilo,
      asset:item.archivo?{id:String(item.archivo.id),name:item.archivo.nombre,mediaType:item.archivo.mimeType,size:item.archivo.tamanoBytes??undefined,sourcePath:item.archivo.url,page:item.pagina,slide:Number.isInteger(slide)&&slide>0?slide:undefined}:undefined,
      trace,source:{format:format(item.fuente?.tipo??document.origen.tipoArchivoDetectado),raw:Object.keys(raw).length?raw:undefined}
    };
  });
  const tables:CanonicalTable[]=document.tablas.map(item=>({
    id:item.tempId,order:item.orden,page:item.pagina,sheet:item.hoja,name:item.nombre,columns:item.columnas,rows:item.filas,
    cells:item.celdas?{headers:item.celdas.headers.map(row=>row.map(cell=>({text:cell.texto,colspan:cell.colspan,rowspan:cell.rowspan,header:cell.esHeader,source:cell.fuente?{format:format(cell.fuente.tipo),raw:cell.fuente.raw}:undefined}))),rows:item.celdas.rows.map(row=>row.map(cell=>({text:cell.texto,colspan:cell.colspan,rowspan:cell.rowspan,header:cell.esHeader,source:cell.fuente?{format:format(cell.fuente.tipo),raw:cell.fuente.raw}:undefined})))}:undefined,
    bbox:bbox(item.posicion),source:item.fuente?{format:format(item.fuente.tipo),raw:item.fuente.raw}:undefined
  }));
  const sequence:CanonicalNode[]=document.secuenciaMultimodal.nodos.map(item=>({
    id:item.id,type:nodeType(item.tipo),order:item.orden,text:item.texto,page:item.pagina,slide:item.diapositiva,sheet:item.hoja,
    bbox:item.bbox?{x:item.bbox.x,y:item.bbox.y,width:item.bbox.width,height:item.bbox.height,coordinateSystem:item.bbox.sistemaCoordenadas==='TOP_LEFT'?'TOP_LEFT':item.bbox.sistemaCoordenadas==='BOTTOM_LEFT'?'BOTTOM_LEFT':'UNKNOWN',canvasWidth:item.bbox.anchoLienzo,canvasHeight:item.bbox.altoLienzo}:undefined,
    confidence:item.confianza,provenance:{engine:engine(item.procedencia.motor),reference:item.procedencia.referencia,internalFile:item.procedencia.archivoInterno,raw:item.procedencia.raw},data:item.datos
  }));
  const selection=document.procedenciaExtraccion.seleccion;
  const reconciliation=document.procedenciaExtraccion.reconciliacion;
  const inventory=document.trazabilidadDocumento;
  return{
    schema:CANONICAL_DOCUMENT_SCHEMA,version:CANONICAL_DOCUMENT_VERSION,
    source:{name:document.origen.nombreArchivo,extension:document.origen.extensionOriginal,mediaType:document.origen.mimeOriginal,format:format(document.origen.tipoArchivoDetectado),strategy:STRATEGY[document.origen.estrategiaExtraccion]},
    metadata:{title:document.metadatos.tituloDetectado,author:document.metadatos.autor,pages:document.metadatos.paginas,sheets:document.metadatos.hojas,language:document.metadatos.idiomaDetectado},
    blocks,tables,sequence:{nodes:sequence},
    provenance:{schema:DOCUMENT_PROVENANCE_SCHEMA,authoritativeEngine:document.procedenciaExtraccion.motorAutoritativo,selection:selection?{engine:selection.motorSeleccionado,reason:selection.motivo,candidates:{NATIVE:score(selection.candidatos.NATIVE),DOCLING:score(selection.candidatos.DOCLING)}}:undefined,reconciliation:reconciliation?{strategy:reconciliation.estrategia,primary:reconciliation.motorPrimario,secondary:reconciliation.motorSecundario,statistics:{blocks:reconciliation.bloques,tables:reconciliation.tablas,sequence:reconciliation.secuenciaMultimodal,metadataCompleted:reconciliation.metadatosCompletados,warningsAdded:reconciliation.advertenciasAnadidas},structuralEvidence:reconciliation.evidenciasEstructurales,unmaterializedEvidence:reconciliation.evidenciasNoMaterializadas}:undefined},
    inventory:{schema:DOCUMENT_INVENTORY_SCHEMA,documentId:inventory.documentoId,documentHash:inventory.hashDocumento,totalBlocks:inventory.totalBloques,totalTables:inventory.totalTablas,totalCharacters:inventory.totalCaracteres,nodes:inventory.nodos.map(n=>({nodeId:n.nodoId,sourceBlockId:n.bloqueOrigenId,contentHash:n.hashContenido,charStart:n.charInicio,charEnd:n.charFin,page:n.pagina,slide:n.diapositiva,sheet:n.hoja,internalFile:n.archivoInterno})),tables:inventory.tablas.map(t=>({tableId:t.tablaId,contentHash:t.hashContenido,page:t.pagina,sheet:t.hoja}))},
    warnings:document.advertencias.map(w=>({path:w.ruta,message:w.mensaje,level:w.nivel==='ADVERTENCIA'?'WARNING':w.nivel})),
    container:document.contenedor as unknown as Record<string,unknown>|undefined,raw:document.raw
  };
}

export class CopiedCanonicalSourceReader{
  readonly detector=new DetectorTipoArchivoService();
  readonly tracer=new TrazadorDocumentoCanonicoService();
  readonly txt=new ExtractorTxtService();
  readonly markdown=new ExtractorMarkdownService();
  readonly csv=new ExtractorCsvService();
  readonly json=new ExtractorJsonService();
  readonly structured=new ExtractorTextoEstructuradoService();

  detect(input:SourceDocumentInput){
    const detected=this.detector.detectar(sourceFile(input));
    return detected;
  }
  supports(input:SourceDocumentInput){return COPIED_FORMATS.has(this.detect(input).tipo);}
  async read(input:SourceDocumentInput,_context:DocumentReadContext={}):Promise<DocumentReadResult>{
    const archivo=sourceFile(input),deteccion=this.detector.detectar(archivo);
    let extracted;
    switch(deteccion.tipo){
      case'TXT':extracted=await this.txt.extraer({archivo,deteccion});break;
      case'MARKDOWN':extracted=await this.markdown.extraer({archivo,deteccion});break;
      case'CSV':extracted=await this.csv.extraer({archivo,deteccion});break;
      case'JSON':extracted=await this.json.extraer({archivo,deteccion});break;
      case'HTML':case'RTF':case'TEX':case'XML':case'YAML':case'ODT':case'EPUB':
        extracted=await this.structured.extraer({archivo,deteccion});break;
      default:throw new Error(`Copied canonical source Reader is not ported yet for ${deteccion.tipo}.`);
    }
    return{document:toPublic(this.tracer.trazar(extracted),input),assets:[]};
  }
}
