import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { GestionAuxiliaresService } from './gestion-auxiliares.service';

const asesor = { id: '11111111-1111-4111-8111-111111111111', roles: { nombre: 'asesor' } };
const auxiliar = { id: '22222222-2222-4222-8222-222222222222', roles: { nombre: 'auxiliar administrativo' } };

describe('GestionAuxiliaresService', () => {
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
