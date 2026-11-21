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
      $queryRaw: jest.fn(async (query: { strings: string[] }) => {
        const sql = query.strings.join('');
        if (sql.includes('FOR UPDATE')) return [{ id: customerId, pausado: false }];
        if (sql.includes('clock_timestamp')) return [{ instante: new Date('2026-11-09T12:00:00Z'), anio: 2026 }];
        if (sql.includes('INSERT INTO')) return [{ ultimo: 1n }];
        return [];
      }),
      clientes: { findUnique: jest.fn(async () => ({ id: customerId })) },
      servicios: { findUnique: jest.fn(async () => ({ id: 1, codigo_folio: 'APD' })) },
      estados_contratos: { findUnique: jest.fn(async () => ({ id: 1 })) },
      usuarios: {
        findUnique: jest.fn(async ({ where }: any) => ({
          id: where.id,
          activo: true,
          roles: { nombre: 'asesor' },
        })),
      },
      contratos: {
        findFirst: jest.fn(async () => null),
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

  it.each([
    ['M10', {monto_mensual:'1200.50',periodo_contrato:'12 meses'}, 'seguimiento_m10'],
    ['M40', {monto_mensual:'1500.25',salario_diario:'300.00',periodo_contrato:'6 meses',fecha_fin:new Date('2027-05-09')}, 'seguimiento_m40'],
    ['M40R', {salario_diario:'300.00'}, 'seguimiento_m40_retroactiva'],
  ])('persists explicit %s conditions inside contract creation without scheduling payments', async (code, conditions, relation) => {
    tx.servicios.findUnique.mockResolvedValueOnce({id:1,codigo_folio:code});
    await service.create({cliente_id:customerId,servicio_id:1,fecha_contrato:new Date('2026-11-09'),estado_contrato_id:1,...conditions} as any, {id:advisorId,activo:true,roles:{nombre:'asesor'}});
    const data = tx.contratos.create.mock.calls[0][0].data;
    expect(data[relation].create).toMatchObject(code === 'M40' ? {cantidad_meses:6,salario_diario:'300.00',monto_mensual:'1500.25'} : conditions);
    expect(data.pagos_programados).toBeUndefined();
    expect(data.comisiones).toBeUndefined();
  });

  it('rejects incompatible APD financial fields before saving the contract', async () => {
    await expect(service.create({cliente_id:customerId,servicio_id:1,fecha_contrato:new Date('2026-11-09'),estado_contrato_id:1,salario_diario:'300.00'} as any,{id:advisorId,activo:true,roles:{nombre:'asesor'}})).rejects.toThrow('Salario diario no disponible');
    expect(tx.contratos.create).not.toHaveBeenCalled();
  });

  it.each(['Cambaceo','Marketing'])('stores the real APD sale type %s without generating obligations', async (name) => {
    tx.tipos_venta = {findUnique:jest.fn().mockResolvedValue({id:77,nombre:name,activo:true})};
    await service.create({cliente_id:customerId,servicio_id:1,fecha_contrato:new Date('2026-11-09'),estado_contrato_id:1,tipo_venta_id:77} as any,{id:advisorId,activo:true,roles:{nombre:'asesor'}});
    expect(tx.contratos.create.mock.calls[0][0].data.seguimiento_apd).toEqual({create:{tipo_venta_id:77}});
    expect(tx.contratos.create.mock.calls[0][0].data.pagos_programados).toBeUndefined();
  });
  it.each(['M10','M40','M40R'])('rejects APD sale type on %s', async (code) => {
    tx.servicios.findUnique.mockResolvedValue({id:1,codigo_folio:code});
    await expect(service.create({cliente_id:customerId,servicio_id:1,fecha_contrato:new Date('2026-11-09'),estado_contrato_id:1,tipo_venta_id:77} as any,{id:advisorId,activo:true,roles:{nombre:'asesor'}})).rejects.toThrow('solo almacena tipo de venta en APD');
    expect(tx.contratos.create).not.toHaveBeenCalled();
  });
  it('rejects inactive sale types and exposes only real authorized options', async () => {
    tx.tipos_venta = {findUnique:jest.fn().mockResolvedValue({id:77,nombre:'Marketing',activo:false})};
    await expect(service.create({cliente_id:customerId,servicio_id:1,fecha_contrato:new Date('2026-11-09'),estado_contrato_id:1,tipo_venta_id:77} as any,{id:advisorId,activo:true,roles:{nombre:'asesor'}})).rejects.toThrow('Tipo de venta no disponible');
    prisma.servicios = {findMany:jest.fn().mockResolvedValue([])};
    prisma.estados_contratos = {findMany:jest.fn().mockResolvedValue([])};
    prisma.tipos_venta = {findMany:jest.fn().mockResolvedValue([])};
    expect((await service.options({id:advisorId,activo:true,roles:{nombre:'asesor'}})).tipos_venta).toEqual([]);
    await expect(service.options({id:advisorId,activo:false,roles:{nombre:'asesor'}})).rejects.toMatchObject({status:403});
    await expect(service.options({id:advisorId,activo:true,roles:{nombre:'auxiliar administrativo'}})).rejects.toMatchObject({status:403});
  });
  it.each(['APD','M40R','M10','M40'])('creates %s independently of the pending document schema',async(code)=>{
    service=new ContratosService(prisma as any,{capabilities:jest.fn().mockRejectedValue(new Error('document schema pending'))} as any);
    tx.servicios.findUnique.mockResolvedValue({id:1,codigo_folio:code});
    await service.create({cliente_id:customerId,servicio_id:1,fecha_contrato:new Date('2026-11-09'),estado_contrato_id:1} as any,{id:advisorId,activo:true,roles:{nombre:'asesor'}});
    expect(tx.contratos.create).toHaveBeenCalledTimes(1);
  });
  it('rejects a service without an approved folio code', async () => {
    tx.servicios.findUnique.mockResolvedValueOnce({ id: 1, codigo_folio: null });
    await expect(service.create({
      cliente_id: customerId,
      servicio_id: 1,
      fecha_contrato: new Date('2026-11-09'),
      estado_contrato_id: 1,
    } as any, { id: advisorId, activo: true, roles: { nombre: 'asesor' } }))
      .rejects.toMatchObject({ status: 409 });
    expect(tx.contratos.create).not.toHaveBeenCalled();
  });

  it.each([
    ['APD', '202700001'],
    ['M10', 'M10202700001'],
    ['M40', 'M40202700001'],
    ['M40R', 'M40R202700001'],
  ])('formats %s from the PostgreSQL registration year', async (code, expected) => {
    tx.servicios.findUnique.mockResolvedValueOnce({ id: 1, codigo_folio: code });
    tx.$queryRaw.mockImplementation(async (query: { strings: string[] }) => {
      const sql = query.strings.join('');
      if (sql.includes('FOR UPDATE')) return [{ id: customerId, pausado: false }];
      if (sql.includes('clock_timestamp')) return [{ instante: new Date('2027-01-01T05:00:00Z'), anio: 2027 }];
      if (sql.includes('INSERT INTO')) return [{ ultimo: 1n }];
      return [];
    });
    const result = await service.create({
      cliente_id: customerId,
      servicio_id: 1,
      fecha_contrato: new Date('2026-12-31'),
      estado_contrato_id: 1,
    } as any, { id: advisorId, activo: true, roles: { nombre: 'asesor' } });
    expect(result.folio).toBe(expected);
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
