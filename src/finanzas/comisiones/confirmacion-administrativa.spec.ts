import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ComisionesService } from './comisiones.service';

describe('Administrative confirmation without bank evidence', () => {
  const admin = { id: 'actor', activo: true, roles: { nombre: 'administrador' } };
  let tx: any;
  let service: ComisionesService;
  beforeEach(() => {
    const rows = [1, 2].map(id => ({ id: `commission-${id}`, estado_id: 1,
      monto_comision: { toFixed: () => '25.00' }, valor_aplicado: { toString: () => '25' },
      conceptos_dispersion: { nombre: id === 1 ? 'Asesor' : 'Empresa' },
      estados_comisiones: { nombre: 'Pendiente de dispersión' },
      receptor_nombre_snapshot: null, dispersiones_comision: null, detalle_prenomina_id: null }));
    tx = { $queryRaw: jest.fn(), pagos: { findUnique: jest.fn(async () => ({ estados_pago: { nombre: 'Validado' } })) },
      comisiones: { findMany: jest.fn(async () => rows), updateMany: jest.fn(async () => ({ count: 1 })) },
      cortes_pagos_reservados: { count: jest.fn(async () => 0) },
      estados_comisiones: { findUnique: jest.fn(async () => ({ id: 2 })) },
      historial_estados_comisiones: { create: jest.fn() } };
    service = new ComisionesService({ $transaction: (fn: any) => fn(tx) } as any,
      {} as any, { getOrThrow: () => 10 } as any);
  });
  it('previews without writes', async () => {
    const result = await service.administrativeDistribution('pay', admin);
    expect(result).toHaveProperty('conceptos');
    expect(tx.comisiones.updateMany).not.toHaveBeenCalled();
  });
  it('confirms every pending concept with amount and actor audited, no storage', async () => {
    await service.administrativeDistribution('pay', admin, ['commission-1', 'commission-2'], true);
    expect(tx.comisiones.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.historial_estados_comisiones.create.mock.calls[0][0].data).toMatchObject({ cambiado_por: 'actor' });
    expect(JSON.parse(tx.historial_estados_comisiones.create.mock.calls[0][0].data.comentario))
      .toMatchObject({ operacion: 'confirmacion_administrativa', importe: '25.00' });
  });
  it('rejects all before any update when reserved', async () => {
    tx.cortes_pagos_reservados.count.mockResolvedValue(1);
    await expect(service.administrativeDistribution('pay', admin, ['commission-1', 'commission-2'], true)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.comisiones.updateMany).not.toHaveBeenCalled();
  });
  it('rejects stale general selection even if only one pending was requested', async () => {
    await expect(service.administrativeDistribution('pay', admin, ['commission-1'], true)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.comisiones.updateMany).not.toHaveBeenCalled();
  });
  it('rejects repeated confirmation and consolidated payroll', async () => {
    const rows = await tx.comisiones.findMany();
    rows[0].estados_comisiones.nombre = 'Dispersada';
    await expect(service.administrativeDistribution('pay', admin, ['commission-1'])).rejects.toBeInstanceOf(ConflictException);
    rows[0].estados_comisiones.nombre = 'Pendiente de dispersión';
    rows[0].detalle_prenomina_id = 'payroll';
    await expect(service.administrativeDistribution('pay', admin, ['commission-1'])).rejects.toBeInstanceOf(ConflictException);
    expect(tx.comisiones.updateMany).not.toHaveBeenCalled();
  });
  it('rejects advisor without accessing the transaction', async () => {
    await expect(service.administrativeDistribution('pay', { ...admin, roles: { nombre: 'asesor' } }, ['commission-1'])).rejects.toBeInstanceOf(ForbiddenException);
  });
});
