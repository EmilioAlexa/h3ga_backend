import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { GestionAuxiliaresService } from './gestion-auxiliares.service';

const asesor = { id: '11111111-1111-4111-8111-111111111111', roles: { nombre: 'asesor' } };
const auxiliar = { id: '22222222-2222-4222-8222-222222222222', roles: { nombre: 'auxiliar administrativo' } };

describe('GestionAuxiliaresService', () => {
  it('limita al asesor a sus clientes y selecciona usuario_auxiliar', async () => {
    const findMany = jest.fn().mockResolvedValue([{ usuario_auxiliar: { id: auxiliar.id } }]);
    const service = new GestionAuxiliaresService({ cliente_auxiliares: { findMany } } as any);
    expect(await service.findAsignaciones({}, asesor)).toEqual([{ usuario_auxiliar: { id: auxiliar.id } }]);
    expect(findMany.mock.calls[0][0]).toMatchObject({ where: { clientes: { asesor_id: asesor.id } }, include: { usuario_auxiliar: { select: { id: true } } } });
  });
  it.each([undefined, false, true])('limita al auxiliar a asignaciones activas aun con activo=%s', async (activo) => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new GestionAuxiliaresService({ cliente_auxiliares: { findMany } } as any);
    await service.findAsignaciones({ activo }, auxiliar);
    expect(findMany.mock.calls[0][0].where).toMatchObject({ auxiliar_id: auxiliar.id, activo: true });
  });
  it('deniega asignaciones al administrador', async () => {
    const service = new GestionAuxiliaresService({} as any);
    await expect(service.findAsignaciones({}, { ...asesor, roles: { nombre: 'administrador' } })).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('deniega al auxiliar la consulta de auxiliares disponibles', async () => {
    const service = new GestionAuxiliaresService({} as any);
    await expect(service.listAuxiliares(auxiliar)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('no permite crear una tarea sin asignación activa', async () => {
    const prisma = {
      clientes: { findFirst: jest.fn().mockResolvedValue({ id: 'cliente' }) },
      cliente_auxiliares: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new GestionAuxiliaresService(prisma as any);
    await expect(service.createTarea({ cliente_id: 'cliente', auxiliar_id: auxiliar.id, titulo: 'Documento', instrucciones: 'Preparar' }, asesor)).rejects.toBeInstanceOf(BadRequestException);
  });
});
