import {ReaderInputError} from '../reader-error.js';
import path from 'node:path';
import type { TipoArchivoDetectado } from '../lectura/types/tipo-archivo-detectado.type.js';
import type { ResultadoDeteccionArchivo } from './types/resultado-deteccion-archivo.type.js';
import type { ArchivoImportacionSubido } from '../types/archivo-importacion-subido.type.js';

export class DetectorTipoArchivoService {
  detectar(archivo: ArchivoImportacionSubido): ResultadoDeteccionArchivo {
    if (!archivo?.buffer?.length) {
      throw new ReaderInputError('No se recibió ningún archivo legible.');
    }

    const nombreArchivo = String(archivo.originalname ?? 'archivo');
    const nombreLower = nombreArchivo.toLowerCase();
    const extension = path
      .extname(nombreArchivo)
      .replace('.', '')
      .toLowerCase();
    const mimeType = String(archivo.mimetype ?? '').toLowerCase();
    const buffer = archivo.buffer;
    const cabecera = buffer.subarray(0, 16).toString('hex').toLowerCase();
    const textoInicial = buffer.subarray(0, 500).toString('utf8').trim();

    if (buffer.subarray(0, 5).toString('utf8') === '%PDF-') {
      return this.resultado(
        'PDF',
        extension,
        mimeType,
        nombreArchivo,
        0.99,
        'Firma binaria PDF.',
      );
    }

    if (extension === 'mbz' && cabecera.startsWith('1f8b')) {
      return this.resultado(
        'MOODLE_BACKUP',
        extension,
        mimeType,
        nombreArchivo,
        0.98,
        'Backup Moodle .mbz comprimido como TAR.GZ.',
      );
    }
    if (
      cabecera.startsWith('504b0304') ||
      cabecera.startsWith('504b0506') ||
      cabecera.startsWith('504b0708')
    ) {
      if (extension === 'docx')
        return this.resultado(
          'DOCX',
          extension,
          mimeType,
          nombreArchivo,
          0.95,
          'ZIP Office Open XML con extensión DOCX.',
        );
      if (extension === 'xlsx')
        return this.resultado(
          'XLSX',
          extension,
          mimeType,
          nombreArchivo,
          0.95,
          'ZIP Office Open XML con extensión XLSX.',
        );
      if (extension === 'pptx')
        return this.resultado(
          'PPTX',
          extension,
          mimeType,
          nombreArchivo,
          0.95,
          'ZIP Office Open XML con extensión PPTX.',
        );
      if (extension === 'odt')
        return this.resultado(
          'ODT',
          extension,
          mimeType,
          nombreArchivo,
          0.95,
          'OpenDocument Text.',
        );
      if (extension === 'epub')
        return this.resultado(
          'EPUB',
          extension,
          mimeType,
          nombreArchivo,
          0.95,
          'EPUB con documentos XHTML internos.',
        );
      if (extension === 'imscc')
        return this.resultado(
          'IMSCC',
          extension,
          mimeType,
          nombreArchivo,
          0.96,
          'Paquete IMS Common Cartridge basado en ZIP.',
        );
      if (extension === 'scorm')
        return this.resultado(
          'SCORM',
          extension,
          mimeType,
          nombreArchivo,
          0.96,
          'Paquete SCORM basado en ZIP.',
        );
      if (extension === 'cmi5')
        return this.resultado(
          'CMI5',
          extension,
          mimeType,
          nombreArchivo,
          0.96,
          'Paquete cmi5 basado en ZIP.',
        );
      if (extension === 'xapi' || extension === 'tincan')
        return this.resultado(
          'XAPI_PACKAGE',
          extension,
          mimeType,
          nombreArchivo,
          0.96,
          'Paquete xAPI/TinCan basado en ZIP.',
        );
      if (extension === 'ims')
        return this.resultado(
          'IMSCC',
          extension,
          mimeType,
          nombreArchivo,
          0.9,
          'Paquete IMS basado en ZIP.',
        );
      if (extension === 'mbz')
        return this.resultado(
          'MOODLE_BACKUP',
          extension,
          mimeType,
          nombreArchivo,
          0.96,
          'Backup Moodle .mbz basado en ZIP.',
        );
      if (extension === 'h5p' || this.contieneH5p(buffer))
        return this.resultado(
          'H5P',
          extension,
          mimeType,
          nombreArchivo,
          0.96,
          'Paquete H5P con h5p.json.',
        );
      if (this.contieneCmi5(buffer))
        return this.resultado(
          'CMI5',
          extension,
          mimeType,
          nombreArchivo,
          0.9,
          'Paquete ZIP con cmi5.xml.',
        );
      if (this.contieneTinCan(buffer))
        return this.resultado(
          'XAPI_PACKAGE',
          extension,
          mimeType,
          nombreArchivo,
          0.9,
          'Paquete ZIP con tincan.xml.',
        );
      if (this.contieneManifestIms(buffer))
        return this.resultado(
          extension === 'zip' && this.pareceCommonCartridge(buffer)
            ? 'IMSCC'
            : 'SCORM',
          extension,
          mimeType,
          nombreArchivo,
          0.88,
          extension === 'zip' && this.pareceCommonCartridge(buffer)
            ? 'ZIP con imsmanifest.xml y estructura IMS Common Cartridge.'
            : 'Paquete ZIP educativo con imsmanifest.xml.',
        );
      if (this.contieneOpenEdxOlxZip(buffer))
        return this.resultado(
          'OPEN_EDX_OLX',
          extension,
          mimeType,
          nombreArchivo,
          0.93,
          'Exportacion Open edX OLX basada en ZIP.',
        );
      if (this.contieneChamiloZip(buffer))
        return this.resultado(
          'CHAMILO_COURSE_ZIP',
          extension,
          mimeType,
          nombreArchivo,
          0.9,
          'Paquete Chamilo ZIP con estructura de curso reconocible.',
        );
      if (extension === 'zip')
        return this.resultado(
          'ZIP',
          extension,
          mimeType,
          nombreArchivo,
          0.95,
          'Archivo ZIP con documentos internos.',
        );
      if (mimeType.includes('zip'))
        return this.resultado(
          'ZIP',
          extension,
          mimeType,
          nombreArchivo,
          0.88,
          'Archivo ZIP detectado por firma o MIME type.',
        );
    }

    if (nombreLower.endsWith('.tar.gz') || nombreLower.endsWith('.tgz')) {
      return this.resultado(
        'OPEN_EDX_OLX',
        nombreLower.endsWith('.tgz') ? 'tgz' : 'tar.gz',
        mimeType,
        nombreArchivo,
        0.86,
        'Paquete Open edX OLX comprimido como TAR.GZ/TGZ; el lector validara la estructura interna.',
      );
    }

    if (
      extension === 'json' ||
      (!extension &&
        (textoInicial.startsWith('{') || textoInicial.startsWith('[')))
    )
      return this.resultado(
        'JSON',
        extension,
        mimeType,
        nombreArchivo,
        0.9,
        'Contenido compatible con JSON.',
      );
    if (extension === 'csv')
      return this.resultado(
        'CSV',
        extension,
        mimeType,
        nombreArchivo,
        0.85,
        'Extensión CSV.',
      );
    if (extension === 'md' || extension === 'markdown')
      return this.resultado(
        'MARKDOWN',
        extension,
        mimeType,
        nombreArchivo,
        0.85,
        'Extensión Markdown.',
      );
    if (extension === 'html' || extension === 'htm')
      return this.resultado(
        'HTML',
        extension,
        mimeType,
        nombreArchivo,
        0.85,
        'Extensión HTML.',
      );
    if (extension === 'rtf')
      return this.resultado(
        'RTF',
        extension,
        mimeType,
        nombreArchivo,
        0.85,
        'Extensión RTF.',
      );
    if (extension === 'tex')
      return this.resultado(
        'TEX',
        extension,
        mimeType,
        nombreArchivo,
        0.85,
        'Extensión TeX/LaTeX.',
      );
    if (extension === 'xml')
      return this.resultado(
        'XML',
        extension,
        mimeType,
        nombreArchivo,
        0.85,
        'Extensión XML.',
      );
    if (extension === 'yaml' || extension === 'yml')
      return this.resultado(
        'YAML',
        extension,
        mimeType,
        nombreArchivo,
        0.85,
        'Extensión YAML.',
      );
    if (extension === 'txt')
      return this.resultado(
        'TXT',
        extension,
        mimeType,
        nombreArchivo,
        0.8,
        'Extensión TXT.',
      );

    throw new ReaderInputError(
      `Tipo de archivo no soportado para importación: .${extension || 'sin-extension'}`,
    );
  }

