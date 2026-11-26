import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, PayloadTooLargeException, ServiceUnavailableException } from '@nestjs/common';
import { Readable } from 'node:stream';
import { Prisma } from '../../generated/prisma/client';
import { GestionDocumentalService } from './gestion-documental.service';
import { LIMITE_DOCUMENTO, validarDocumento } from './documento-expediente.validator';

const user = { id: '11111111-1111-4111-8111-111111111111', roles: { nombre: 'asesor' } };
const clienteId = '22222222-2222-4222-8222-222222222222';
const file = (originalname = 'archivo.pdf', mimetype = 'application/pdf') => ({ originalname, mimetype, buffer: Buffer.from('contenido'), size: 9 } as Express.Multer.File);
function fixture() {
  const db: any = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: clienteId }]),
    clientes: { findFirst: jest.fn().mockResolvedValue({ id: clienteId }) },
    cliente_auxiliares: { findFirst: jest.fn().mockResolvedValue({ id: 'asignacion' }) },
    etapas_tramite: { findFirst: jest.fn().mockResolvedValue({ id: 'etapa', etapas_proceso: { numero_paso: 5, nombre: 'Estrategia Modalidad 10' } }) },
    modalidades_aplicacion: { findMany: jest.fn().mockResolvedValue([{ aplica_m10: true }]) },
    tipo_documento: { findUnique: jest.fn().mockResolvedValue({ id: 90 }) },
    documentos_clientes: {
      create: jest.fn().mockResolvedValue({ id: 'doc' }), update: jest.fn().mockResolvedValue({ id: 'doc' }), delete: jest.fn().mockResolvedValue({ id: 'doc' }), findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ id: 'doc', cliente_id: clienteId, archivo_path: 'privado', nombre_archivo_original: 'original.pdf', mime_type: 'application/pdf', estatus: null, _count: { envios_documento: 0, serviciosComplementariosDocumentos: 0 } }),
    },
  };
  db.$transaction = jest.fn((fn) => fn(db));
  const storage = { save: jest.fn().mockResolvedValue('key'), remove: jest.fn().mockResolvedValue(undefined), get: jest.fn().mockRejectedValue(new NotFoundException()) };
  return { db, storage, service: new GestionDocumentalService(db, storage as any) };
}
describe('Documentos de expediente — RF-27/28', () => {
  it('elimina el registro confirmado en la transacción y conserva el archivo para conciliación', async () => {
    const { service, db, storage } = fixture();
    await expect(service.eliminarDocumento('doc', user)).resolves.toBeUndefined();
    expect(db.documentos_clientes.delete).toHaveBeenCalledWith({ where: { id: 'doc' } });
    expect(storage.remove).not.toHaveBeenCalled();
  });
  it.each(['administrador', 'auxiliar administrativo', 'administrador financiero'])('rechaza eliminación por %s', async (nombre) => {
    const { service, db } = fixture();
    await expect(service.eliminarDocumento('doc', { ...user, roles: { nombre } })).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('oculta documentos inexistentes o ajenos', async () => {
    const { service, db } = fixture(); db.$queryRaw.mockResolvedValue([]);
    await expect(service.eliminarDocumento('doc', user)).rejects.toBeInstanceOf(NotFoundException);
    expect(db.documentos_clientes.delete).not.toHaveBeenCalled();
  });
  it.each([
    { estatus: 'si', _count: { envios_documento: 0, serviciosComplementariosDocumentos: 0 } },
    { estatus: null, _count: { envios_documento: 1, serviciosComplementariosDocumentos: 0 } },
    { estatus: null, _count: { envios_documento: 0, serviciosComplementariosDocumentos: 1 } },
  ])('impide eliminar documento protegido: %j', async (doc) => {
    const { service, db, storage } = fixture(); db.documentos_clientes.findUnique.mockResolvedValue(doc);
    await expect(service.eliminarDocumento('doc', user)).rejects.toBeInstanceOf(ConflictException);
    expect(db.documentos_clientes.delete).not.toHaveBeenCalled(); expect(storage.remove).not.toHaveBeenCalled();
  });
  it('conserva el archivo si falla el commit o su resultado es indeterminado', async () => {
  const { service, db, storage } = fixture();

  db.$transaction.mockImplementation(
    async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
      await fn(db);
      throw new Error('commit desconocido');
    },
  );

  await expect(
    service.eliminarDocumento('doc', user),
  ).rejects.toBeInstanceOf(ServiceUnavailableException);

  expect(storage.remove).not.toHaveBeenCalled();
});
  it('traduce una referencia concurrente de clave foránea a conflicto', async () => {
    const { service, db, storage } = fixture();
    db.documentos_clientes.delete.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('FK', { code: 'P2003', clientVersion: 'test' }));
    await expect(service.eliminarDocumento('doc', user)).rejects.toBeInstanceOf(ConflictException);
    expect(storage.remove).not.toHaveBeenCalled();
  });
  it.each([
    ['a.pdf', 'application/pdf'], ['a.doc', 'application/msword'], ['a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['a.jpeg', 'image/jpeg'], ['a.jpg', 'image/jpeg'], ['a.png', 'image/png'],
  ])('acepta %s', async (name, mime) => {
    const { service, storage, db } = fixture();
    expect(await service.cargarDocumento(clienteId, { tipo_documento_id: 90 }, file(name, mime), user)).toEqual({ id: 'doc' });
    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(db.documentos_clientes.create.mock.calls[0][0].data).toMatchObject({ cliente_id: clienteId, subido_por: user.id, nombre_archivo_original: name, mime_type: mime });
    expect(db.documentos_clientes.create.mock.calls[0][0].select).not.toHaveProperty('archivo_path');
  });
  it.each([['a.exe', 'application/pdf'], ['a.pdf', 'image/png'], ['a.html', 'text/html']])('rechaza formato incoherente %s', (name, mime) => {
    expect(() => validarDocumento(file(name, mime))).toThrow(BadRequestException);
  });
  it('rechaza ausencia, archivo vacío y exceso del límite configurado', () => {
    expect(() => validarDocumento(undefined)).toThrow(BadRequestException);
    expect(() => validarDocumento({ ...file(), buffer: Buffer.alloc(0) })).toThrow(BadRequestException);
    expect(() => validarDocumento({ ...file(), size: LIMITE_DOCUMENTO + 1 })).toThrow(PayloadTooLargeException);
  });
  it('relaciona documento con etapa comprobada y modalidad seleccionada', async () => {
    const { service, db } = fixture();
    await service.cargarDocumento(clienteId, { tipo_documento_id: 90, etapa_tramite_id: 'etapa' }, file(), user);
    expect(db.etapas_tramite.findFirst.mock.calls[0][0].where).toEqual({ id: 'etapa', cliente_id: clienteId });
    expect(db.documentos_clientes.create.mock.calls[0][0].data.etapa_tramite_id).toBe('etapa');
  });
  it('rechaza etapa de otro cliente antes de guardar el archivo', async () => {
    const { service, db, storage } = fixture(); db.etapas_tramite.findFirst.mockResolvedValue(null);
    await expect(service.cargarDocumento(clienteId, { tipo_documento_id: 90, etapa_tramite_id: 'ajena' }, file(), user)).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.save).not.toHaveBeenCalled();
  });
  it('no identifica una modalidad únicamente por numero_paso', async () => {
    const { service, db } = fixture(); db.etapas_tramite.findFirst.mockResolvedValue({ etapas_proceso: { numero_paso: 5, nombre: 'Otra etapa' } });
    await expect(service.cargarDocumento(clienteId, { tipo_documento_id: 90, etapa_tramite_id: 'etapa' }, file(), user)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rechaza subir a una modalidad no seleccionada', async () => {
    const { service, db, storage } = fixture(); db.modalidades_aplicacion.findMany.mockResolvedValue([{ aplica_m10: false }]);
    await expect(service.cargarDocumento(clienteId, { tipo_documento_id: 90, etapa_tramite_id: 'etapa' }, file(), user)).rejects.toBeInstanceOf(ConflictException);
    expect(storage.save).not.toHaveBeenCalled();
  });
  it('rechaza tipo de documento inexistente', async () => {
    const { service, db, storage } = fixture(); db.tipo_documento.findUnique.mockResolvedValue(null);
    await expect(service.cargarDocumento(clienteId, { tipo_documento_id: 99 }, file(), user)).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.save).not.toHaveBeenCalled();
  });
  it('compensa un fallo de inserción retirando el archivo y comprobando su ausencia', async () => {
    const { service, db, storage } = fixture(); db.documentos_clientes.create.mockRejectedValue(new Error('persistencia'));
    await expect(service.cargarDocumento(clienteId, { tipo_documento_id: 90 }, file(), user)).rejects.toThrow('persistencia');
    expect(storage.remove).toHaveBeenCalledWith('key'); expect(storage.get).toHaveBeenCalledWith('key');
  });
  it('reporta limpieza no confirmada si el almacenamiento conserva el archivo', async () => {
    const { service, db, storage } = fixture(); db.documentos_clientes.create.mockRejectedValue(new Error('persistencia'));
    storage.get.mockResolvedValue({ stream: Readable.from('contenido') } as never);
    await expect(service.cargarDocumento(clienteId, { tipo_documento_id: 90 }, file(), user)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('fallo de almacenamiento no crea metadatos', async () => {
    const { service, db, storage } = fixture(); storage.save.mockRejectedValue(new Error('almacenamiento'));
    await expect(service.cargarDocumento(clienteId, { tipo_documento_id: 90 }, file(), user)).rejects.toThrow('almacenamiento');
    expect(db.documentos_clientes.create).not.toHaveBeenCalled();
  });
  it('cliente ajeno no permite listar, cargar ni descargar documentos', async () => {
    const { service, db, storage } = fixture(); db.clientes.findFirst.mockResolvedValue(null);
    await expect(service.findDocumentos(clienteId, user)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.cargarDocumento(clienteId, { tipo_documento_id: 90 }, file(), user)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.obtenerDocumento('doc', user)).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.get).not.toHaveBeenCalled(); expect(storage.save).not.toHaveBeenCalled();
  });
  it('descarga conserva nombre/MIME y comprueba autorización antes del almacenamiento', async () => {
    const { service, storage, db } = fixture(); storage.get.mockResolvedValue({ stream: Readable.from('contenido') } as never);
    expect(await service.obtenerDocumento('doc', user)).toMatchObject({ filename: 'original.pdf', contentType: 'application/pdf' });
    expect(db.clientes.findFirst.mock.invocationCallOrder[0]).toBeLessThan(storage.get.mock.invocationCallOrder[0]);
  });
  it('auxiliar necesita asignación activa y no puede usar la carga del asesor', async () => {
    const { service, db, storage } = fixture(); const auxiliar = { ...user, roles: { nombre: 'auxiliar administrativo' } };
    db.cliente_auxiliares.findFirst.mockResolvedValue(null);
    await expect(service.obtenerDocumento('doc', auxiliar)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.cargarDocumento(clienteId, { tipo_documento_id: 90 }, file(), auxiliar)).rejects.toBeInstanceOf(ForbiddenException);
    expect(storage.get).not.toHaveBeenCalled();
  });
  it.each(['administrador', 'administrador financiero'])('descarga directa no admite rol %s', async (nombre) => {
    const { service, storage } = fixture();
    await expect(service.obtenerDocumento('doc', { ...user, roles: { nombre } })).rejects.toBeInstanceOf(ForbiddenException);
    expect(storage.get).not.toHaveBeenCalled();
  });
  it.each([
    { estatus: 'si', _count: { envios_documento: 0, serviciosComplementariosDocumentos: 0 } },
    { estatus: null, _count: { envios_documento: 1, serviciosComplementariosDocumentos: 0 } },
    { estatus: null, _count: { envios_documento: 0, serviciosComplementariosDocumentos: 1 } },
  ])('protege metadatos confirmados o con dependencias: %j', async (doc) => {
    const { service, db } = fixture(); db.documentos_clientes.findUnique.mockResolvedValue(doc);
    await expect(service.actualizarMetadatos('doc', { observaciones: 'cambio' }, user)).rejects.toBeInstanceOf(ConflictException);
    expect(db.documentos_clientes.update).not.toHaveBeenCalled();
  });
  it('actualización no cambia etapa, autor, archivo ni cliente', async () => {
    const { service, db } = fixture();
    await service.actualizarMetadatos('doc', { observaciones: 'Revisar', numero_referencia: '123' }, user);
    expect(db.documentos_clientes.update.mock.calls[0][0].data).toEqual({ observaciones: 'Revisar', numero_referencia: '123' });
  });
  it('metadatos de documento ajeno se rechazan sin modificarlo', async () => {
    const { service, db } = fixture(); db.$queryRaw.mockResolvedValue([]);
    await expect(service.actualizarMetadatos('doc', { observaciones: 'cambio' }, user)).rejects.toBeInstanceOf(NotFoundException);
    expect(db.documentos_clientes.update).not.toHaveBeenCalled();
  });
});
