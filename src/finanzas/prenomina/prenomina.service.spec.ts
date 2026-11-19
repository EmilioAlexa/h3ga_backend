import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrenominasService } from './prenomina.service';

const admin = { id: 'admin-id', activo: true, roles: { nombre: 'administrador' } };

function commission(overrides: Record<string, unknown> = {}) {
  return {
    id: 'commission-1',
    pago_id: 'payment-1',
    monto_base: new Prisma.Decimal('1000.00'),
    monto_comision: new Prisma.Decimal('125.50'),
    valor_aplicado: new Prisma.Decimal('12.55'),
    tipo_calculo: 'porcentaje',
    fecha_calculo: new Date('2026-11-06T12:00:00.000Z'),
    receptor_nombre_snapshot: 'Receptor de prueba',
    beneficiario_id: null,
    receptor_dispersion_id: 'receiver-id',
    receptor_cliente_id: null,
    detalle_prenomina_id: null,
    conceptos_dispersion: {
      id: 5,
      nombre: 'Referidor',
      tipo_destino: 'externo',
      incluye_en_prenomina: true,
      es_remanente: false,
    },
    pagos: {
      id: 'payment-1',
      fecha_pago: new Date('2026-11-06T12:00:00.000Z'),
      monto: new Prisma.Decimal('1000.00'),
      folio_recibo: null,
      referencia_pago: 'REF-1',
      formas_pago: { id: 1, nombre: 'Transferencia' },
      contratos: {
        id: 'contract-id',
        folio: 'CONTRACT-1',
        clientes: { id: 'client-id', nombre: 'Cliente', apellido_paterno: null, apellido_materno: null },
        servicios: { id: 1, nombre: 'Modalidad 10' },
        usuarios: { id: 'advisor-id', nombre: 'Asesor', apellido_paterno: null, apellido_materno: null },
      },
    },
    ...overrides,
  };
}

