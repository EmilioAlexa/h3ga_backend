import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ClientesService } from './clientes.service';
import { Prisma } from '../generated/prisma/client';

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

describe('ClientesService retiro seguro', () => {
  const id = titular;
  const actor = { id: admin.id, roles: { nombre: 'administrador' } };
  const catalog = [{ esquema: 'public', tabla: 'contratos', columna: 'cliente_id', restriccion: 'fk_contratos_cliente', on_delete: 'NO ACTION', columnas_clave: 1 }];
  const tx = {
    $queryRaw: jest.fn(), $executeRaw: jest.fn(),
    clientes: { findUnique: jest.fn(), delete: jest.fn() },
  };
  const prisma = { $transaction: jest.fn(async (fn: (db: typeof tx) => Promise<unknown>) => fn(tx)) };
  const service = new ClientesService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.clientes.delete.mockResolvedValue({ id });
    tx.$executeRaw.mockResolvedValue(1);
  });

  it('registra actor y UUID antes de borrar; ambos forman una sola transacción', async () => {
    tx.$queryRaw.mockResolvedValueOnce([{ id }]).mockResolvedValueOnce(catalog)
      .mockResolvedValueOnce([{ cantidad: 0 }]).mockResolvedValueOnce([{ ready: true }]);
    await service.deleteWithoutDependencies(id, actor);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const auditSql = tx.$executeRaw.mock.calls[0][0] as Prisma.Sql;
    expect(auditSql.sql).toContain('INSERT INTO "clientes_eliminaciones"');
    expect(auditSql.values).toEqual([id, actor.id]);
    expect(tx.clientes.delete).toHaveBeenCalledWith({ where: { id } });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('devuelve dependencias estructuradas y no escribe ni borra', async () => {
    tx.$queryRaw.mockResolvedValueOnce([{ id }]).mockResolvedValueOnce(catalog)
      .mockResolvedValueOnce([{ cantidad: 1 }]);
    await expect(service.deleteWithoutDependencies(id, actor)).rejects.toMatchObject({
      response: expect.objectContaining({ codigo: 'CLIENTE_CON_DEPENDENCIAS' }),
    });
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.clientes.delete).not.toHaveBeenCalled();
  });

  it('convierte una FK concurrente en 409 y deja el rollback al gestor de transacciones', async () => {
    tx.$queryRaw.mockResolvedValueOnce([{ id }]).mockResolvedValueOnce(catalog)
      .mockResolvedValueOnce([{ cantidad: 0 }]).mockResolvedValueOnce([{ ready: true }]);
    tx.clientes.delete.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('FK', {
      code: 'P2003', clientVersion: '7.10.1',
    }));
    await expect(service.deleteWithoutDependencies(id, actor)).rejects.toMatchObject({
      response: expect.objectContaining({ codigo: 'DEPENDENCIA_CONCURRENTE' }),
    });
  });

  it('rechaza roles no autorizados antes de abrir una transacción', async () => {
    await expect(service.deleteWithoutDependencies(id, advisor)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('bloquea una FK desde otro esquema hasta revisar su política de borrado', async () => {
    tx.$queryRaw.mockResolvedValueOnce([{ id }]).mockResolvedValueOnce([{ ...catalog[0], esquema: 'otro_esquema' }]);
    await expect(service.deleteWithoutDependencies(id, actor)).rejects.toMatchObject({
      response: expect.objectContaining({ codigo: 'ESQUEMA_NO_COMPATIBLE' }),
    });
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.clientes.delete).not.toHaveBeenCalled();
  });
});
