import { ServiceUnavailableException } from '@nestjs/common';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { ContractDocumentsService } from './contract-documents.service';
import { validateContractDocument } from './contract-document.validator';
const user = { id: 'actor', activo: true, roles: { nombre: 'asesor' } };
const pdf = Buffer.from('%PDF-1.7 test %%EOF');
const file = {
  buffer: pdf,
  originalname: 'contrato.pdf',
  mimetype: 'application/pdf',
  size: pdf.length,
};
describe('private contract documents', () => {
  let prisma: any, storage: any, schema: any, service: ContractDocumentsService;
  beforeEach(() => {
    prisma = {
      contratos: { findFirst: jest.fn().mockResolvedValue({ id: 'contract' }) },
      documentos_contrato: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'doc' }),
      },
    };
    prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
    storage = {
      save: jest.fn().mockResolvedValue('opaque.pdf'),
      delete: jest.fn(),
      get: jest.fn(),
    };
    schema = { requireDocuments: jest.fn() };
    service = new ContractDocumentsService(prisma, storage, schema);
  });
  it('associates a validated file with the actual contract, actor and digest', async () => {
    await expect(
      service.upload('contract', 'request', file, user),
    ).resolves.toEqual({ id: 'doc' });
    expect(
      prisma.documentos_contrato.create.mock.calls[0][0].data,
    ).toMatchObject({
      contrato_id: 'contract',
      subido_por: 'actor',
      sha256: createHash('sha256').update(pdf).digest('hex'),
    });
    expect(prisma.contratos.findFirst.mock.calls[0][0].where).toEqual({
      id: 'contract',
      asesor_id: 'actor',
    });
  });
  it('does not save objects when unauthorized or schema is missing', async () => {
    await expect(
      service.list('contract', { ...user, activo: false }),
    ).rejects.toMatchObject({ status: 403 });
    prisma.contratos.findFirst.mockResolvedValue(null);
    await expect(
      service.upload('other', 'request', file, user),
    ).rejects.toMatchObject({ status: 404 });
    prisma.contratos.findFirst.mockResolvedValue({id:'contract'});
    schema.requireDocuments.mockRejectedValue(new ServiceUnavailableException('Esquema pendiente'));
    await expect(service.upload('contract','request',file,user)).rejects.toMatchObject({status:503});
    expect(storage.save).not.toHaveBeenCalled();
  });
  it('makes identical retries safe and rejects changed payloads', async () => {
    prisma.documentos_contrato.findFirst.mockResolvedValue({
      id: 'doc',
      sha256: createHash('sha256').update(pdf).digest('hex'),
      mime_type: 'application/pdf',
      nombre_original: 'contrato.pdf',
    });
    await expect(
      service.upload('contract', 'request', file, user),
    ).resolves.toMatchObject({ id: 'doc' });
    expect(storage.save).not.toHaveBeenCalled();
    await expect(
      service.upload(
        'contract',
        'request',
        { ...file, originalname: 'otro.pdf' },
        user,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('cleans the new object on metadata failure and never duplicates a contract', async () => {
    prisma.documentos_contrato.create.mockRejectedValue(
      new Error('database failed'),
    );
    await expect(
      service.upload('contract', 'request', file, user),
    ).rejects.toThrow('database failed');
    expect(storage.delete).toHaveBeenCalledWith('opaque.pdf');
  });
  it('does not delete an object after an uncertain committed write', async () => {
    prisma.documentos_contrato.create.mockRejectedValue(
      new Error('connection lost'),
    );
    prisma.documentos_contrato.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'doc',
        clave_privada: 'opaque.pdf',
        sha256: createHash('sha256').update(pdf).digest('hex'),
        mime_type: 'application/pdf',
        nombre_original: 'contrato.pdf',
      });
    await expect(
      service.upload('contract', 'request', file, user),
    ).resolves.toMatchObject({ id: 'doc' });
    expect(storage.delete).not.toHaveBeenCalled();
  });
  it('authorizes the document-contract pair and verifies private bytes', async () => {
    const row = {
      id: 'doc',
      clave_privada: 'opaque.pdf',
      tamano_bytes: pdf.length,
      sha256: createHash('sha256').update(pdf).digest('hex'),
      nombre_original: 'contrato.pdf',
      mime_type: 'application/pdf',
    };
    prisma.documentos_contrato.findFirst.mockResolvedValue(row);
    storage.get.mockResolvedValue({
      stream: Readable.from(pdf),
      size: pdf.length,
    });
    expect((await service.download('contract', 'doc', user)).bytes).toEqual(
      pdf,
    );
    expect(prisma.documentos_contrato.findFirst.mock.calls[0][0].where).toEqual(
      { id: 'doc', contrato_id: 'contract' },
    );
    prisma.documentos_contrato.findFirst.mockResolvedValue(null);
    await expect(
      service.download('contract', 'other', user),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('rejects changed sizes and content hashes before delivering private bytes',async()=>{
    prisma.documentos_contrato.findFirst.mockResolvedValue({id:'doc',clave_privada:'opaque.pdf',tamano_bytes:pdf.length,sha256:createHash('sha256').update(pdf).digest('hex')});
    const stream=Readable.from(pdf);storage.get.mockResolvedValueOnce({stream,size:pdf.length+1});
    await expect(service.download('contract','doc',user)).rejects.toMatchObject({status:409});expect(stream.destroyed).toBe(true);
    storage.get.mockResolvedValueOnce({stream:Readable.from(Buffer.alloc(pdf.length)),size:pdf.length});
    await expect(service.download('contract','doc',user)).rejects.toMatchObject({status:409});
  });
  it('rejects MIME mismatch, executables, empty, oversized or truncated files', () => {
    for (const invalid of [
      { ...file, mimetype: 'image/png' },
      { ...file, originalname: 'test.exe' },
      { ...file, buffer: Buffer.alloc(0) },
      { ...file, buffer: Buffer.alloc(10485761) },
      { ...file, buffer: Buffer.from('%PDF-broken') },
    ])
      expect(() => validateContractDocument(invalid)).toThrow();
  });
  it('accepts PDF JPEG PNG content and sanitizes client paths', () => {
    expect(
      validateContractDocument({ ...file, originalname: '../../contract.pdf' })
        .name,
    ).toBe('contract.pdf');
    const jpg = Buffer.from([255, 216, 255, 224, 255, 217]);
    expect(
      validateContractDocument({
        ...file,
        buffer: jpg,
        originalname: 'a.jpg',
        mimetype: 'image/jpeg',
      }).mime,
    ).toBe('image/jpeg');
    const png = Buffer.alloc(45);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
    png.writeUInt32BE(13, 8);
    png.write('IHDR', 12);
    png.writeUInt32BE(1, 16);
    png.writeUInt32BE(1, 20);
    Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]).copy(png, 33);
    expect(
      validateContractDocument({
        ...file,
        buffer: png,
        originalname: 'a.png',
        mimetype: 'image/png',
      }).mime,
    ).toBe('image/png');
  });
});