  private contieneManifestIms(buffer: Buffer): boolean {
    return this.contieneNombreEntradaZip(buffer, 'imsmanifest.xml');
  }

  private contieneCmi5(buffer: Buffer): boolean {
    return this.contieneNombreEntradaZip(buffer, 'cmi5.xml');
  }

  private contieneTinCan(buffer: Buffer): boolean {
    return this.contieneNombreEntradaZip(buffer, 'tincan.xml');
  }

  private contieneH5p(buffer: Buffer): boolean {
    return this.contieneNombreEntradaZip(buffer, 'h5p.json');
  }

  private contieneChamiloZip(buffer: Buffer): boolean {
    const tieneInfoCurso =
      this.contieneNombreEntradaZip(buffer, 'course_info.dat') ||
      this.contieneNombreEntradaZip(buffer, 'course_info.xml') ||
      this.contieneNombreEntradaZip(buffer, 'course_info.json');
    const tieneLearnpath =
      this.contieneNombreEntradaZip(buffer, 'learnpath/') ||
      this.contieneNombreEntradaZip(buffer, 'lp/');
    const tieneEjercicios =
      this.contieneNombreEntradaZip(buffer, 'quiz/') ||
      this.contieneNombreEntradaZip(buffer, 'exercice/') ||
      this.contieneNombreEntradaZip(buffer, 'exercise/');
    const tieneDocumentos = this.contieneNombreEntradaZip(buffer, 'document/');

    return tieneInfoCurso || tieneLearnpath || (tieneDocumentos && tieneEjercicios);
  }

