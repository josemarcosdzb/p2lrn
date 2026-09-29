import {readFile as fsReadFile} from 'node:fs/promises';
import path from 'node:path';
import {FileTypeDetector} from './detector.js';
import {readPdf} from './pdf-extractor.js';
import {readDocx, readPptx, readXlsx} from './office-extractors.js';
import {readCsv, readJson, readMarkdown, readStructured, readTxt} from './text-extractors.js';
import {readChamilo, readGenericZip, readH5p, readMoodle, readOpenEdx, readStandardPackage} from './package-extractors.js';
import {DocumentReaderError, type CanonicalDocument, type DocumentInput, type FileDetection, type ReaderOptions} from './types.js';

export class P2LRNDocumentReader {
  readonly options: ReaderOptions;
  readonly detector: FileTypeDetector;

  constructor(options: ReaderOptions = {}) {
    this.options = options;
    this.detector = new FileTypeDetector();
  }

  detect(file: DocumentInput): FileDetection {
    return this.detector.detect(file);
  }

  async read(file: DocumentInput): Promise<CanonicalDocument> {
    const detection = this.detect(file);

    switch (detection.type) {
      case 'PDF':
        if (this.options.pdf === false) {
          throw new DocumentReaderError('PDF support is disabled for this Reader instance.', 'P2LRN_READER_PDF_DISABLED');
        }
        return readPdf(file, detection);
      case 'DOCX':
        return readDocx(file, detection, this.options);
      case 'PPTX':
        return readPptx(file, detection, this.options);
      case 'XLSX':
        return readXlsx(file, detection, this.options);
      case 'TXT':
        return readTxt(file, detection);
      case 'MARKDOWN':
        return readMarkdown(file, detection);
      case 'CSV':
        return readCsv(file, detection);
      case 'JSON':
        return readJson(file, detection);
      case 'HTML':
      case 'RTF':
      case 'TEX':
      case 'XML':
      case 'YAML':
      case 'ODT':
      case 'EPUB':
        return readStructured(file, detection, this.options);
      case 'SCORM':
      case 'IMSCC':
      case 'CMI5':
      case 'XAPI_PACKAGE':
        return readStandardPackage(file, detection, this.options);
      case 'H5P':
        return readH5p(file, detection, this.options);
      case 'MOODLE_BACKUP':
        return readMoodle(file, detection, this.options);
      case 'CHAMILO_COURSE_ZIP':
        return readChamilo(file, detection, this.options);
      case 'OPEN_EDX_OLX':
        return readOpenEdx(file, detection, this.options);
      case 'ZIP':
        return readGenericZip(file, detection, this.options);
      default:
        throw new DocumentReaderError(`Unsupported detected type: ${detection.type}`, 'P2LRN_READER_UNSUPPORTED');
    }
  }

  async readPath(filePath: string, mimeType = ''): Promise<CanonicalDocument> {
    const buffer = await fsReadFile(filePath);
    return this.read({
      name: path.basename(filePath),
      mimeType,
      buffer,
    });
  }
}
