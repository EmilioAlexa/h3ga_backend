const { Pool } = require('pg');
const { loadPostgresTestEnvironment } = require('./test-environment.cjs');

async function main() {
  const target = loadPostgresTestEnvironment();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const identity = (await client.query('SELECT current_database() AS database, current_schema() AS schema, inet_server_port() AS port, host(inet_server_addr()) AS address')).rows[0];
    if (identity.database !== target.database || identity.schema !== target.schema || Number(identity.port) !== target.port || !['127.0.0.1', '::1'].includes(identity.address)) {
      throw new Error('La conexión PostgreSQL no coincide con PostgreSQL Test');
    }
    const fks = (await client.query(`
      SELECT ns.nspname AS schema_name, rel.relname AS table_name, att.attname AS column_name,
             con.conname AS constraint_name, con.confdeltype AS on_delete,
             pg_get_constraintdef(con.oid) AS definition,
             ref.relname AS referenced_table,
             cardinality(con.conkey)::int AS key_columns
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid=con.conrelid
      JOIN pg_namespace ns ON ns.oid=rel.relnamespace
      JOIN pg_class ref ON ref.oid=con.confrelid
      JOIN pg_namespace refns ON refns.oid=ref.relnamespace
      JOIN pg_attribute att ON att.attrelid=rel.oid AND att.attnum=con.conkey[1]
      WHERE con.contype='f' AND refns.nspname='public'
        AND ref.relname IN ('clientes','contratos','pagos','pagos_programados','comisiones','prenomina')
      ORDER BY referenced_table,table_name,column_name
    `)).rows;
    const direct = fks.filter(row => row.referenced_table === 'clientes');
    const counts = [];
    for (const row of direct) {
      if (row.key_columns !== 1) throw new Error(`FK compuesta requiere revisión: ${row.constraint_name}`);
      const schema = `"${row.schema_name.replaceAll('"', '""')}"`;
      const table = `"${row.table_name.replaceAll('"', '""')}"`;
      const column = `"${row.column_name.replaceAll('"', '""')}"`;
      const count = (await client.query(`SELECT COUNT(*)::int AS count FROM ${schema}.${table} WHERE ${column} IS NOT NULL`)).rows[0].count;
      counts.push({ ...row, non_null_rows: count });
    }
    const indexes = (await client.query(`
      SELECT tablename,indexname,indexdef FROM pg_indexes
      WHERE schemaname='public' AND tablename=ANY($1::text[]) ORDER BY tablename,indexname
    `, [[...new Set(direct.map(row => row.table_name))]])).rows;
    await client.query('COMMIT');
    console.log(JSON.stringify({ identity, direct: counts, indirect: fks.filter(row => row.referenced_table !== 'clientes'), indexes }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