describe('PrenominasService', () => {
  it('denies prenomina operations to advisors', async () => {
    const service = new PrenominasService({} as never);
    await expect(
      service.findAll({ page: 1, limit: 20 } as never, {
        ...admin,
        roles: { nombre: 'asesor' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('previews person commissions separately and groups them by recipient and concept', async () => {
    const rows = [
      commission(),
      commission({ id: 'commission-2', monto_comision: new Prisma.Decimal('10.00') }),
    ];
    const prisma = {
      cortes_financieros: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cut-id',
          numero_corte: 24,
          fecha_inicio: new Date('2026-11-06T05:00:00.000Z'),
          fecha_fin: new Date('2026-11-13T05:00:00.000Z'),
          estados_corte: { nombre: 'Cerrado' },
        }),
      },
      prenomina: { findUnique: jest.fn().mockResolvedValue(null) },
      detalle_corte: { findMany: jest.fn().mockResolvedValue([{ pago_id: 'payment-1' }]) },
      comisiones: { findMany: jest.fn().mockResolvedValue(rows) },
    };
    const service = new PrenominasService(prisma as never);

    const result = await service.preview('cut-id', admin);

    expect(result.comisiones_elegibles).toBe(2);
    expect(result.total_referencial).toBe('135.50');
    expect(result.por_receptor).toEqual([
      expect.objectContaining({
        destino: 'Referidor',
        receptor: 'Receptor de prueba',
        movimientos: 2,
        monto_referencial: '135.50',
      }),
    ]);
    expect(prisma.comisiones.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          detalle_prenomina_id: null,
          conceptos_dispersion: expect.objectContaining({
            incluye_en_prenomina: true,
            es_remanente: false,
            nombre: { not: 'IMSS' },
          }),
        }),
      }),
    );
  });

  it('creates grouped details and attaches each source commission atomically', async () => {
    const row = commission();
    const tx = {
      cortes_financieros: {
        findUnique: jest.fn().mockResolvedValue({ estados_corte: { nombre: 'Cerrado' } }),
      },
      estados_prenomina: { findUnique: jest.fn().mockResolvedValue({ id: 17, nombre: 'Estado existente' }) },
      prenomina: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'prenomina-id' }),
      },
      detalle_corte: { findMany: jest.fn().mockResolvedValue([{ pago_id: 'payment-1' }]) },
      comisiones: {
        findMany: jest.fn().mockResolvedValue([row]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      detalle_prenomina: { create: jest.fn().mockResolvedValue({ id: 'detail-id' }) },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
      prenomina: { findUnique: jest.fn() },
    };
    const service = new PrenominasService(prisma as never);
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'prenomina-id' } as never);

    await service.generate('cut-id', { estado_id: 17 }, admin);

    expect(tx.prenomina.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          corte_id: 'cut-id',
          estado_id: 17,
          total_referencial: new Prisma.Decimal('125.50'),
        }),
      }),
    );
    expect(tx.detalle_prenomina.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          beneficiario_id: null,
          receptor_dispersion_id: 'receiver-id',
          concepto_id: 5,
          receptor_nombre_snapshot: 'Receptor de prueba',
        }),
      }),
    );
    expect(tx.comisiones.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['commission-1'] }, detalle_prenomina_id: null },
      data: { detalle_prenomina_id: 'detail-id' },
    });
  });

  it('keeps homonymous Referidor clients in separate groups by UUID', async () => {
    const rows = [
      commission({ id: 'commission-a', receptor_dispersion_id: null, receptor_cliente_id: 'client-ref-a' }),
      commission({ id: 'commission-b', receptor_dispersion_id: null, receptor_cliente_id: 'client-ref-b' }),
    ];
    const tx = {
      cortes_financieros: { findUnique: jest.fn().mockResolvedValue({ id: 'cut-id', estados_corte: { nombre: 'Cerrado' } }) },
      estados_prenomina: { findUnique: jest.fn().mockResolvedValue({ id: 17 }) },
      prenomina: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'pren-id' }) },
      detalle_corte: { findMany: jest.fn().mockResolvedValue([{ pago_id: 'payment-1' }]) },
      comisiones: { findMany: jest.fn().mockResolvedValue(rows), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      detalle_prenomina: { create: jest.fn().mockResolvedValueOnce({ id: 'detail-a' }).mockResolvedValueOnce({ id: 'detail-b' }) },
    };
    const prisma = {
      cortes_financieros: tx.cortes_financieros,
      prenomina: tx.prenomina,
      detalle_corte: tx.detalle_corte,
      comisiones: tx.comisiones,
      $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
    };
    const service = new PrenominasService(prisma as never);
    const preview = await service.preview('cut-id', admin);
    expect(preview.por_receptor).toHaveLength(2);
    expect(preview.por_receptor.map(row => row.receptor_cliente_id)).toEqual(['client-ref-a', 'client-ref-b']);
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'pren-id' } as never);
    await service.generate('cut-id', { estado_id: 17 }, admin);
    expect(tx.detalle_prenomina.create).toHaveBeenCalledTimes(2);
    expect(tx.detalle_prenomina.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({ receptor_cliente_id: 'client-ref-a', receptor_dispersion_id: null }),
    }));
    expect(tx.detalle_prenomina.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: expect.objectContaining({ receptor_cliente_id: 'client-ref-b', receptor_dispersion_id: null }),
    }));
    expect(tx.comisiones.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: { in: ['commission-a'] }, detalle_prenomina_id: null }, data: { detalle_prenomina_id: 'detail-a' },
    });
    expect(tx.comisiones.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: { in: ['commission-b'] }, detalle_prenomina_id: null }, data: { detalle_prenomina_id: 'detail-b' },
    });
  });

  it('preserves grouping by user and configured receiver for other personal destinations', async () => {
    const rows = [
      commission({ id: 'advisor-a', beneficiario_id: 'advisor-id', receptor_dispersion_id: null,
        receptor_cliente_id: null, conceptos_dispersion: { id: 1, nombre: 'Asesor', tipo_destino: 'usuario', incluye_en_prenomina: true, es_remanente: false } }),
      ...(['Director', 'Gerente', 'Bróker'] as const).map((name, index) => commission({
        id: `manual-${index}`, receptor_dispersion_id: `receiver-${index}`, receptor_cliente_id: null,
        conceptos_dispersion: { id: index + 2, nombre: name, tipo_destino: 'externo', incluye_en_prenomina: true, es_remanente: false },
      })),
    ];
    const prisma = {
      cortes_financieros: { findUnique: jest.fn().mockResolvedValue({ id: 'cut-id', estados_corte: { nombre: 'Cerrado' } }) },
      prenomina: { findUnique: jest.fn().mockResolvedValue(null) },
      detalle_corte: { findMany: jest.fn().mockResolvedValue([{ pago_id: 'payment-1' }]) },
      comisiones: { findMany: jest.fn().mockResolvedValue(rows) },
    };
    const result = await new PrenominasService(prisma as never).preview('cut-id', admin);
    expect(result.por_receptor).toHaveLength(4);
    expect(result.por_receptor.map(row => row.destino).sort((a, b) => a.localeCompare(b))).toEqual(['Asesor', 'Bróker', 'Director', 'Gerente']);
    expect(result.por_receptor.every(row => row.receptor_cliente_id === null)).toBe(true);
  });
});
