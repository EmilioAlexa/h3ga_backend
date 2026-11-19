const { Pool } = require('pg');
const { loadPostgresTestEnvironment } = require('./test-environment.cjs');

async function main() {
  const target = loadPostgresTestEnvironment();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    const identity = (await client.query(
      'SELECT current_database() AS database, current_schema() AS schema, inet_server_port() AS port, host(inet_server_addr()) AS address',
    )).rows[0];
    if (identity.database !== target.database || identity.schema !== target.schema || Number(identity.port) !== target.port || !['127.0.0.1', '::1'].includes(identity.address)) {
      throw new Error('La auditoria solo permite h3ga_finanzas_test en localhost:5433/public');
    }
    await client.query('BEGIN READ ONLY');
    const catalogs = {};
    for (const [name, sql] of Object.entries({
      estados_pago: 'SELECT id, nombre, orden FROM estados_pago ORDER BY orden, id',
      formas_pago: 'SELECT id, nombre, activo FROM formas_pago ORDER BY id',
      tipos_evidencia_pago: 'SELECT id, nombre FROM tipos_evidencia_pago ORDER BY id',
      estados_pago_programado: 'SELECT id, nombre FROM estados_pago_programado ORDER BY id',
      tipos_cobro: 'SELECT id, nombre, activo FROM tipos_cobro ORDER BY id',
      estados_comisiones: 'SELECT id, nombre FROM estados_comisiones ORDER BY id',
      conceptos_dispersion: 'SELECT id, nombre, es_remanente, activo FROM conceptos_dispersion ORDER BY id',
      servicios: 'SELECT id, nombre, codigo_folio, activo FROM servicios ORDER BY id',
    })) {
      catalogs[name] = (await client.query(sql)).rows;
    }
    await client.query('COMMIT');
    console.log(JSON.stringify({ target, catalogs }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`Auditoria de catalogos de pago: ${error.message}`);
  process.exitCode = 1;
});
