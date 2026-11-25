import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Prisma } from '../../generated/prisma/client';
import { DocumentStorageService } from '../gestion-documental/document-storage.service';
import { FormatosInstitucionalesService } from './formatos-institucionales.service';
import { validarArchivoFormato } from './formato-archivo.validator';

const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF');
const doc = Buffer.alloc(512); Buffer.from('d0cf11e0a1b11ae1', 'hex').copy(doc); doc.writeUInt16LE(0xfffe, 28); doc.writeUInt16LE(9, 30); Buffer.from('WordDocument\0', 'utf16le').copy(doc, 128);
function zip(names: string[]) {
  const locals: Buffer[] = [], centrals: Buffer[] = []; let offset = 0;
  for (const name of names) {
    const n = Buffer.from(name), l = Buffer.alloc(30), c = Buffer.alloc(46);
    l.writeUInt32LE(0x04034b50); l.writeUInt32LE(1, 18); l.writeUInt32LE(1, 22); l.writeUInt16LE(n.length, 26);
    c.writeUInt32LE(0x02014b50); c.writeUInt32LE(1, 20); c.writeUInt32LE(1, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42);
    locals.push(l, n, Buffer.from('x')); centrals.push(c, n); offset += l.length + n.length + 1;
  }
  const central = Buffer.concat(centrals), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(names.length, 8); end.writeUInt16LE(names.length, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, end]);
}
const docx = zip(['[Content_Types].xml', 'word/document.xml']);
const file = (name: string, mime: string, buffer: Buffer) => ({ originalname: name, mimetype: mime, buffer, size: buffer.length } as Express.Multer.File);
const samples = [
  ['a.pdf', 'application/pdf', pdf, 'pdf'],
  ['a.doc', 'application/msword', doc, 'word'],
  ['a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', docx, 'word'],
] as const;
const dto = { nombre: 'Formato', dependencia_id: 1, tipo_formato: 'pdf' as const };
function fixture() {
  const db = { dependencias_formato: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) }, formatos_institucionales: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)), findFirst: jest.fn() } };
  const storage = { save: jest.fn().mockResolvedValue('key.pdf'), remove: jest.fn().mockResolvedValue(undefined), get: jest.fn().mockRejectedValue(new NotFoundException()) };
  const service = new FormatosInstitucionalesService(db as never, storage as never);
  return { service, db, storage };
}
describe('carga de formatos', () => {
  it.each(samples)('acepta %s', async (name, mime, buffer, tipo) => {
    const { service, db, storage } = fixture();
    await service.cargar({ ...dto, tipo_formato: tipo }, file(name, mime, buffer), 'user');
    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(db.formatos_institucionales.create.mock.calls[0][0].data).toMatchObject({ archivo_path: 'key.pdf', creado_por: 'user' });
    expect(db.formatos_institucionales.create.mock.calls[0][0].data.enlace_url).toBeUndefined();
  });
  it('rechaza ausente, vacío, extensión, MIME, contenido y tipo incompatibles', () => {
    expect(() => validarArchivoFormato(undefined, 'pdf')).toThrow(BadRequestException);
    expect(() => validarArchivoFormato(file('a.pdf', 'application/pdf', Buffer.alloc(0)), 'pdf')).toThrow();
    expect(() => validarArchivoFormato(file('a.exe', 'application/pdf', pdf), 'pdf')).toThrow();
    expect(() => validarArchivoFormato(file('a.pdf', 'image/png', pdf), 'pdf')).toThrow();
    expect(() => validarArchivoFormato(file('a.pdf', 'application/pdf', Buffer.from('falso')), 'pdf')).toThrow();
    expect(() => validarArchivoFormato(file('a.pdf', 'application/pdf', pdf), 'word')).toThrow();
    expect(() => validarArchivoFormato(file('a.pdf', 'application/pdf', Buffer.alloc(10 * 1024 * 1024 + 1)), 'pdf')).toThrow();
  });
  it('conserva el registro de enlaces', async () => {
    const { service, storage } = fixture();
    expect(await service.create({ ...dto, tipo_formato: 'enlace', enlace_url: 'https://example.com' }, 'user')).toMatchObject({ enlace_url: 'https://example.com', archivo_path: undefined });
    expect(storage.save).not.toHaveBeenCalled();
  });
  it('no inserta si falla el almacenamiento', async () => {
    const { service, db, storage } = fixture(); storage.save.mockRejectedValue(new Error('storage'));
    await expect(service.cargar(dto, file('a.pdf', 'application/pdf', pdf), 'user')).rejects.toThrow('storage');
    expect(db.formatos_institucionales.create).not.toHaveBeenCalled();
  });
  it('compensa un rechazo confirmado y conserva el error original', async () => {
    const { service, db, storage } = fixture(); const error = new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'test' });
    db.formatos_institucionales.create.mockRejectedValue(error);
    await expect(service.cargar(dto, file('a.pdf', 'application/pdf', pdf), 'user')).rejects.toBe(error);
    expect(storage.remove).toHaveBeenCalledWith('key.pdf'); expect(storage.get).toHaveBeenCalledWith('key.pdf');
  });
  it('conserva el archivo si el resultado es indeterminado', async () => {
    const { service, db, storage } = fixture(); const error = new Error('connection'); db.formatos_institucionales.create.mockRejectedValue(error);
    await expect(service.cargar(dto, file('a.pdf', 'application/pdf', pdf), 'user')).rejects.toBe(error); expect(storage.remove).not.toHaveBeenCalled();
  });
  it('conserva el error original si falla la limpieza', async () => {
    const { service, db, storage } = fixture(); const error = new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'test' }); db.formatos_institucionales.create.mockRejectedValue(error); storage.remove.mockRejectedValue(new Error('cleanup'));
    await expect(service.cargar(dto, file('a.pdf', 'application/pdf', pdf), 'user')).rejects.toBe(error);
  });
  it('conserva 501 para referencias antiguas incompatibles', async () => {
    const { service, db, storage } = fixture();
    db.formatos_institucionales.findFirst.mockResolvedValue({ id: 1, archivo_path: 'ruta/anterior.pdf' });
    await expect(service.descargar(1)).rejects.toMatchObject({ status: 501 });
    expect(storage.get).not.toHaveBeenCalled();
  });
  it.each(samples)('carga y descarga físicamente %s en almacenamiento aislado', async (name, mime, buffer, tipo) => {
    const root = await mkdtemp(join(tmpdir(), 'h3ga-formatos-'));
    try {
      const storage = new DocumentStorageService({ getOrThrow: () => root } as unknown as ConfigService);
      const db = { dependencias_formato: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) }, formatos_institucionales: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...data, id: 1 })), findFirst: jest.fn() } };
      const service = new FormatosInstitucionalesService(db as never, storage);
      const created = await service.cargar({ ...dto, tipo_formato: tipo }, file(name, mime, buffer), 'user');
      db.formatos_institucionales.findFirst.mockResolvedValue(created);
      const downloaded = await service.descargar(1);
      expect(downloaded.file.buffer).toEqual(buffer); expect(downloaded.contentType).toBe(mime);
      downloaded.file.stream.destroy();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('usa almacenamiento físico aislado y recupera la clave', async () => {
    const root = await mkdtemp(join(tmpdir(), 'h3ga-formatos-'));
    try {
      const storage = new DocumentStorageService({ getOrThrow: () => root } as unknown as ConfigService);
      const key = await storage.save(file('a.pdf', 'application/pdf', pdf));
      const stored = await storage.get(key);
      expect(stored.buffer.equals(pdf)).toBe(true); stored.stream.destroy();
      expect(await readFile(join(root, 'gestion-documental', key))).toEqual(pdf);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
