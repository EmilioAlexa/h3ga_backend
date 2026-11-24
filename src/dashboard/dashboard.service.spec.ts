import { ForbiddenException } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

const asesor = { id: '11111111-1111-4111-8111-111111111111', roles: { nombre: 'asesor' } };
const base = { clientes_activos: 2, clientes_pensionados: 1, clientes_avance_detenido: 0, acciones_proximas_mes: 3, asesores_activos: 4, docs_si: 5, docs_por_confirmar: 6, docs_no: 7 };

function fixture(empty = false) {
  const queries: { sql: string; values: unknown[] }[] = [];
  const prisma = { $queryRaw: jest.fn(async (query: { strings: string[]; values: unknown[] }) => {
    const sql = query.strings.join('?');
    queries.push({ sql, values: query.values });
    if (sql.includes('AS clientes_activos') && sql.includes('FROM info') && sql.includes('docs_si')) return [base];
    if (sql.includes('AS numero_paso') && sql.includes('GROUP BY ep.numero_paso')) return [];
    if (sql.includes('AS documento_id')) return empty ? [] : [{ documento_id: 'd', total: 18 }];
    if (sql.includes('FROM acciones a')) return empty ? [] : [{ cliente_id: 'c', total: 12 }];
    return [];
  }) };
  return { service: new DashboardService(prisma as never), prisma, queries };
}

describe('DashboardService', () => {
  it.each(['administrador', 'asesor', 'auxiliar administrativo'])('aplica alcance a todas las consultas para %s', async (nombre) => {
    const { service, queries } = fixture();
    const result = await service.obtener({ ...asesor, roles: { nombre } }, 8);
    expect(queries.length).toBe(nombre === 'administrador' || nombre === 'asesor' ? 6 : 5);
    for (const q of queries) {
      expect(q.sql).toContain('WITH alcance AS');
      if (nombre === 'asesor') expect(q.sql).toContain('c.asesor_id = ?::uuid');
      if (nombre === 'auxiliar administrativo') {
        expect(q.sql).toContain('ca.auxiliar_id = ?::uuid AND ca.activo = true');
        expect(q.values).toContain(asesor.id);
      }
      if (nombre === 'administrador') expect(q.sql).not.toContain('ca.auxiliar_id');
    }
    expect(Object.keys(result)).toEqual(['fecha', 'resumen', 'clientes_por_etapa', 'documentos_por_estatus', 'acciones_del_mes', 'total_acciones_del_mes', 'documentos_pendientes', 'total_documentos_pendientes', 'clientes_detenidos', 'carga_por_asesor', 'avance_por_cliente', 'total_avance_por_cliente']);
    expect(result.total_acciones_del_mes).toBe(12);
    expect(result.total_documentos_pendientes).toBe(18);
    expect(result.acciones_del_mes[0]).not.toHaveProperty('total');
    expect(result.resumen.asesores_activos).toBe(nombre === 'administrador' ? 4 : null);
  });
  it.each(['administrador financiero', 'supervisor', 'desconocido'])('rechaza %s sin consultar la base', async (nombre) => {
    const { service, prisma } = fixture();
    await expect(service.obtener({ ...asesor, roles: { nombre } }, 8)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
  it('devuelve listas vacías, totales cero y campos nulos cuando no hay filas', async () => {
    const { service } = fixture(true);
    const result = await service.obtener(asesor, 1);
    expect(result.total_acciones_del_mes).toBe(0);
    expect(result.total_documentos_pendientes).toBe(0);
    expect(result.total_avance_por_cliente).toBe(0);
    expect(result.carga_por_asesor).toBeNull();
  });
});
