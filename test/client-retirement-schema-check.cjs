const { Pool } = require('pg');
const { loadPostgresTestEnvironment } = require('./test-environment.cjs');

async function main() {
  const target = loadPostgresTestEnvironment();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const identity = (await client.query(`
      SELECT current_database() AS database,current_schema() AS schema,
             inet_server_port() AS port,host(inet_server_addr()) AS address,
             to_regclass('public.clientes_eliminaciones')::text AS audit_table,
             (SELECT COUNT(*)::int FROM "_prisma_migrations"
              WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS applied
    `)).rows[0];
    if (identity.database !== target.database || identity.schema !== target.schema || Number(identity.port) !== target.port ||
        !['127.0.0.1', '::1'].includes(identity.address) || identity.audit_table !== 'clientes_eliminaciones' || identity.applied !== 27) {
      throw new Error('PostgreSQL Test o la migración de retiro no coinciden');
    }
    const constraints = (await client.query(`
      SELECT conname,contype,pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE conrelid='public.clientes_eliminaciones'::regclass
      ORDER BY conname
    `)).rows;
    const columns = (await client.query(`
      SELECT column_name,data_type,is_nullable,column_default
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='clientes_eliminaciones'
      ORDER BY ordinal_position
    `)).rows;
    const indexes = (await client.query(`
      SELECT indexname,indexdef FROM pg_indexes
      WHERE schemaname='public' AND tablename='clientes_eliminaciones'
      ORDER BY indexname
    `)).rows;
    const byName = new Map(constraints.map(row => [row.conname, row]));
    if (constraints.filter(row => row.contype !== 'n').length !== 2 || !byName.has('clientes_eliminaciones_pkey') ||
        !byName.get('fk_clientes_eliminaciones_actor')?.definition.includes('REFERENCES usuarios(id)') ||
        columns.length !== 4 || !columns.some(row => row.column_name === 'cliente_id' && row.data_type === 'uuid' && row.is_nullable === 'NO') ||
        !columns.some(row => row.column_name === 'eliminado_por' && row.data_type === 'uuid' && row.is_nullable === 'NO') ||
        !columns.some(row => row.column_name === 'eliminado_en' && row.data_type === 'timestamp with time zone' && row.is_nullable === 'NO') ||
        !indexes.some(row => row.indexname === 'ix_clientes_eliminaciones_cliente') ||
        !indexes.some(row => row.indexname === 'ix_clientes_eliminaciones_actor_fecha')) {
      throw new Error(`La estructura de clientes_eliminaciones difiere del SQL aprobado: ${JSON.stringify({ constraints, columns, indexes })}`);
    }
    await client.query('COMMIT');
    console.log(JSON.stringify({ identity, constraints, columns, indexes }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
