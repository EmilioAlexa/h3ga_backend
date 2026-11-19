const { Pool } = require('pg');
require('./test-environment.cjs');

const checks = {
  totals: `
    SELECT
      (SELECT count(*) FROM comisiones)::int AS comisiones,
      (SELECT count(*) FROM dispersiones_comision)::int AS dispersiones_confirmadas,
      (SELECT count(*) FROM contrato_dispersion_detalle WHERE activo)::int AS configuraciones_activas,
      (SELECT count(*) FROM cortes_financieros)::int AS cortes,
      (SELECT count(*) FROM detalle_corte)::int AS detalles_corte,
      (SELECT count(*) FROM receptores_dispersion)::int AS receptores
  `,
  commission_anomalies: `
    SELECT
      (SELECT count(*) FROM comisiones c JOIN pagos p ON p.id = c.pago_id
       JOIN estados_pago e ON e.id = p.estado_pago_id WHERE e.nombre <> 'Validado')::int AS origen_no_validado,
      (SELECT count(*) FROM pagos p JOIN estados_pago e ON e.id = p.estado_pago_id
       WHERE e.nombre = 'Validado' AND NOT EXISTS (SELECT 1 FROM comisiones c WHERE c.pago_id = p.id))::int AS validado_sin_snapshot,
      (SELECT count(*) FROM comisiones c JOIN estados_comisiones e ON e.id = c.estado_id
       WHERE e.nombre = 'Dispersada' AND NOT EXISTS (
         SELECT 1 FROM historial_estados_comisiones h WHERE h.comision_id = c.id AND h.estado_nuevo_id = c.estado_id
       ))::int AS dispersada_sin_historial,
      (SELECT count(*) FROM comisiones c JOIN conceptos_dispersion d ON d.id = c.concepto_id
       JOIN estados_comisiones e ON e.id = c.estado_id
       WHERE d.es_remanente AND e.nombre = 'Dispersada')::int AS remanente_dispersado,
      (SELECT count(*) FROM comisiones c JOIN estados_comisiones e ON e.id = c.estado_id
       WHERE e.nombre = 'Dispersada' AND NOT EXISTS (SELECT 1 FROM dispersiones_comision d WHERE d.comision_id = c.id))::int AS dispersada_sin_operacion,
      (SELECT count(*) FROM dispersiones_comision d JOIN comisiones c ON c.id = d.comision_id
       JOIN estados_comisiones e ON e.id = c.estado_id WHERE e.nombre <> 'Dispersada')::int AS operacion_sin_estado_dispersada
  `,
  commission_reconciliation: `
    SELECT count(*)::int AS pagos_con_distribucion_distinta
    FROM pagos p JOIN estados_pago e ON e.id = p.estado_pago_id
    JOIN comisiones c ON c.pago_id = p.id
    WHERE e.nombre = 'Validado'
    GROUP BY p.id, p.monto
    HAVING sum(c.monto_comision) <> p.monto
  `,
  cut_anomalies: `
    SELECT
      (SELECT count(*) FROM (
        SELECT d.pago_id FROM detalle_corte d
        JOIN cortes_financieros c ON c.id = d.corte_id
        JOIN estados_corte e ON e.id = c.estado_id WHERE e.nombre <> 'Cancelado'
        GROUP BY d.pago_id HAVING count(*) > 1
      ) duplicated)::int AS pagos_en_dos_cortes_no_cancelados,
      (SELECT count(*) FROM detalle_corte d
       JOIN cortes_financieros c ON c.id = d.corte_id
       JOIN estados_corte ec ON ec.id = c.estado_id
       JOIN pagos p ON p.id = d.pago_id
       JOIN estados_pago ep ON ep.id = p.estado_pago_id
       WHERE ec.nombre <> 'Cancelado' AND ep.nombre <> 'Validado')::int AS detalles_activos_pago_no_validado,
      (SELECT count(*) FROM cortes_financieros c JOIN estados_corte e ON e.id = c.estado_id
       WHERE e.nombre <> 'Cancelado' AND NOT EXISTS (
         SELECT 1 FROM cortes_periodos_reservados r WHERE r.corte_id = c.id
       ))::int AS cortes_activos_sin_reserva_periodo,
      (SELECT count(*) FROM detalle_corte d JOIN cortes_financieros c ON c.id = d.corte_id
       JOIN estados_corte e ON e.id = c.estado_id
       WHERE e.nombre <> 'Cancelado' AND NOT EXISTS (
         SELECT 1 FROM cortes_pagos_reservados r WHERE r.corte_id = d.corte_id AND r.pago_id = d.pago_id
       ))::int AS detalles_activos_sin_reserva_pago
  `,
};

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const identity = (await client.query('SELECT current_database() AS database, current_schema() AS schema, inet_server_port() AS port, host(inet_server_addr()) AS address')).rows[0];
    if (identity.database !== 'h3ga_finanzas_test' || identity.schema !== 'public' || identity.port !== 5433 || !['::1', '127.0.0.1'].includes(identity.address)) {
      throw new Error('La conexión real no es PostgreSQL Test');
    }
    const output = { target: identity };
    for (const [name, sql] of Object.entries(checks)) {
      const result = await client.query(sql);
      output[name] = name === 'commission_reconciliation'
        ? { pagos_con_distribucion_distinta: result.rows.length }
        : result.rows[0];
    }
    await client.query('ROLLBACK');
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
