import { BadRequestException } from '@nestjs/common';
import * as path from 'path';

export interface AllowedFileDescriptor {
  extension: 'pdf' | 'jpg' | 'jpeg' | 'png' | 'docx' | 'xlsx' | 'csv';
  canonicalMimeType: string;
  acceptedDeclaredMimes: string[];
}

const ALLOWED_EXTENSION_MAP: Record<string, AllowedFileDescriptor> = {
  pdf: {
    extension: 'pdf',
    canonicalMimeType: 'application/pdf',
    acceptedDeclaredMimes: ['application/pdf'],
  },
  jpg: {
    extension: 'jpg',
    canonicalMimeType: 'image/jpeg',
    acceptedDeclaredMimes: ['image/jpeg', 'image/pjpeg'],
  },
  jpeg: {
    extension: 'jpeg',
    canonicalMimeType: 'image/jpeg',
    acceptedDeclaredMimes: ['image/jpeg', 'image/pjpeg'],
  },
  png: {
    extension: 'png',
    canonicalMimeType: 'image/png',
    acceptedDeclaredMimes: ['image/png'],
  },
  docx: {
    extension: 'docx',
    canonicalMimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    acceptedDeclaredMimes: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/zip',
      'application/octet-stream',
    ],
  },
  xlsx: {
    extension: 'xlsx',
    canonicalMimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    acceptedDeclaredMimes: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/zip',
      'application/octet-stream',
    ],
  },
  csv: {
    extension: 'csv',
    canonicalMimeType: 'text/csv',
    acceptedDeclaredMimes: [
      'text/csv',
      'application/csv',
      'application/vnd.ms-excel',
      'text/plain',
    ],
  },
};

const DANGEROUS_EXTENSIONS = new Set([
  'exe',
  'bat',
  'cmd',
  'com',
  'pif',
  'scr',
  'vbs',
  'vbe',
  'js',
  'jse',
  'wsf',
  'wsh',
  'ps1',
  'psm1',
  'msi',
  'msp',
  'dll',
  'sys',
  'cpl',
  'hta',
  'jar',
  'sh',
  'bash',
  'zsh',
  'php',
  'py',
  'rb',
  'pl',
  'html',
  'htm',
  'svg',
  'xml',
  'lnk',
  'iso',
]);

export function sanitizeFilename(rawName: string): string {
  const baseName = path.posix
    .basename(rawName.replace(/\\/g, '/'))
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim();

  if (!baseName || baseName === '.' || baseName === '..') {
    throw new BadRequestException('Invalid file name');
  }

  const extIndex = baseName.lastIndexOf('.');
  if (extIndex <= 0 || extIndex === baseName.length - 1) {
    throw new BadRequestException('File must include a valid extension');
  }

  const stem = baseName
    .slice(0, extIndex)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 120);
  const ext = baseName.slice(extIndex + 1).toLowerCase();

  return `${stem || 'document'}.${ext}`;
}

export function validateDeclaredUploadFile(params: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  maxFileSizeBytes: number;
  itemAcceptedMimeTypes: string[];
}): {
  sanitizedFilename: string;
  descriptor: AllowedFileDescriptor;
} {
  if (!Number.isFinite(params.sizeBytes) || params.sizeBytes <= 0) {
    throw new BadRequestException('Uploaded file cannot be empty');
  }
  if (params.sizeBytes > params.maxFileSizeBytes) {
    throw new BadRequestException(
      `File exceeds the maximum allowed size of ${Math.round(params.maxFileSizeBytes / (1024 * 1024))} MB`,
    );
  }

  const rawBase = path.posix.basename(params.fileName.replace(/\\/g, '/'));
  const dotParts = rawBase.split('.').map((p) => p.trim().toLowerCase());
  if (dotParts.length < 2) {
    throw new BadRequestException('File extension is required');
  }

  for (const part of dotParts.slice(1)) {
    if (DANGEROUS_EXTENSIONS.has(part)) {
      throw new BadRequestException(
        'Executable, script, and active HTML/SVG files are not permitted',
      );
    }
  }

  const ext = dotParts[dotParts.length - 1]!;
  const descriptor = ALLOWED_EXTENSION_MAP[ext];
  if (!descriptor) {
    throw new BadRequestException(
      'Unsupported file type. Allowed types: PDF, JPG, JPEG, PNG, DOCX, XLSX, CSV',
    );
  }

  const normalizedMime = params.mimeType.split(';')[0]!.trim().toLowerCase();
  if (!descriptor.acceptedDeclaredMimes.includes(normalizedMime)) {
    throw new BadRequestException(
      `Declared MIME type '${normalizedMime}' does not match file extension '.${ext}'`,
    );
  }

  if (
    params.itemAcceptedMimeTypes.length > 0 &&
    !params.itemAcceptedMimeTypes
      .map((m) => m.toLowerCase())
      .includes(descriptor.canonicalMimeType)
  ) {
    throw new BadRequestException(
      `This checklist item does not accept ${descriptor.extension.toUpperCase()} files`,
    );
  }

  return {
    sanitizedFilename: sanitizeFilename(params.fileName),
    descriptor,
  };
}

