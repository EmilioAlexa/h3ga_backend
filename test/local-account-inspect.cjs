const { Pool } = require('pg');
const { loadPostgresTestEnvironment } = require('./test-environment.cjs');

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error('Indica el correo de la cuenta, sin contraseña');
  const target = loadPostgresTestEnvironment();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const { rows: [identity] } = await client.query(`
      SELECT current_database() AS database, current_schema() AS schema,
             inet_server_port() AS port, host(inet_server_addr()) AS address
    `);
    if (identity.database !== target.database || identity.schema !== target.schema ||
        Number(identity.port) !== target.port || !['127.0.0.1', '::1'].includes(identity.address)) {
      throw new Error('PostgreSQL no coincide con Test');
    }
    const result = await client.query(`
      SELECT u.activo, r.nombre AS rol, (u.password_hash IS NOT NULL) AS tiene_hash,
             (u.password_hash ~ $2) AS bcrypt_compatible
      FROM usuarios u LEFT JOIN roles r ON r.id = u.rol_id
      WHERE u.correo_electronico = $1
    `, [email, '^[$]2[aby][$][0-9]{2}[$][./A-Za-z0-9]{53}$']);
    await client.query('COMMIT');
    console.log(JSON.stringify({ encontrada: result.rowCount > 0, estado: result.rows[0] ?? null }));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
