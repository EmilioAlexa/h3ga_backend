import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { extname } from 'node:path';

export const LIMITE_DOCUMENTO = 10 * 1024 * 1024;
const FORMATOS: Record<string, string[]> = {
  'application/pdf': ['.pdf'], 'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'],
};
export function validarDocumento(file: Express.Multer.File | undefined) {
  if (!file?.buffer?.length) throw new BadRequestException('Se requiere un archivo no vacío');
  if (file.buffer.length > LIMITE_DOCUMENTO || file.size > LIMITE_DOCUMENTO) throw new PayloadTooLargeException('El archivo supera 10 MiB');
  if (!FORMATOS[file.mimetype]?.includes(extname(file.originalname).toLowerCase())) throw new BadRequestException('Extensión y MIME no permitidos o incompatibles');
}
