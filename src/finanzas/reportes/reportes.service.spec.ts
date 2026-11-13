import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { QueryReportesFinancierosDto } from './dto/query-reportes.dto';
import { ReportesFinancierosService } from './reportes.service';

const admin = { id: 'admin', activo: true, roles: { nombre: 'administrador financiero' } };
const query: QueryReportesFinancierosDto = {
  fecha_desde: '2026-01-01',
  fecha_hasta: '2026-01-31',
  granularidad: 'semanal',
  comparar: true,
};

describe('ReportesFinancierosService', () => {
  it('aggregates only validated payments and compares equal-length adjacent periods', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValueOnce([
      { periodo: '2026-01-02', monto: '100.25', cantidad_pagos: 2n },
    ]).mockResolvedValueOnce([]) };
    const service = new ReportesFinancierosService(prisma as never);

    const result = await service.ingresos(query, admin);

    const sql = prisma.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(sql.sql).toContain("ep.\"nombre\"");
    expect(sql.sql).toContain("date_trunc('week'");
    expect(sql.values).toContain('Validado');
    expect(sql.values).toContain('America/Cancun');
    expect(result.datos).toEqual([
      { periodo: '2026-01-02', monto: '100.25', cantidad_pagos: 2 },
    ]);
    expect(result.resumen.total).toBe('100.25');
    expect(result.comparacion!.periodo_anterior).toEqual({
      desde: '2025-12-01',
      hasta: '2025-12-31',
    });
    expect(result.comparacion!.variacion_porcentual).toBeNull();
    expect(result.comparacion!.variacion_definida).toBe(false);
  });

  it('reports IMSS amounts actually dispersed separately from pending commissions', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        { periodo: '2026-01-01', contrato_id: 'contract', contrato: 'C-1', servicio: 'Modalidad 10', estado_comision: 'Dispersada', monto: '40.00', cantidad_pagos: 1n },
        { periodo: '2026-01-01', contrato_id: 'contract', contrato: 'C-1', servicio: 'Modalidad 10', estado_comision: 'Pendiente de dispersión', monto: '60.00', cantidad_pagos: 1n },
      ]),
    };
    const service = new ReportesFinancierosService(prisma as never);
    const result = await service.pagosImss({ ...query, comparar: false }, admin);

    expect(result.resumen).toEqual({
      total: '40.00',
      total_comisionado: '100.00',
      pendiente_de_dispersion: '60.00',
      otros_estados: '0.00',
    });
    expect(result.datos[0].contrato_id).toBe('contract');
  });

  it('calculates destination share with decimal arithmetic', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValueOnce([
        { periodo: '2026-01-01', concepto_id: 1, destino: 'Asesor', beneficiario: 'Persona', estado_comision: 'Dispersada', monto_comision: '10.00', cantidad_comisiones: 1n, cantidad_pagos: 1n },
        { periodo: '2026-01-01', concepto_id: 4, destino: 'Empresa', beneficiario: 'Empresa', estado_comision: 'Pendiente de dispersión', monto_comision: '20.00', cantidad_comisiones: 1n, cantidad_pagos: 1n },
      ]).mockResolvedValueOnce([]),
    };
    const service = new ReportesFinancierosService(prisma as never);
    const result = await service.comisionesPorDestino(query, admin);

    expect(result.datos.map((row) => row.porcentaje_del_total)).toEqual(['33.33', '66.67']);
    expect(result.resumen.total).toBe('30.00');
  });

  it('filters payment method and APD sale type without interpolating user input into SQL', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        { periodo: '2026-01-01', metodo_pago: 'Transferencia', monto: '250.00', cantidad_pagos: 1n },
      ]),
    };
    const service = new ReportesFinancierosService(prisma as never);
    const result = await service.pagosPorMetodo(
      { ...query, comparar: false, forma_pago_id: 3, tipo_venta_id: 7 },
      admin,
    );
    const sql = prisma.$queryRaw.mock.calls[0][0] as Prisma.Sql;

    expect(result.datos[0].metodo_pago).toBe('Transferencia');
    expect(sql.sql).toContain('p."forma_pago_id" =');
    expect(sql.sql).toContain('sv."tipo_venta_id" =');
    expect(sql.values).toContain(3);
    expect(sql.values).toContain(7);
  });

  it('denies advisors and rejects invalid date ranges', async () => {
    const service = new ReportesFinancierosService({} as never);
    await expect(service.ingresos(query, { ...admin, roles: { nombre: 'asesor' } })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.ingresos({ ...query, fecha_desde: '2026-02-01' }, admin)).rejects.toThrow('fecha_hasta debe ser igual o posterior');
    await expect(service.ingresos({ ...query, fecha_desde: '2026-02-30' }, admin)).rejects.toThrow('fecha_desde debe ser una fecha válida');
  });
});
