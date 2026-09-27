import {ReaderInputError} from '../reader-error.js';
import JSZip from 'jszip';
import path from 'path';
import { BinaryImageDetectorService } from './binary-image-detector.service.js';
import { RawExtractedImageAsset } from './reader-assets.types.js';


interface ZipImageEntry {
  name: string;
  dir: boolean;
  async(type: 'nodebuffer'): Promise<Buffer>;
}

const MAX_ZIP_ENTRADAS = Number(
  process.env.INGESTION_ASSET_MAX_ZIP_ENTRIES ?? Number.POSITIVE_INFINITY,
);
const MAX_ZIP_ENTRY_BYTES = Number(
  process.env.INGESTION_ASSET_MAX_ZIP_ENTRY_BYTES ?? Number.POSITIVE_INFINITY,
);
const MAX_ZIP_TOTAL_IMAGE_BYTES = Number(
  process.env.INGESTION_ASSET_MAX_TOTAL_IMAGE_BYTES ?? Number.POSITIVE_INFINITY,
);
const MAX_ZIP_NOMBRE_BYTES = Number(
  process.env.INGESTION_ASSET_MAX_ZIP_NAME_BYTES ?? 512,
);

export class ZipEmbeddedImageExtractorService {
  constructor(private readonly imageDetector: BinaryImageDetectorService) {}

  async extractImages(params: {
    buffer: Buffer;
    maxImages: number;
    packageHint?: 'DOCUMENT' | 'SCORM' | 'IMSCC' | 'GENERIC_ZIP';
  }): Promise<RawExtractedImageAsset[]> {
    const zip = await JSZip.loadAsync(params.buffer);
    const entries = (Object.values(zip.files) as ZipImageEntry[]).filter(
      (entry) => !entry.dir && !entry.name.includes('__MACOSX/'),
    );

    if (entries.length > MAX_ZIP_ENTRADAS) {
      throw new ReaderInputError(
        `El documento comprimido supera el límite de ${MAX_ZIP_ENTRADAS} entradas`,
      );
    }

    const images: RawExtractedImageAsset[] = [];
    let totalBytes = 0;

    for (const entry of entries) {
      if (images.length >= params.maxImages) break;
      this.validateInternalPath(entry.name);

      const data = await entry.async('nodebuffer');
      if (data.length > MAX_ZIP_ENTRY_BYTES) {
        throw new ReaderInputError(
          `La entrada interna ${entry.name} supera el límite de ${MAX_ZIP_ENTRY_BYTES} bytes`,
        );
      }

      const detected = this.imageDetector.detect(data);
      if (!detected) continue;

      totalBytes += data.length;
      if (totalBytes > MAX_ZIP_TOTAL_IMAGE_BYTES) {
        throw new ReaderInputError(
          `Las imágenes extraídas superan el límite de ${MAX_ZIP_TOTAL_IMAGE_BYTES} bytes`,
        );
      }

      images.push({
        buffer: data,
        mimeType: detected.mimeType,
        extension: detected.extension,
        originalName: this.nombreImagen(entry.name, detected.extension),
        source: {
          format: this.formatForEntry(entry.name, params.packageHint),
          path: entry.name,
          slide: this.slideFromPath(entry.name),
        },
      });
    }

    return images;
  }

  private validateInternalPath(nombre: string) {
    if (!nombre || Buffer.byteLength(nombre, 'utf8') > MAX_ZIP_NOMBRE_BYTES) {
      throw new ReaderInputError('El documento contiene una ruta interna inválida.');
    }

    const normalizada = nombre.replace(/\\/g, '/');
    if (
      normalizada.includes('\0') ||
      normalizada.startsWith('/') ||
      /^[a-zA-Z]:/.test(normalizada) ||
      normalizada.split('/').some((segmento) => segmento === '..')
    ) {
      throw new ReaderInputError('El documento contiene rutas internas no permitidas.');
    }
  }

  private nombreImagen(nombre: string, extension: string) {
    const base = path.basename(nombre).replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '-');
    const ext = extension.startsWith('.') ? extension : `.${extension}`;
    return path.extname(base) ? base : `${base || 'imagen'}${ext}`;
  }

  private formatForEntry(
    entryName: string,
    hint?: 'DOCUMENT' | 'SCORM' | 'IMSCC' | 'GENERIC_ZIP',
  ) {
    if (hint === 'SCORM') return 'SCORM_IMAGE';
    if (hint === 'IMSCC') return 'IMSCC_IMAGE';
    if (hint === 'GENERIC_ZIP') return 'ZIP_IMAGE';
    if (entryName.startsWith('word/')) return 'DOCX_IMAGE';
    if (entryName.startsWith('ppt/')) return 'PPTX_IMAGE';
    if (entryName.startsWith('xl/')) return 'XLSX_IMAGE';
    return 'ZIP_IMAGE';
  }

  private slideFromPath(entryName: string) {
    const match = entryName.match(/ppt\/slides\/slide(\d+)\.xml/i);
    return match ? Number(match[1]) : undefined;
  }
}
