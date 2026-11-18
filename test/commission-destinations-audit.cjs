require('./test-environment.cjs');
const { Pool } = require('pg');

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const identity = (await client.query(`SELECT current_database() AS database, current_schema() AS schema,
      inet_server_port() AS port, host(inet_server_addr()) AS address`)).rows[0];
    if (identity.database !== 'h3ga_finanzas_test' || identity.schema !== 'public' || identity.port !== 5433 || !['::1', '127.0.0.1'].includes(identity.address)) {
      throw new Error('La conexión real no es PostgreSQL Test autorizado');
    }
    const concepts = (await client.query(`SELECT nombre, tipo_destino::text AS tipo_destino, activo, es_remanente
      FROM conceptos_dispersion WHERE nombre IN ('Otro', 'Referidor') ORDER BY nombre`)).rows;
    const destinationTypes = (await client.query(`SELECT e.enumlabel FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'tipo_destino_dispersion' ORDER BY e.enumsortorder`)).rows.map(row => row.enumlabel);
    const columns = (await client.query(`SELECT table_name, column_name, data_type
      FROM information_schema.columns WHERE table_schema = 'public'
      AND ((table_name = 'clientes' AND column_name IN ('referido_por', 'referido_por_cliente_id'))
        OR (table_name = 'comisiones' AND column_name = 'receptor_cliente_id'))
      ORDER BY table_name, column_name`)).rows;
    const historicalTextCount = Number((await client.query(`SELECT count(*)::int AS total
      FROM clientes WHERE nullif(btrim(referido_por), '') IS NOT NULL`)).rows[0].total);
    await client.query('COMMIT');
    console.log(JSON.stringify({ identity, concepts, destinationTypes, columns, historicalTextCount }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