export function inspectUploadedContentSignature(params: {
  buffer: Buffer;
  expectedExtension: string;
}): { valid: boolean; detectedMimeType: string | null; reason?: string } {
  const { buffer } = params;
  const ext = params.expectedExtension.toLowerCase();

  if (!buffer || buffer.length === 0) {
    return {
      valid: false,
      detectedMimeType: null,
      reason: 'Uploaded object is empty',
    };
  }

  // Block binary executables & scripts immediately regardless of declared extension
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return {
      valid: false,
      detectedMimeType: 'application/x-msdownload',
      reason: 'Executable PE/MZ content is prohibited',
    };
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x7f &&
    buffer[1] === 0x45 &&
    buffer[2] === 0x4c &&
    buffer[3] === 0x46
  ) {
    return {
      valid: false,
      detectedMimeType: 'application/x-elf',
      reason: 'Executable ELF content is prohibited',
    };
  }
  if (buffer.length >= 2 && buffer[0] === 0x23 && buffer[1] === 0x21) {
    return {
      valid: false,
      detectedMimeType: 'text/x-shellscript',
      reason: 'Script content is prohibited',
    };
  }

  const headAscii = buffer
    .subarray(0, Math.min(buffer.length, 512))
    .toString('utf8')
    .trimStart()
    .toLowerCase();

  if (
    headAscii.startsWith('<!doctype html') ||
    headAscii.startsWith('<html') ||
    headAscii.startsWith('<script') ||
    headAscii.startsWith('<svg')
  ) {
    return {
      valid: false,
      detectedMimeType: 'text/html',
      reason: 'Active HTML/SVG/script payloads are prohibited',
    };
  }

  if (ext === 'pdf') {
    const pdfPrefix = buffer
      .subarray(0, Math.min(buffer.length, 16))
      .toString('ascii');
    if (pdfPrefix.includes('%PDF-')) {
      return { valid: true, detectedMimeType: 'application/pdf' };
    }
    return {
      valid: false,
      detectedMimeType: null,
      reason: 'File content does not match PDF signature (%PDF-)',
    };
  }

  if (ext === 'jpg' || ext === 'jpeg') {
    if (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    ) {
      return { valid: true, detectedMimeType: 'image/jpeg' };
    }
    return {
      valid: false,
      detectedMimeType: null,
      reason: 'File content does not match JPEG signature',
    };
  }

  if (ext === 'png') {
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
      return { valid: true, detectedMimeType: 'image/png' };
    }
    return {
      valid: false,
      detectedMimeType: null,
      reason: 'File content does not match PNG signature',
    };
  }

  if (ext === 'docx' || ext === 'xlsx') {
    const isZipHeader =
      buffer.length >= 4 &&
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      buffer[2] === 0x03 &&
      buffer[3] === 0x04;

    if (!isZipHeader) {
      return {
        valid: false,
        detectedMimeType: null,
        reason: `File content does not match ${ext.toUpperCase()} OpenXML archive signature`,
      };
    }

    const preview = buffer
      .subarray(0, Math.min(buffer.length, 4096))
      .toString('latin1');
    if (preview.includes('META-INF/MANIFEST.MF')) {
      return {
        valid: false,
        detectedMimeType: 'application/java-archive',
        reason: 'Java archive (JAR) masquerading as document is prohibited',
      };
    }

    const expectedMime =
      ext === 'docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    return { valid: true, detectedMimeType: expectedMime };
  }

  if (ext === 'csv') {
    // Reject binary magic masquerading as CSV
    if (
      (buffer.length >= 4 &&
        buffer[0] === 0x50 &&
        buffer[1] === 0x4b &&
        buffer[2] === 0x03 &&
        buffer[3] === 0x04) ||
      headAscii.startsWith('%pdf-')
    ) {
      return {
        valid: false,
        detectedMimeType: null,
        reason: 'Binary document content does not match CSV text format',
      };
    }

    for (let i = 0; i < Math.min(buffer.length, 8192); i++) {
      const byte = buffer[i]!;
      if (byte === 0x00) {
        return {
          valid: false,
          detectedMimeType: 'application/octet-stream',
          reason: 'CSV file contains binary null bytes',
        };
      }
      if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) {
        return {
          valid: false,
          detectedMimeType: 'application/octet-stream',
          reason: 'CSV file contains non-text control bytes',
        };
      }
    }

    return { valid: true, detectedMimeType: 'text/csv' };
  }

  return {
    valid: false,
    detectedMimeType: null,
    reason: 'Unsupported file signature',
  };
}
