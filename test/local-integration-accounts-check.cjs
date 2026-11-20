const { Pool } = require('pg');
const { loadPostgresTestEnvironment } = require('./test-environment.cjs');

async function main() {
  const target = loadPostgresTestEnvironment();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const identity = (await client.query(`
      SELECT current_database() AS database, current_schema() AS schema,
             inet_server_port() AS port, host(inet_server_addr()) AS address
    `)).rows[0];
    if (
      identity.database !== target.database || identity.schema !== target.schema ||
      Number(identity.port) !== target.port ||
      !['127.0.0.1', '::1'].includes(identity.address)
    ) throw new Error('PostgreSQL no coincide con la base de integración autorizada');

    const counts = (await client.query(`
      SELECT r.nombre AS rol,
             COUNT(u.id) FILTER (WHERE u.activo AND u.password_hash IS NOT NULL)::int AS utilizables,
             COUNT(u.id) FILTER (
               WHERE u.activo AND u.password_hash IS NOT NULL
                 AND u.correo_electronico LIKE 'integracion-%@example.test'
             )::int AS sinteticas_identificables
      FROM roles r LEFT JOIN usuarios u ON u.rol_id = r.id
      WHERE r.nombre IN ('administrador', 'administrador financiero', 'asesor')
      GROUP BY r.nombre ORDER BY r.nombre
    `)).rows;
    const summary = (await client.query(`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE u.activo)::int AS activas,
             count(*) FILTER (WHERE r.id IS NOT NULL)::int AS con_rol_existente,
             count(*) FILTER (WHERE u.password_hash IS NOT NULL)::int AS con_hash,
             count(*) FILTER (WHERE u.password_hash ~ '^\\$2[aby]\\$[0-9]{2}\\$[./A-Za-z0-9]{53}$')::int AS hash_formato_bcrypt,
             count(*) FILTER (WHERE u.activo AND r.nombre IN ('administrador', 'administrador financiero', 'asesor') AND u.password_hash ~ '^\\$2[aby]\\$[0-9]{2}\\$[./A-Za-z0-9]{53}$')::int AS candidatas_finanzas
      FROM usuarios u LEFT JOIN roles r ON r.id = u.rol_id
    `)).rows[0];
    await client.query('COMMIT');
    console.log(JSON.stringify({ database: identity.database, schema: identity.schema, counts, summary }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
