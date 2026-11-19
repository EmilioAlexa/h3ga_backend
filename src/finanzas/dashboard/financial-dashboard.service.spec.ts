import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { FinancialDashboardService } from './financial-dashboard.service';

const admin = { id: 'admin', activo: true, roles: { nombre: 'administrador' } };

describe('FinancialDashboardService', () => {
  it('rechaza usuarios sin permiso y semanas que no inician viernes', async () => {
    const service = new FinancialDashboardService({} as never);
    await expect(service.get({ limite: 5 }, { ...admin, activo: false })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.get({ limite: 5 }, { ...admin, roles: { nombre: 'auxiliar administrativo' } })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.get({ semana: '2026-11-14', limite: 5 }, admin)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.get({ semana: '2026-02-30', limite: 5 }, admin)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.get({ semana: '2026-11-13', limite: 5, cursor_cobros: 'inválido' }, admin)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('devuelve siete días y ceros calculados sin operaciones, con variación indefinida', async () => {
    const sql: Prisma.Sql[] = [];
    const prisma = {
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
        $queryRaw: jest.fn(async (query: Prisma.Sql) => { sql.push(query); return []; }),
      })),
    };
    const service = new FinancialDashboardService(prisma as never);
    const result = await service.get({ semana: '2026-11-13', limite: 5 }, admin);
    expect(result.periodo).toEqual({ inicio_local: '2026-11-13', fin_exclusivo_local: '2026-11-20', zona: 'America/Cancun' });
    expect(result.ingresos_por_servicio.dias).toHaveLength(7);
    expect(result.indicadores.ingresos_periodo).toBe('0.00');
    expect(result.indicadores.variacion_periodo_porcentaje).toBeNull();
    expect(result.indicadores.variacion_motivo).toBe('sin_base_comparable');
    expect(result.cobranza.total_completo).toBe(true);
    expect(sql[0].values).toContain('Validado');
    expect(sql[0].values).toContain('America/Cancun');
    expect(sql[8].sql).toContain('COUNT(DISTINCT cf."id")');
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  });

  it('deriva el filtro de asesor del JWT y omite conceptos y cortes globales', async () => {
    const sql: Prisma.Sql[] = [];
    const prisma = {
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
        $queryRaw: jest.fn(async (query: Prisma.Sql) => { sql.push(query); return []; }),
      })),
    };
    const service = new FinancialDashboardService(prisma as never);
    const id = 'd1352972-caae-4453-ab3e-7f217ea81110';
    const result = await service.get({ semana: '2026-11-13', limite: 5 }, { id, activo: true, roles: { nombre: 'asesor' } });
    expect(result.alcance).toBe('asesor');
    expect(result.comisiones.por_concepto).toBeNull();
    expect(result.cortes).toBeNull();
    expect(sql[0].values).toContain(id);
    expect(sql[4].values).toContain(id);
    expect(sql[5].values).toContain(id);
  });
});
