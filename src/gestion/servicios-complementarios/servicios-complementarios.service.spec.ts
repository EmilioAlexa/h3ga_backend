import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ServiciosComplementariosService } from './servicios-complementarios.service';
import { Prisma } from '../../generated/prisma/client';

describe('ServiciosComplementariosService', () => {
  const asesor = { id: 'asesor', roles: { nombre: 'asesor' } } as any;
  const es = [
    { id: 2, nombre: 'Por iniciar', avance_porcentaje_fijo: 10 },
    { id: 3, nombre: 'En proceso cliente', avance_porcentaje_fijo: null },
    { id: 4, nombre: 'En proceso asesor', avance_porcentaje_fijo: null },
    { id: 5, nombre: 'En proceso Instituto', avance_porcentaje_fijo: null },
    { id: 6, nombre: 'Finalizado', avance_porcentaje_fijo: 100 },
    { id: 8, nombre: 'Cancelado', avance_porcentaje_fijo: null, categoria: 'excepcion' },
  ];
  let db: any; let service: ServiciosComplementariosService;
  beforeEach(() => {
    db = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'cliente' }]),
      estatus_tramite: { findMany: jest.fn().mockResolvedValue(es) },
      servicios: { findUnique: jest.fn().mockResolvedValue({ id: 1, activo: true, nombre: 'Mejoravit', codigo_folio: null }), findMany: jest.fn(), create: jest.fn() },
      servicios_complementarios_tramite: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue({ id: 'nuevo' }), update: jest.fn().mockResolvedValue({ id: 'solicitud' }), delete: jest.fn() },
      servicios_complementarios_historial: { create: jest.fn(), count: jest.fn().mockResolvedValue(0) },
      documentos_clientes: { findFirst: jest.fn() },
      eventos_agenda: { create: jest.fn().mockResolvedValue({ id: 'evento', motivo: 'Seguimiento' }) },
      avisos: { create: jest.fn().mockResolvedValue({ id: 'aviso' }) },
      servicios_complementarios_documentos: { deleteMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() }, servicios_complementarios_avisos: { deleteMany: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'vinculo' }), findMany: jest.fn().mockResolvedValue([]) },
    };
    db.$transaction = jest.fn((fn) => fn(db));
    service = new ServiciosComplementariosService(db, {} as any);
  });
  it('bloquea el cliente y rechaza otra solicitud activa', async () => {
    db.servicios_complementarios_tramite.findFirst.mockResolvedValue({ id: 'activa' });
    await expect(service.crear({ cliente_id: 'cliente', servicio_id: 1 }, asesor)).rejects.toBeInstanceOf(ConflictException);
    expect(db.$queryRaw).toHaveBeenCalled();
    expect(db.servicios_complementarios_tramite.create).not.toHaveBeenCalled();
  });
  it('crea con avance inicial del catálogo y sin dependencia de pensión', async () => {
    db.servicios_complementarios_tramite.findFirst.mockResolvedValue(null);
    await service.crear({ cliente_id: 'cliente', servicio_id: 1 }, asesor);
    expect(db.servicios_complementarios_tramite.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ cliente_id: 'cliente', estatus_id: 2, avance_porcentaje: 10 }) }));
  });
  it('rechaza un cliente ajeno y un rol distinto', async () => {
    db.$queryRaw.mockResolvedValue([]);
    await expect(service.crear({ cliente_id: 'cliente', servicio_id: 1 }, asesor)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.crear({ cliente_id: 'cliente', servicio_id: 1 }, { id: 'x', roles: { nombre: 'auxiliar administrativo' } } as any)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('calcula automáticamente el avance para estados intermedios', async () => {
    db.servicios_complementarios_tramite.findFirst.mockResolvedValueOnce({ id: 't', cliente_id: 'cliente', estatus_id: 2, avance_porcentaje: 10 }).mockResolvedValueOnce({ id: 't', cliente_id: 'cliente', estatus_id: 2, avance_porcentaje: 10 }).mockResolvedValueOnce(null);
    await service.seguimiento('t', { estatus_id: 3 }, asesor);
    expect(db.servicios_complementarios_tramite.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ avance_porcentaje: 25 }) }));
  });
  it('rechaza el cambio no confirmado', async () => {
    await expect(service.cambiar('t', { servicio_id: 1, confirmar: false } as any, asesor)).rejects.toBeInstanceOf(BadRequestException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('reinicia el seguimiento confirmado y conserva los vínculos', async () => {
    const t = { id: 't', cliente_id: 'cliente', servicio_id: 2, estatus_id: 6, avance_porcentaje: 100 };
    db.servicios_complementarios_tramite.findFirst.mockResolvedValueOnce(t).mockResolvedValueOnce(t).mockResolvedValueOnce(null);
    await service.cambiar('t', { servicio_id: 1, confirmar: true }, asesor);
    expect(db.servicios_complementarios_tramite.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ servicio_id: 1, estatus_id: 2, avance_porcentaje: 10, accion_a_realizar: null, fecha_compromiso: null, observaciones: null, fecha_completada: null, reactivado_en: null, motivo_rechazo: null }) }));
    expect(db.servicios_complementarios_documentos.deleteMany).not.toHaveBeenCalled();
    expect(db.servicios_complementarios_avisos.deleteMany).not.toHaveBeenCalled();
    expect(db.servicios_complementarios_historial.create).toHaveBeenCalledWith({ data: { servicio_tramite_id: 't', estatus_anterior_id: 6, estatus_nuevo_id: 2, cambiado_por: 'asesor' } });
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }));
  });
  it('rechaza solicitud inexistente o ajena sin modificarla', async () => {
    db.servicios_complementarios_tramite.findFirst.mockResolvedValue(null);
    await expect(service.cambiar('ajena', { servicio_id: 1, confirmar: true }, asesor)).rejects.toBeInstanceOf(NotFoundException);
    expect(db.servicios_complementarios_tramite.findFirst).toHaveBeenCalledWith({ where: { id: 'ajena', clientes: { asesor_id: 'asesor' } } });
    expect(db.servicios_complementarios_tramite.update).not.toHaveBeenCalled();
  });
  it('rechaza el cambio cuando el cliente dejó de pertenecer al asesor', async () => {
    db.servicios_complementarios_tramite.findFirst.mockResolvedValue({ id: 't', cliente_id: 'cliente' });
    db.$queryRaw.mockResolvedValue([]);
    await expect(service.cambiar('t', { servicio_id: 1, confirmar: true }, asesor)).rejects.toBeInstanceOf(NotFoundException);
    expect(db.servicios_complementarios_tramite.update).not.toHaveBeenCalled();
  });
  it('rechaza servicios inexistentes, inactivos y el servicio actual', async () => {
    const t = { id: 't', cliente_id: 'cliente', servicio_id: 1, estatus_id: 2 };
    db.servicios_complementarios_tramite.findFirst.mockResolvedValue(t);
    for (const nuevo of [null, { id: 2, activo: false, nombre: 'Otro', codigo_folio: null }, { id: 1, activo: true, nombre: 'Mejoravit', codigo_folio: null }]) {
      db.servicios.findUnique.mockResolvedValueOnce(nuevo);
      await expect(service.cambiar('t', { servicio_id: nuevo?.id ?? 2, confirmar: true }, asesor)).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(db.servicios_complementarios_tramite.update).not.toHaveBeenCalled();
  });
  it('rechaza cambiar si existe otra solicitud activa', async () => {
    const t = { id: 't', cliente_id: 'cliente', servicio_id: 2, estatus_id: 6 };
    db.servicios_complementarios_tramite.findFirst.mockResolvedValueOnce(t).mockResolvedValueOnce(t).mockResolvedValueOnce({ id: 'otro' });
    await expect(service.cambiar('t', { servicio_id: 1, confirmar: true }, asesor)).rejects.toBeInstanceOf(ConflictException);
    expect(db.servicios_complementarios_historial.create).not.toHaveBeenCalled();
    expect(db.servicios_complementarios_tramite.update).not.toHaveBeenCalled();
  });
  it('no actualiza el trámite cuando falla la escritura del historial', async () => {
    const t = { id: 't', cliente_id: 'cliente', servicio_id: 2, estatus_id: 6 };
    db.servicios_complementarios_tramite.findFirst.mockResolvedValueOnce(t).mockResolvedValueOnce(t).mockResolvedValueOnce(null);
    db.servicios_complementarios_historial.create.mockRejectedValue(new Error('error de persistencia'));
    await expect(service.cambiar('t', { servicio_id: 1, confirmar: true }, asesor)).rejects.toThrow('error de persistencia');
    expect(db.servicios_complementarios_tramite.update).not.toHaveBeenCalled();
  });
  it('rechaza roles distintos del asesor antes de iniciar la transacción', async () => {
    await expect(service.cambiar('t', { servicio_id: 1, confirmar: true }, { id: 'x', roles: { nombre: 'administrador' } } as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('impide vincular un documento de otro cliente', async () => {
    db.servicios_complementarios_tramite.findFirst.mockResolvedValue({ id: 't', cliente_id: 'cliente' });
    db.documentos_clientes.findFirst.mockResolvedValue(null);
    await expect(service.vincular('t', 'doc-ajeno', asesor)).rejects.toBeInstanceOf(NotFoundException);
    expect(db.documentos_clientes.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'doc-ajeno', cliente_id: 'cliente' } }));
    expect(db.servicios_complementarios_documentos.create).not.toHaveBeenCalled();
  });
  it('rechaza baja sin confirmación', async () => {
    await expect(service.baja('t', { confirmar: false } as any, asesor)).rejects.toBeInstanceOf(BadRequestException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('el listado excluye Cancelado por defecto y permite filtrarlo explícitamente', async () => {
    await service.listar({ page: 1, limit: 20 }, asesor);
    expect(db.servicios_complementarios_tramite.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ estatus_id: { not: 8 } }) }));
    await service.listar({ page: 1, limit: 20, estatus_id: 8 }, asesor);
    expect(db.servicios_complementarios_tramite.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ estatus_id: 8 }) }));
  });
  it('no da de baja una solicitud ajena y no escribe', async () => {
    db.servicios_complementarios_tramite.findFirst.mockResolvedValue(null);
    await expect(service.baja('t', { confirmar: true }, asesor)).rejects.toBeInstanceOf(NotFoundException);
    expect(db.servicios_complementarios_historial.create).not.toHaveBeenCalled();
    expect(db.servicios_complementarios_tramite.update).not.toHaveBeenCalled();
  });
  it('si falla el historial de baja no actualiza la solicitud', async () => {
    db.servicios_complementarios_tramite.findFirst.mockResolvedValue({ id: 't', cliente_id: 'cliente', estatus_id: 2 });
    db.servicios_complementarios_historial.create.mockRejectedValue(new Error('fallo'));
    await expect(service.baja('t', { confirmar: true }, asesor)).rejects.toThrow('fallo');
    expect(db.servicios_complementarios_tramite.update).not.toHaveBeenCalled();
  });
  it('propaga fallo de actualización después de crear historial dentro de la transacción de baja', async () => {
    db.servicios_complementarios_tramite.findFirst.mockResolvedValue({ id: 't', cliente_id: 'cliente', estatus_id: 2 });
    db.servicios_complementarios_tramite.update.mockRejectedValue(new Error('fallo actualización'));
    await expect(service.baja('t', { confirmar: true }, asesor)).rejects.toThrow('fallo actualización');
    expect(db.servicios_complementarios_historial.create).toHaveBeenCalledTimes(1);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
  it('no permite consultar una solicitud ajena y filtra por asesor', async () => {
    db.servicios_complementarios_tramite.findFirst.mockResolvedValue(null);
    await expect(service.detalle('t', asesor)).rejects.toBeInstanceOf(NotFoundException);
    expect(db.servicios_complementarios_tramite.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 't', clientes: { asesor_id: 'asesor' } } }));
  });
  it.each(['administrador', 'auxiliar administrativo', 'administrador financiero'])('rechaza rol %s al consultar documentos', async (nombre) => {
    await expect(service.documentos('t', { id: 'x', roles: { nombre } } as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.servicios_complementarios_tramite.findFirst).not.toHaveBeenCalled();
  });
  it('permite una nueva solicitud cuando no hay otra activa', async () => {
    db.servicios_complementarios_tramite.findFirst.mockResolvedValue(null);
    await service.crear({ cliente_id: 'cliente', servicio_id: 1 }, asesor);
    expect(db.servicios_complementarios_tramite.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { cliente_id: 'cliente', estatus_id: { notIn: [6, 8] } } }));
  });
  it('rechaza reactivar cuando existe otro servicio activo', async () => {
    const t = { id: 't', cliente_id: 'cliente', estatus_id: 6, avance_porcentaje: 100 };
    db.servicios_complementarios_tramite.findFirst.mockResolvedValueOnce(t).mockResolvedValueOnce(t).mockResolvedValueOnce({ id: 'otra' });
    await expect(service.seguimiento('t', { estatus_id: 2 }, asesor)).rejects.toBeInstanceOf(ConflictException);
    expect(db.servicios_complementarios_tramite.update).not.toHaveBeenCalled();
  });
  it('desvincula el contrato sin consultar ni alterar contratos', async () => {
    const t = { id: 't', cliente_id: 'cliente', contrato_id: 'contrato', servicio_id: 2, estatus_id: 6 };
    db.servicios_complementarios_tramite.findFirst.mockResolvedValueOnce(t).mockResolvedValueOnce(t).mockResolvedValueOnce(null);
    await service.cambiar('t', { servicio_id: 1, confirmar: true }, asesor);
    expect(db.servicios_complementarios_tramite.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ contrato_id: null }) }));
  });
  it('da de baja preservando solicitud y vínculos', async () => {
    db.servicios_complementarios_tramite.findFirst.mockResolvedValue({ id: 't', cliente_id: 'cliente', estatus_id: 3, avance_porcentaje: 25 });
    await service.baja('t', { confirmar: true }, asesor);
    expect(db.servicios_complementarios_historial.create).toHaveBeenCalledWith({ data: { servicio_tramite_id: 't', estatus_anterior_id: 3, estatus_nuevo_id: 8, cambiado_por: 'asesor' } });
    expect(db.servicios_complementarios_tramite.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.not.objectContaining({ avance_porcentaje: expect.anything() }) }));
    expect(db.servicios_complementarios_documentos.deleteMany).not.toHaveBeenCalled();
    expect(db.servicios_complementarios_avisos.deleteMany).not.toHaveBeenCalled();
    expect(db.servicios_complementarios_tramite.delete).not.toHaveBeenCalled();
    expect(db.documentos_clientes.findFirst).not.toHaveBeenCalled();
  });
  it('rechaza un vínculo duplicado', async () => {
    db.servicios_complementarios_tramite.findFirst.mockResolvedValue({ id: 't', cliente_id: 'cliente' });
    db.documentos_clientes.findFirst.mockResolvedValue({ id: 'doc' });
    db.servicios_complementarios_documentos.findFirst.mockResolvedValue({ id: 'vinculo' });
    await expect(service.vincular('t', 'doc', asesor)).rejects.toBeInstanceOf(ConflictException);
    expect(db.servicios_complementarios_documentos.create).not.toHaveBeenCalled();
  });
  it('rechaza descargas si el documento no pertenece a la solicitud y al cliente', async () => {
    db.servicios_complementarios_tramite.findFirst.mockResolvedValue({ id: 't', cliente_id: 'cliente' });
    db.servicios_complementarios_documentos.findFirst.mockResolvedValue(null);
    await expect(service.descargar('t', 'doc', asesor)).rejects.toBeInstanceOf(NotFoundException);
    expect(db.servicios_complementarios_documentos.findFirst).toHaveBeenCalledWith({ where: { servicio_tramite_id: 't', documento_id: 'doc', documento: { cliente_id: 'cliente' } } });
  });
  it('rechaza servicio ajeno al catálogo complementario', async () => {
    db.servicios.findUnique.mockResolvedValue({ id: 1, activo: true, nombre: 'Otro producto financiero', codigo_folio: 'M10' });
    await expect(service.crear({ cliente_id: 'cliente', servicio_id: 1 }, asesor)).rejects.toBeInstanceOf(BadRequestException);
    expect(db.servicios_complementarios_tramite.create).not.toHaveBeenCalled();
  });
  it('crea servicio personalizado y solicitud en la misma transacción sin folio', async () => {
    db.servicios_complementarios_tramite.findFirst.mockResolvedValue(null);
    db.servicios.create.mockResolvedValue({ id: 42 });
    await service.crearPersonalizado({ cliente_id: 'cliente', nombre: '  Otro trámite  ', descripcion: '  Descripción  ' }, asesor);
    expect(db.servicios.create).toHaveBeenCalledWith({ data: { nombre: 'Otro trámite', descripcion: 'Descripción' }, select: { id: true } });
    expect(db.servicios_complementarios_tramite.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ cliente_id: 'cliente', servicio_id: 42, avance_porcentaje: 10 }) }));
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
  it('rechaza cliente ajeno o con otro trámite antes de crear el servicio', async () => {
    db.$queryRaw.mockResolvedValueOnce([]);
    const dto = { cliente_id: 'cliente', nombre: 'Otro', descripcion: 'Descripción' };
    await expect(service.crearPersonalizado(dto, asesor)).rejects.toBeInstanceOf(NotFoundException);
    db.servicios_complementarios_tramite.findFirst.mockResolvedValue({ id: 'activo' });
    await expect(service.crearPersonalizado(dto, asesor)).rejects.toBeInstanceOf(ConflictException);
    expect(db.servicios.create).not.toHaveBeenCalled();
  });
  it('traduce el nombre duplicado en conflicto', async () => {
    db.servicios_complementarios_tramite.findFirst.mockResolvedValue(null);
    db.servicios.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'test' }));
    await expect(service.crearPersonalizado({ cliente_id: 'cliente', nombre: 'Duplicado', descripcion: 'Descripción' }, asesor)).rejects.toBeInstanceOf(ConflictException);
    expect(db.servicios_complementarios_tramite.create).not.toHaveBeenCalled();
  });
  it('incluye servicios activos sin folio en catálogo y permite seleccionarlos', async () => {
    db.servicios.findMany.mockResolvedValue([{ id: 42, nombre: 'Otro trámite', descripcion: 'Descripción', codigo_folio: null }, { id: 2, nombre: 'Modalidad 10', descripcion: null, codigo_folio: 'M10' }]);
    expect((await service.catalogos(asesor)).servicios).toEqual([{ id: 42, nombre: 'Otro trámite', descripcion: 'Descripción' }]);
    db.servicios.findUnique.mockResolvedValue({ id: 42, nombre: 'Otro trámite', activo: true, codigo_folio: null });
    db.servicios_complementarios_tramite.findFirst.mockResolvedValue(null);
    await service.crear({ cliente_id: 'cliente', servicio_id: 42 }, asesor);
    expect(db.servicios_complementarios_tramite.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ servicio_id: 42 }) }));
  });
  it.each([[2, 10], [3, 25], [4, 50], [5, 75], [6, 100]])('aplica estado %i y avance %i', async (estatus_id, porcentaje) => {
    const t = { id: 't', cliente_id: 'cliente', estatus_id: 2, avance_porcentaje: 10 };
    db.servicios_complementarios_tramite.findFirst.mockResolvedValueOnce(t).mockResolvedValueOnce(t).mockResolvedValueOnce(null);
    await service.seguimiento('t', { estatus_id }, asesor);
    expect(db.servicios_complementarios_tramite.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ estatus_id, avance_porcentaje: porcentaje }) }));
  });
  it('rechaza cambiar el seguimiento de una solicitud dada de baja', async () => {
    db.servicios_complementarios_tramite.findFirst.mockResolvedValue({ id: 't', cliente_id: 'cliente', estatus_id: 8 });
    await expect(service.seguimiento('t', { estatus_id: 2 }, asesor)).rejects.toBeInstanceOf(ConflictException);
  });
  it('crea evento, aviso y vínculo de alerta del cliente autorizado', async () => {
    db.servicios_complementarios_tramite.findFirst.mockResolvedValue({ id: 't', cliente_id: 'cliente' });
    const result = await service.alerta('t', { motivo: ' Seguimiento ', fecha: '2026-12-01' }, asesor);
    expect(db.eventos_agenda.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ cliente_id: 'cliente', asesor_id: 'asesor', motivo: 'Seguimiento', fecha: new Date('2026-12-01T00:00:00.000Z') }) }));
    expect(db.avisos.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tipo: 'tramite', evento_id: 'evento', fecha_alerta: new Date('2026-12-01T05:00:00.000Z') }) }));
    expect(db.servicios_complementarios_avisos.create).toHaveBeenCalledWith(expect.objectContaining({ data: { servicio_tramite_id: 't', aviso_id: 'aviso' } }));
    expect(result.id).toBe('vinculo');
  });
  it('detiene alerta cuando falla la creación del aviso', async () => {
    db.servicios_complementarios_tramite.findFirst.mockResolvedValue({ id: 't', cliente_id: 'cliente' });
    db.avisos.create.mockRejectedValue(new Error('fallo'));
    await expect(service.alerta('t', { motivo: 'Seguimiento', fecha: '2026-12-01' }, asesor)).rejects.toThrow('fallo');
    expect(db.servicios_complementarios_avisos.create).not.toHaveBeenCalled();
  });
  it('no crea alertas para solicitudes ajenas', async () => {
    db.servicios_complementarios_tramite.findFirst.mockResolvedValue(null);
    await expect(service.alerta('t', { motivo: 'Seguimiento', fecha: '2026-12-01' }, asesor)).rejects.toBeInstanceOf(NotFoundException);
    expect(db.eventos_agenda.create).not.toHaveBeenCalled();
  });
  it('propaga fallo del vínculo de alerta a la transacción', async () => {
    db.servicios_complementarios_tramite.findFirst.mockResolvedValue({ id: 't', cliente_id: 'cliente' });
    db.servicios_complementarios_avisos.create.mockRejectedValue(new Error('vínculo fallido'));
    await expect(service.alerta('t', { motivo: 'Seguimiento', fecha: '2026-12-01' }, asesor)).rejects.toThrow('vínculo fallido');
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
});
