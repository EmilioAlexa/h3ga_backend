import { BadRequestException } from '@nestjs/common';
import { extname } from 'node:path';
import { validarDocumento } from '../gestion-documental/documento-expediente.validator';

// Comprueba la estructura ZIP y las entradas esenciales de un documento OOXML,
// sin descomprimir contenido de tamaño no confiable.
function esDocx(b: Buffer): boolean {
  if (b.length < 22 || b.readUInt32LE(0) !== 0x04034b50) return false;
  let end = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (b.readUInt32LE(i) === 0x06054b50 && i + 22 + b.readUInt16LE(i + 20) === b.length) { end = i; break; }
  }
  if (end < 0 || b.readUInt16LE(end + 4) !== 0 || b.readUInt16LE(end + 6) !== 0) return false;
  const count = b.readUInt16LE(end + 10), size = b.readUInt32LE(end + 12), start = b.readUInt32LE(end + 16);
  if (count !== b.readUInt16LE(end + 8) || start + size !== end) return false;
  const entries = new Set<string>();
  let pos = start;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > end || b.readUInt32LE(pos) !== 0x02014b50) return false;
    const n = b.readUInt16LE(pos + 28), extra = b.readUInt16LE(pos + 30), comment = b.readUInt16LE(pos + 32);
    const next = pos + 46 + n + extra + comment, local = b.readUInt32LE(pos + 42);
    if (next > end || local + 30 > start || b.readUInt32LE(local) !== 0x04034b50) return false;
    const name = b.toString('utf8', pos + 46, pos + 46 + n);
    const localNameLength = b.readUInt16LE(local + 26), localExtra = b.readUInt16LE(local + 28);
    const compressed = b.readUInt32LE(pos + 20);
    if (local + 30 + localNameLength + localExtra + compressed > start || b.toString('utf8', local + 30, local + 30 + localNameLength) !== name) return false;
    if (['[Content_Types].xml', 'word/document.xml'].includes(name) && (compressed === 0 || b.readUInt32LE(pos + 24) === 0 || (b.readUInt16LE(pos + 8) & 1) !== 0)) return false;
    entries.add(name); pos = next;
  }
  return pos === end && entries.has('[Content_Types].xml') && entries.has('word/document.xml');
}

export function validarArchivoFormato(file: Express.Multer.File | undefined, tipo: 'pdf' | 'word'): void {
  validarDocumento(file);
  const f = file!;
  const ext = extname(f.originalname).toLowerCase();
  if (!['.pdf', '.doc', '.docx'].includes(ext) || (tipo === 'pdf' ? ext !== '.pdf' : ext === '.pdf')) {
    throw new BadRequestException('El archivo no corresponde al tipo de formato permitido.');
  }
  const b = f.buffer;
  let valido = false;
  if (ext === '.pdf') {
    valido = /^%PDF-1\.[0-7]|^%PDF-2\.0/.test(b.subarray(0, 8).toString('latin1')) && /%%EOF\s*$/.test(b.subarray(Math.max(0, b.length - 1024)).toString('latin1')) && /\d+\s+\d+\s+obj\b/.test(b.toString('latin1'));
  } else if (ext === '.doc') {
    valido = b.length >= 512 && b.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex')) && b.readUInt16LE(28) === 0xfffe && [9, 12].includes(b.readUInt16LE(30)) && b.length >= 1 << b.readUInt16LE(30) && b.includes(Buffer.from('WordDocument\0', 'utf16le')); 
  } else {
    valido = esDocx(b);
  }
  if (!valido) throw new BadRequestException('El contenido del archivo no corresponde a un documento válido.');
}
