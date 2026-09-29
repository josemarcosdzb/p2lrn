import path from 'node:path';
import type {DocumentFileType, DocumentInput, FileDetection} from './types.js';
import {DocumentReaderError} from './types.js';

export class FileTypeDetector {
  detect(file: DocumentInput): FileDetection {
    if (!file?.buffer?.length) throw new DocumentReaderError('No readable file was provided.', 'P2LRN_READER_EMPTY');
    const fileName = String(file.name || 'file');
    const lowerName = fileName.toLowerCase();
    const extension = path.extname(fileName).replace('.', '').toLowerCase();
    const mimeType = String(file.mimeType ?? '').toLowerCase();
    const buffer = file.buffer;
    const header = buffer.subarray(0, 16).toString('hex').toLowerCase();
    const initial = buffer.subarray(0, 500).toString('utf8').trim();

    if (buffer.subarray(0, 5).toString('utf8') === '%PDF-') {
      return this.result('PDF', extension, mimeType, fileName, .99, 'PDF binary signature.');
    }

    const zip = header.startsWith('504b0304') || header.startsWith('504b0506') || header.startsWith('504b0708');
    if (zip) {
      if (extension === 'docx') return this.result('DOCX', extension, mimeType, fileName, .97, 'Office Open XML DOCX.');
      if (extension === 'xlsx') return this.result('XLSX', extension, mimeType, fileName, .97, 'Office Open XML XLSX.');
      if (extension === 'pptx') return this.result('PPTX', extension, mimeType, fileName, .97, 'Office Open XML PPTX.');
      if (extension === 'odt') return this.result('ODT', extension, mimeType, fileName, .97, 'OpenDocument Text.');
      if (extension === 'epub') return this.result('EPUB', extension, mimeType, fileName, .97, 'EPUB archive.');
      if (extension === 'imscc') return this.result('IMSCC', extension, mimeType, fileName, .98, 'IMS Common Cartridge extension.');
      if (extension === 'scorm') return this.result('SCORM', extension, mimeType, fileName, .98, 'SCORM package extension.');
      if (extension === 'cmi5') return this.result('CMI5', extension, mimeType, fileName, .98, 'cmi5 package extension.');
      if (extension === 'xapi' || extension === 'tincan') return this.result('XAPI_PACKAGE', extension, mimeType, fileName, .98, 'Tin Can/xAPI package extension.');
      if (extension === 'mbz') return this.result('MOODLE_BACKUP', extension, mimeType, fileName, .96, 'Moodle backup extension.');
      if (extension === 'h5p' || this.contains(buffer, 'h5p.json')) return this.result('H5P', extension, mimeType, fileName, .97, 'H5P package with h5p.json.');
      if (this.contains(buffer, 'cmi5.xml')) return this.result('CMI5', extension, mimeType, fileName, .94, 'ZIP contains cmi5.xml.');
      if (this.contains(buffer, 'tincan.xml')) return this.result('XAPI_PACKAGE', extension, mimeType, fileName, .94, 'ZIP contains tincan.xml.');
      if (this.containsOpenEdx(buffer)) return this.result('OPEN_EDX_OLX', extension, mimeType, fileName, .93, 'Open edX OLX structure.');
      if (this.containsChamilo(buffer)) return this.result('CHAMILO_COURSE_ZIP', extension, mimeType, fileName, .91, 'Chamilo course structure.');
      if (this.contains(buffer, 'imsmanifest.xml')) {
        const cc = this.looksLikeCommonCartridge(buffer);
        return this.result(cc ? 'IMSCC' : 'SCORM', extension, mimeType, fileName, .9, cc ? 'IMS Common Cartridge manifest.' : 'IMS/SCORM manifest.');
      }
      return this.result('ZIP', extension, mimeType, fileName, .9, 'ZIP container.');
    }

    if (lowerName.endsWith('.tar.gz') || lowerName.endsWith('.tgz')) {
      return this.result('OPEN_EDX_OLX', lowerName.endsWith('.tgz') ? 'tgz' : 'tar.gz', mimeType, fileName, .86, 'Open edX OLX TAR.GZ/TGZ candidate.');
    }

    if (extension === 'json' || (!extension && (initial.startsWith('{') || initial.startsWith('[')))) return this.result('JSON', extension, mimeType, fileName, .9, 'JSON content.');
    if (extension === 'csv') return this.result('CSV', extension, mimeType, fileName, .88, 'CSV extension.');
    if (extension === 'md' || extension === 'markdown') return this.result('MARKDOWN', extension, mimeType, fileName, .88, 'Markdown extension.');
    if (extension === 'html' || extension === 'htm') return this.result('HTML', extension, mimeType, fileName, .88, 'HTML extension.');
    if (extension === 'rtf') return this.result('RTF', extension, mimeType, fileName, .88, 'RTF extension.');
    if (extension === 'tex') return this.result('TEX', extension, mimeType, fileName, .88, 'TeX extension.');
    if (extension === 'xml') return this.result('XML', extension, mimeType, fileName, .88, 'XML extension.');
    if (extension === 'yaml' || extension === 'yml') return this.result('YAML', extension, mimeType, fileName, .88, 'YAML extension.');
    if (extension === 'txt') return this.result('TXT', extension, mimeType, fileName, .85, 'TXT extension.');

    throw new DocumentReaderError(`Unsupported file type: .${extension || 'no-extension'}`, 'P2LRN_READER_UNSUPPORTED');
  }

