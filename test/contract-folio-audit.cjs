const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
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
      throw new Error('La auditoría solo puede consultar h3ga_finanzas_test en localhost:5433/public');
    }
    await client.query('BEGIN READ ONLY');
    const sql = readFileSync(resolve(__dirname, '..', 'docs', 'sql', 'contract-folio-audit-readonly.sql'), 'utf8');
    const results = await client.query(sql);
    await client.query('COMMIT');
    const names = ['duplicados_exactos', 'duplicados_normalizados', 'espacios_minusculas_blancos', 'servicios', 'formatos_incompatibles', 'maximos_por_servicio_anio'];
    console.log(JSON.stringify({ target, audit: Object.fromEntries(names.map((name, index) => [name, { count: results[index].rowCount, rows: results[index].rows }])) }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`Auditoría I3 falló: ${error.message}`);
  process.exitCode = 1;
});
