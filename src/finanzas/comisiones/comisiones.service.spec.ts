import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ComisionesService } from './comisiones.service';

const admin = { id: 'admin', activo: true, roles: { nombre: 'administrador' } };
const advisor = { id: 'advisor', activo: true, roles: { nombre: 'asesor' } };

describe('ComisionesService destination policy', () => {
  let prisma: Record<string, any>;
  let service: ComisionesService;

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn(async () => [{ ready: false }]),
      conceptos_dispersion: {
        findUnique: jest.fn(async ({ where }: any) => ({ id: where.id, nombre: 'Director', activo: true, es_remanente: false })),
        findMany: jest.fn(async () => [{ id: 1, nombre: 'IMSS', activo: true, es_remanente: false, tipo_destino: 'externo' }]),
      },
      usuarios: { findUnique: jest.fn(async () => null) },
      receptores_dispersion: { create: jest.fn(async ({ data }: any) => data) },
      contratos: { findUnique: jest.fn(async () => ({ id: 'contract', asesor_id: 'advisor', servicios: { codigo_folio: 'APD' } })) },
    };
    service = new ComisionesService(prisma as any, {} as any, { getOrThrow: () => 10 } as any);
  });

  it('accepts a manual Director without linking an Asesor user', async () => {
    const row = await service.createReceptor({ concepto_id: 1, nombre_externo: '  Directora Prueba  ' }, admin);
    expect(row).toMatchObject({ usuario_id: null, nombre_externo: 'Directora Prueba' });
  });

  it('rejects an Asesor user as Director and prevents advisor assignment', async () => {
    await expect(service.createReceptor({ concepto_id: 1, usuario_id: 'advisor' }, admin)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createReceptor({ concepto_id: 1, nombre_externo: 'Prueba' }, advisor)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.receptores_dispersion.create).not.toHaveBeenCalled();
  });

  it('blocks free-text Referidor until a client relation exists', async () => {
    prisma.conceptos_dispersion.findUnique.mockResolvedValue({ id: 2, nombre: 'Referidor', activo: true, es_remanente: false });
    await expect(service.createReceptor({ concepto_id: 2, nombre_externo: 'Texto libre' }, admin)).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows Otro only with a nonempty manual description and no user', async () => {
    prisma.conceptos_dispersion.findUnique.mockResolvedValue({ id: 8, nombre: 'Otro', activo: true, es_remanente: false });
    await expect(service.createReceptor({ concepto_id: 8, nombre_externo: '   ' }, admin)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createReceptor({ concepto_id: 8, usuario_id: 'advisor', nombre_externo: 'Destino' }, admin)).rejects.toBeInstanceOf(BadRequestException);
    const row = await service.createReceptor({ concepto_id: 8, nombre_externo: '  Descripción prueba  ' }, admin);
    expect(row).toMatchObject({ usuario_id: null, nombre_externo: 'Descripción prueba' });
  });

  it('rejects an arbitrary receiver for Referidor configuration', async () => {
    prisma.conceptos_dispersion.findMany.mockResolvedValue([{ id: 5, nombre: 'Referidor', activo: true, es_remanente: false, tipo_destino: 'externo' }]);
    await expect(service.saveConfiguracion('contract', { configuracion: [{ concepto_id: 5, receptor_dispersion_id: 'receiver', valor: '5.0' }] }, admin)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects IMSS on APD and requires an explicit positive percentage on M10', async () => {
    await expect(service.saveConfiguracion('contract', { configuracion: [{ concepto_id: 1, valor: '5.0' }] }, admin)).rejects.toBeInstanceOf(BadRequestException);
    prisma.contratos.findUnique.mockResolvedValue({ id: 'contract', asesor_id: 'advisor', servicios: { codigo_folio: 'M10' } });
    await expect(service.saveConfiguracion('contract', { configuracion: [] }, admin)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.saveConfiguracion('contract', { configuracion: [{ concepto_id: 1, valor: '0.0' }] }, admin)).rejects.toBeInstanceOf(BadRequestException);
  });
});