  private contains(buffer: Buffer, name: string) {
    const target = this.normalize(name);
    return this.zipNames(buffer).some((entry) =>
      target.endsWith('/') ? entry.startsWith(target) || entry.includes('/' + target) : entry === target || entry.endsWith('/' + target)
    );
  }

  private containsChamilo(buffer: Buffer) {
    const info = this.contains(buffer, 'course_info.dat') || this.contains(buffer, 'course_info.xml') || this.contains(buffer, 'course_info.json');
    const lp = this.contains(buffer, 'learnpath/') || this.contains(buffer, 'lp/');
    const quiz = this.contains(buffer, 'quiz/') || this.contains(buffer, 'exercice/') || this.contains(buffer, 'exercise/');
    const docs = this.contains(buffer, 'document/');
    return info || lp || (docs && quiz);
  }

  private containsOpenEdx(buffer: Buffer) {
    return this.contains(buffer, 'course/course.xml') || this.contains(buffer, 'chapter/') || this.contains(buffer, 'sequential/') || this.contains(buffer, 'vertical/') || this.contains(buffer, 'policies/');
  }

  private looksLikeCommonCartridge(buffer: Buffer) {
    return this.contains(buffer, 'web_resources/') || this.contains(buffer, 'assessment_qti') || this.contains(buffer, 'imsqti') || this.contains(buffer, 'learning-application-resource');
  }

  private zipNames(buffer: Buffer) {
    const central = this.centralNames(buffer);
    return central.length ? central : this.localNames(buffer);
  }

  private centralNames(buffer: Buffer) {
    const eocd = this.findEocd(buffer);
    if (eocd < 0 || eocd + 22 > buffer.length) return [];
    const total = buffer.readUInt16LE(eocd + 10);
    const size = buffer.readUInt32LE(eocd + 12);
    const start = buffer.readUInt32LE(eocd + 16);
    if (total <= 0 || start >= buffer.length || start + size > buffer.length) return [];
    const names = new Set<string>();
    let offset = start;
    for (let i = 0; i < total && offset + 46 <= buffer.length; i += 1) {
      if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
      const nameLength = buffer.readUInt16LE(offset + 28);
      const extraLength = buffer.readUInt16LE(offset + 30);
      const commentLength = buffer.readUInt16LE(offset + 32);
      const from = offset + 46;
      const to = from + nameLength;
      if (nameLength > 0 && to <= buffer.length) {
        const name = this.normalize(buffer.toString('utf8', from, to));
        if (name) names.add(name);
      }
      offset = to + extraLength + commentLength;
    }
    return [...names];
  }

  private findEocd(buffer: Buffer) {
    const min = Math.max(0, buffer.length - 22 - 0xffff);
    for (let offset = buffer.length - 22; offset >= min; offset -= 1) {
      if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
    }
    return -1;
  }

  private localNames(buffer: Buffer) {
    const names = new Set<string>();
    let offset = 0;
    while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
      const flags = buffer.readUInt16LE(offset + 6);
      const compressed = buffer.readUInt32LE(offset + 18);
      const nameLength = buffer.readUInt16LE(offset + 26);
      const extraLength = buffer.readUInt16LE(offset + 28);
      const from = offset + 30;
      const to = from + nameLength;
      const dataStart = to + extraLength;
      if (nameLength <= 0 || to > buffer.length || dataStart > buffer.length) break;
      const name = this.normalize(buffer.toString('utf8', from, to));
      if (name) names.add(name);
      if ((flags & 0x08) !== 0 || compressed === 0xffffffff) break;
      offset = dataStart + compressed;
    }
    return [...names];
  }

  private normalize(name: string) {
    return String(name ?? '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/\.\//g, '/').trim().toLowerCase();
  }

  private result(type: DocumentFileType, extension: string, mimeType: string, fileName: string, confidence: number, reason: string): FileDetection {
    return {type, extension, mimeType, fileName, confidence, reason};
  }
}
