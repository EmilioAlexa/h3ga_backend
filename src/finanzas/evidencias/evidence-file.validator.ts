import { BadRequestException } from '@nestjs/common';
import { extname } from 'node:path';

export interface UploadedEvidenceFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface ValidatedEvidenceFile {
  buffer: Buffer;
  originalName: string;
  contentType: 'application/pdf' | 'image/jpeg';
  size: number;
}

const PDF_SIGNATURE = Buffer.from('%PDF-');

export function validateEvidenceFile(
  file: UploadedEvidenceFile | undefined,
  maxSizeBytes: number,
): ValidatedEvidenceFile {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw new BadRequestException('Debes adjuntar un archivo en el campo "file"');
  }
  const size = file.buffer.length;
  if (size === 0) throw new BadRequestException('El archivo está vacío');
  if (size > maxSizeBytes) {
    throw new BadRequestException('El archivo excede el límite de tamaño permitido');
  }

  const originalName = sanitizeOriginalName(file.originalname);
  const extension = extname(originalName).toLowerCase();
  const isPdf = file.buffer.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE);
  const isJpeg =
    file.buffer.length >= 3 &&
    file.buffer[0] === 0xff &&
    file.buffer[1] === 0xd8 &&
    file.buffer[2] === 0xff;

  if (isPdf) {
    if (extension !== '.pdf' || file.mimetype !== 'application/pdf') {
      throw new BadRequestException('La extensión o el tipo declarado no coincide con el PDF');
    }
    return { buffer: file.buffer, originalName, contentType: 'application/pdf', size };
  }

  if (isJpeg) {
    if (!['.jpg', '.jpeg'].includes(extension) || file.mimetype !== 'image/jpeg') {
      throw new BadRequestException('La extensión o el tipo declarado no coincide con la imagen JPEG');
    }
    return { buffer: file.buffer, originalName, contentType: 'image/jpeg', size };
  }

  throw new BadRequestException('El contenido debe ser un PDF o una imagen JPG/JPEG válida');
}

export function sanitizeOriginalName(filename: string): string {
  if (typeof filename !== 'string' || !filename.trim()) {
    throw new BadRequestException('El archivo debe incluir un nombre original');
  }
  const basename = filename.replace(/\\/g, '/').split('/').pop() ?? '';
  const safe = basename.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 255);
  if (!safe || safe === '.' || safe === '..') {
    throw new BadRequestException('El nombre original del archivo no es válido');
  }
  return safe;
}
