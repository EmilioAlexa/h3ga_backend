import { BadRequestException } from '@nestjs/common';
import { extname } from 'node:path';
import {
  sanitizeOriginalName,
  UploadedEvidenceFile,
} from '../../evidencias/evidence-file.validator';

export function validateContractDocument(
  file: UploadedEvidenceFile | undefined,
) {
  if (
    !file ||
    !Buffer.isBuffer(file.buffer) ||
    !file.buffer.length ||
    file.buffer.length > 10 * 1024 * 1024
  )
    throw new BadRequestException('Adjunta un documento de hasta 10 MiB');
  const bytes = file.buffer;
  const name = sanitizeOriginalName(file.originalname);
  const ext = extname(name).toLowerCase();
  let mime: string | undefined;
  if (
    bytes.subarray(0, 5).equals(Buffer.from('%PDF-')) &&
    bytes.subarray(-1024).includes(Buffer.from('%%EOF'))
  )
    mime = 'application/pdf';
  if (
    bytes.length >= 4 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255 &&
    bytes.at(-2) === 255 &&
    bytes.at(-1) === 217
  )
    mime = 'image/jpeg';
  if (
    bytes.length >= 45 &&
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    bytes.readUInt32BE(8) === 13 &&
    bytes.toString('ascii', 12, 16) === 'IHDR' &&
    bytes.readUInt32BE(16) > 0 &&
    bytes.readUInt32BE(20) > 0 &&
    bytes
      .subarray(-12)
      .equals(Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]))
  )
    mime = 'image/png';
  if (
    !mime ||
    file.mimetype !== mime ||
    !{
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
    }[mime]!.includes(ext)
  )
    throw new BadRequestException(
      'Extension, MIME o contenido del documento no validos',
    );
  return { name, mime, bytes, size: bytes.length };
}
