import { Prisma } from '../../generated/prisma/client';
import { ComisionesService } from './comisiones.service';

describe('Original contractual snapshots remain fixed', () => {
  it('uses each contract configuration only for future payments, preserving earlier snapshots', async () => {
    const percentages: Record<string, string> = { A: '20', B: '30' };
    const snapshots: any[] = [];
    const tx: any = {
      $queryRaw: jest.fn(),
      pagos: { findUnique: jest.fn(async ({ where }: any) => ({
        id: where.id, monto: new Prisma.Decimal('100'), estados_pago: { nombre: 'Validado' },
        contratos: { id: where.id.startsWith('A') ? 'A' : 'B', asesor_id: 'advisor', servicios: { codigo_folio: 'APD' } },
      })) },
      contrato_dispersion_detalle: { findMany: jest.fn(async ({ where }: any) => [{
        id: `config-${where.contrato_id}`, concepto_id: 2, valor: new Prisma.Decimal(percentages[where.contrato_id]),
        tipo_calculo: 'porcentaje', base_calculo: 'monto_bruto', conceptos_dispersion: { nombre: 'Director' }, receptores_dispersion: null,
      }]) },
      estados_comisiones: { findUnique: jest.fn(async () => ({ id: 1 })) },
      conceptos_dispersion: { findFirst: jest.fn(async () => ({ id: 7 })) },
      comisiones: { create: jest.fn(async ({ data }: any) => {
        const snapshot = { ...data, id: `snapshot-${snapshots.length}` };
        snapshots.push(snapshot); return { id: snapshot.id };
      }) },
      historial_estados_comisiones: { create: jest.fn() },
    };
    const service = new ComisionesService({} as any, {} as any, { getOrThrow: () => 10 } as any);
    await service.generateForValidatedPayment(tx, 'A-first', 'admin');
    const historical = snapshots.map(s => ({ ...s, monto_comision: s.monto_comision.toString(), valor_aplicado: s.valor_aplicado.toString() }));
    percentages.A = '40';
    await service.generateForValidatedPayment(tx, 'A-future', 'admin');
    await service.generateForValidatedPayment(tx, 'B-first', 'admin');
    expect(snapshots.filter(s => s.concepto_id === 2).map(s => s.monto_comision.toString())).toEqual(['20', '40', '30']);
    expect(snapshots.slice(0, 2).map(s => ({ ...s, monto_comision: s.monto_comision.toString(), valor_aplicado: s.valor_aplicado.toString() }))).toEqual(historical);
    expect(tx.contrato_dispersion_detalle.findMany.mock.calls.map((c: any) => c[0].where.contrato_id)).toEqual(['A', 'A', 'B']);
    expect(tx.historial_estados_comisiones.create).toHaveBeenCalledTimes(6);
    expect(tx.comisiones.update).toBeUndefined();
    expect(tx.comisiones.delete).toBeUndefined();
  });
});
