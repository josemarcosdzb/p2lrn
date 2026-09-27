import path from 'path';

export interface DetectedImageType {
  mimeType: string;
  extension: string;
}

export class BinaryImageDetectorService {
  detect(buffer: Buffer): DetectedImageType | null {
    if (!buffer || buffer.length < 4) return null;

    if (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    ) {
      return { mimeType: 'image/jpeg', extension: '.jpg' };
    }

    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return { mimeType: 'image/png', extension: '.png' };
    }

    if (
      buffer[0] === 0x47 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x38
    ) {
      return { mimeType: 'image/gif', extension: '.gif' };
    }

    if (
      buffer.length >= 12 &&
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return { mimeType: 'image/webp', extension: '.webp' };
    }

    if (buffer[0] === 0x42 && buffer[1] === 0x4d) {
      return { mimeType: 'image/bmp', extension: '.bmp' };
    }

    if (
      (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) ||
      (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a)
    ) {
      return { mimeType: 'image/tiff', extension: '.tiff' };
    }

    return null;
  }

  extensionFromMime(mimeType: string): string {
    switch (mimeType) {
      case 'image/jpeg':
        return '.jpg';
      case 'image/png':
        return '.png';
      case 'image/webp':
        return '.webp';
      case 'image/gif':
        return '.gif';
      case 'image/bmp':
        return '.bmp';
      case 'image/tiff':
        return '.tiff';
      default:
        return path.extname(mimeType).toLowerCase() || '.bin';
    }
  }

  isSupportedImageMime(mimeType: string): boolean {
    return [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/bmp',
      'image/tiff',
    ].includes(mimeType);
  }
}