  private contieneOpenEdxOlxZip(buffer: Buffer): boolean {
    return (
      this.contieneNombreEntradaZip(buffer, 'course/course.xml') ||
      this.contieneNombreEntradaZip(buffer, 'chapter/') ||
      this.contieneNombreEntradaZip(buffer, 'sequential/') ||
      this.contieneNombreEntradaZip(buffer, 'vertical/') ||
      this.contieneNombreEntradaZip(buffer, 'policies/')
    );
  }

  private pareceCommonCartridge(buffer: Buffer): boolean {
    return (
      this.contieneNombreEntradaZip(buffer, 'web_resources/') ||
      this.contieneNombreEntradaZip(buffer, 'assessment_qti') ||
      this.contieneNombreEntradaZip(buffer, 'imsqti') ||
      this.contieneNombreEntradaZip(buffer, 'learning-application-resource')
    );
  }

  private contieneNombreEntradaZip(buffer: Buffer, nombre: string): boolean {
    const objetivo = this.normalizarNombreEntradaZip(nombre);
    if (!objetivo) return false;

    return this.listarNombresEntradaZip(buffer).some((entrada) =>
      objetivo.endsWith('/')
        ? entrada.startsWith(objetivo) || entrada.includes(`/${objetivo}`)
        : entrada === objetivo || entrada.endsWith(`/${objetivo}`),
    );
  }

  private listarNombresEntradaZip(buffer: Buffer): string[] {
    const nombresDirectorio = this.leerNombresDirectorioCentralZip(buffer);
    if (nombresDirectorio.length > 0) return nombresDirectorio;
    return this.leerNombresCabecerasLocalesZip(buffer);
  }

  private leerNombresDirectorioCentralZip(buffer: Buffer): string[] {
    const eocdOffset = this.buscarFinDirectorioCentralZip(buffer);
    if (eocdOffset < 0 || eocdOffset + 22 > buffer.length) return [];

    const totalEntradas = buffer.readUInt16LE(eocdOffset + 10);
    const directorioSize = buffer.readUInt32LE(eocdOffset + 12);
    const directorioOffset = buffer.readUInt32LE(eocdOffset + 16);
    if (
      totalEntradas <= 0 ||
      directorioOffset >= buffer.length ||
      directorioOffset + directorioSize > buffer.length
    ) {
      return [];
    }

    const nombres = new Set<string>();
    let offset = directorioOffset;
    for (let index = 0; index < totalEntradas && offset + 46 <= buffer.length; index += 1) {
      if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
      const nombreLength = buffer.readUInt16LE(offset + 28);
      const extraLength = buffer.readUInt16LE(offset + 30);
      const comentarioLength = buffer.readUInt16LE(offset + 32);
      const nombreStart = offset + 46;
      const nombreEnd = nombreStart + nombreLength;
      if (nombreLength > 0 && nombreEnd <= buffer.length) {
        const nombre = this.normalizarNombreEntradaZip(
          buffer.toString('utf8', nombreStart, nombreEnd),
        );
        if (nombre) nombres.add(nombre);
      }
      offset = nombreEnd + extraLength + comentarioLength;
    }
    return [...nombres];
  }

  private buscarFinDirectorioCentralZip(buffer: Buffer): number {
    const minimo = Math.max(0, buffer.length - 22 - 0xffff);
    for (let offset = buffer.length - 22; offset >= minimo; offset -= 1) {
      if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
    }
    return -1;
  }

  private leerNombresCabecerasLocalesZip(buffer: Buffer): string[] {
    const nombres = new Set<string>();
    let offset = 0;
    while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
      const flags = buffer.readUInt16LE(offset + 6);
      const compressedSize = buffer.readUInt32LE(offset + 18);
      const nombreLength = buffer.readUInt16LE(offset + 26);
      const extraLength = buffer.readUInt16LE(offset + 28);
      const nombreStart = offset + 30;
      const nombreEnd = nombreStart + nombreLength;
      const dataStart = nombreEnd + extraLength;
      if (nombreLength <= 0 || nombreEnd > buffer.length || dataStart > buffer.length) break;

      const nombre = this.normalizarNombreEntradaZip(
        buffer.toString('utf8', nombreStart, nombreEnd),
      );
      if (nombre) nombres.add(nombre);

      const usaDescriptorDatos = (flags & 0x08) !== 0;
      if (usaDescriptorDatos || compressedSize === 0xffffffff) break;
      offset = dataStart + compressedSize;
    }
    return [...nombres];
  }

  private normalizarNombreEntradaZip(nombre: string) {
    return nombre
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/\/\.\//g, '/')
      .trim()
      .toLowerCase();
  }

  private resultado(
    tipo: TipoArchivoDetectado,
    extension: string,
    mimeType: string,
    nombreArchivo: string,
    confianza: number,
    motivo: string,
  ): ResultadoDeteccionArchivo {
    return { tipo, extension, mimeType, nombreArchivo, confianza, motivo };
  }
}
