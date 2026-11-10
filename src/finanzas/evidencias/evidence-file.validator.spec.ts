import { BadRequestException } from '@nestjs/common';
import {
  sanitizeOriginalName,
  UploadedEvidenceFile,
  validateEvidenceFile,
} from './evidence-file.validator';

const PDF = Buffer.from('%PDF-1.7\nminimal fixture');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

function file(
  buffer: Buffer,
  originalname = 'comprobante.pdf',
  mimetype = 'application/pdf',
): UploadedEvidenceFile {
  return { buffer, originalname, mimetype, size: buffer.length };
}

describe('evidence file validation', () => {
  it('accepts PDF and JPEG signatures with matching declarations', () => {
    expect(validateEvidenceFile(file(PDF), 1024).contentType).toBe('application/pdf');
    expect(
      validateEvidenceFile(file(JPEG, 'foto.jpeg', 'image/jpeg'), 1024).contentType,
    ).toBe('image/jpeg');
  });

  it('rejects unsupported extensions, false signatures, and mismatched declarations', () => {
    expect(() => validateEvidenceFile(file(PDF, 'proof.png'), 1024)).toThrow(
      BadRequestException,
    );
    expect(() => validateEvidenceFile(file(Buffer.from('not a pdf')), 1024)).toThrow(
      BadRequestException,
    );
    expect(() => validateEvidenceFile(file(PDF, 'proof.pdf', 'image/jpeg'), 1024)).toThrow(
      BadRequestException,
    );
  });

  it('rejects empty and oversized content', () => {
    expect(() => validateEvidenceFile(file(Buffer.alloc(0)), 1024)).toThrow(
      BadRequestException,
    );
    expect(() => validateEvidenceFile(file(PDF), 2)).toThrow(BadRequestException);
  });

  it('stores only a safe basename as the original-name metadata', () => {
    expect(sanitizeOriginalName('..\\folder\\receipt.pdf')).toBe('receipt.pdf');
    expect(() => sanitizeOriginalName('')).toThrow(BadRequestException);
  });
});
