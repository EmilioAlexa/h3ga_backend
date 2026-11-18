import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ClientesService } from './clientes.service';

const titular = '91ef1a6e-2496-44d2-a52f-1d5f096c4087';
const referidor = '2b632629-a062-4c42-a309-c725c45df6d3';
const advisor = { id: '20c3217f-af16-4b74-89c1-3beed3581427', roles: { nombre: 'asesor' } };
const admin = { id: '0f541db8-55a0-4d29-a9a8-d04c654b4520', roles: { nombre: 'administrador financiero' } };

describe('ClientesService referral policy', () => {
  let prisma: Record<string, any>;
  let tx: Record<string, any>;
  let service: ClientesService;

  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn(async () => [{ id: titular }]),
      clientes: {
        findUnique: jest.fn(async ({ where }: any) => where.id === referidor ? { id: referidor, asesor_id: advisor.id } : null),
        findUniqueOrThrow: jest.fn(async () => ({ referido_por_cliente_id: null })),
        create: jest.fn(async () => ({ id: titular })),
        update: jest.fn(async ({ data }: any) => ({ id: titular, referido_por_cliente_id: data.referido_por_cliente_id })),
      },
      historial_referidor_cliente: { create: jest.fn(async ({ data }: any) => data) },
    };
    prisma = {
      $queryRaw: jest.fn(async () => [{ ready: true }]),
      $transaction: jest.fn(async (fn: (value: any) => unknown) => fn(tx)),
      usuarios: { findUnique: jest.fn(async () => ({ activo: true, roles: { nombre: 'asesor' } })) },
      clientes: { create: jest.fn(async () => ({ id: titular })) },
    };
    service = new ClientesService(prisma as any);
  });

  it('creates with an optional same-advisor referrer and audits the initial link', async () => {
    await service.create({ nombre: 'Titular', apellido_paterno: 'Prueba', referido_por_cliente_id: referidor }, advisor);
    expect(tx.clientes.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ referido_por_cliente_id: referidor }) }));
    expect(tx.historial_referidor_cliente.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ cliente_id: titular, referidor_anterior_id: null, referidor_nuevo_id: referidor, actor_id: advisor.id }) }));
  });

  it('does not allow an advisor to link a client assigned to someone else', async () => {
    tx.clientes.findUnique.mockResolvedValue({ id: referidor, asesor_id: 'otro-asesor' });
    await expect(service.create({ nombre: 'Titular', apellido_paterno: 'Prueba', referido_por_cliente_id: referidor }, advisor)).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.clientes.create).not.toHaveBeenCalled();
  });

  it('allows an administrator to change the referrer with actor, reason and before/after audit', async () => {
    const result = await service.setReferidor(titular, referidor, 'Corrección verificada', admin);
    expect(result.referido_por_cliente_id).toBe(referidor);
    expect(tx.historial_referidor_cliente.create).toHaveBeenCalledWith(expect.objectContaining({ data: {
      cliente_id: titular, referidor_anterior_id: null, referidor_nuevo_id: referidor,
      actor_id: admin.id, motivo: 'Corrección verificada',
    } }));
  });

  it('blocks advisor changes, self-referral, absent values and no-op history', async () => {
    await expect(service.setReferidor(titular, referidor, 'Cambio', advisor)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.setReferidor(titular, titular, 'Cambio', admin)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.setReferidor(titular, undefined, 'Cambio', admin)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.setReferidor(titular, null, 'Cambio', admin)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.historial_referidor_cliente.create).not.toHaveBeenCalled();
  });
});
