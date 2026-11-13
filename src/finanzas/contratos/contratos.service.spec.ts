import { ContratosService } from './contratos.service';

const advisorId = '0ffac71e-e568-450c-8578-d4656a520047';
const anotherAdvisorId = 'db0cbb62-a8ef-4587-8c28-1f3aaf63b20a';
const contractId = 'caf2c963-4531-4998-80d8-655cb904d192';
const customerId = 'e96a633b-2a1e-43c4-a870-ea67de1fb4cd';

describe('ContratosService advisor policy', () => {
  let service: ContratosService;
  let prisma: Record<string, any>;
  let tx: Record<string, any>;
  let contract: Record<string, any>;

  beforeEach(() => {
    contract = {
      id: contractId,
      asesor_id: advisorId,
      observaciones: null,
    };
    tx = {
      clientes: { findUnique: jest.fn(async () => ({ id: customerId })) },
      servicios: { findUnique: jest.fn(async () => ({ id: 1 })) },
      estados_contratos: { findUnique: jest.fn(async () => ({ id: 1 })) },
      usuarios: {
        findUnique: jest.fn(async ({ where }: any) => ({
          id: where.id,
          activo: true,
          roles: { nombre: 'asesor' },
        })),
      },
      contratos: {
        create: jest.fn(async ({ data }: any) => ({ ...contract, ...data })),
      },
    };
    prisma = {
      $transaction: jest.fn(async (callback: (transaction: any) => unknown) =>
        callback(tx),
      ),
      contratos: {
        findMany: jest.fn(async () => [contract]),
        count: jest.fn(async () => 1),
        findFirst: jest.fn(async ({ where }: any) =>
          where.id === contractId && where.asesor_id === advisorId
            ? contract
            : null,
        ),
        updateMany: jest.fn(async ({ where, data }: any) => {
          expect(where).toEqual({ id: contractId, asesor_id: advisorId });
          Object.assign(contract, data);
          return { count: 1 };
        }),
      },
    };
    service = new ContratosService(prisma as any);
  });

  it('uses the authenticated advisor as owner and rejects a supplied owner', async () => {
    const result = await service.create(
      {
        cliente_id: customerId,
        servicio_id: 1,
        folio: 'UNIT-001',
        fecha_contrato: new Date('2026-11-09'),
        estado_contrato_id: 1,
      } as any,
      { id: advisorId, activo: true, roles: { nombre: 'asesor' } },
    );

    expect(result.asesor_id).toBe(advisorId);
    expect(tx.contratos.create.mock.calls[0][0].data.asesor_id).toBe(advisorId);
    await expect(
      service.create(
        {
          cliente_id: customerId,
          servicio_id: 1,
          asesor_id: anotherAdvisorId,
          folio: 'UNIT-002',
          fecha_contrato: new Date('2026-11-09'),
          estado_contrato_id: 1,
        } as any,
        { id: advisorId, activo: true, roles: { nombre: 'asesor' } },
      ),
    ).rejects.toThrow('asesor_id no se acepta');
  });

  it('scopes list, detail, and update to contratos.asesor_id', async () => {
    const user = { id: advisorId, activo: true, roles: { nombre: 'asesor' } };
    await service.findAll({ page: 1, limit: 20 } as any, user);
    expect(prisma.contratos.findMany.mock.calls[0][0].where).toEqual({
      asesor_id: advisorId,
    });
    await service.findOne(contractId, user);
    expect(prisma.contratos.findFirst.mock.calls[0][0].where).toEqual({
      id: contractId,
      asesor_id: advisorId,
    });
    await service.update(contractId, { observaciones: 'Actualización' }, user);
    expect(prisma.contratos.updateMany.mock.calls[0][0].where).toEqual({
      id: contractId,
      asesor_id: advisorId,
    });
  });

  it('returns 404 when an advisor updates another advisor contract', async () => {
    prisma.contratos.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.update(
        contractId,
        { observaciones: 'No permitido' },
        { id: advisorId, activo: true, roles: { nombre: 'asesor' } },
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});
