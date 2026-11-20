const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { loadPostgresTestEnvironment } = require('./test-environment.cjs');

function readPassword() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Se necesita una terminal interactiva para ocultar la contraseña');
  }
  process.stdout.write('Contraseña de la cuenta (no se mostrará): ');
  return new Promise((resolve, reject) => {
    let value = '';
    const input = process.stdin;
    const cleanup = () => {
      input.removeListener('data', onData);
      input.setRawMode(false);
      input.pause();
      process.stdout.write('\n');
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === '\u0003') {
          cleanup();
          reject(new Error('Operación cancelada'));
          return;
        }
        if (character === '\r' || character === '\n') {
          cleanup();
          resolve(value);
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = [...value].slice(0, -1).join('');
        } else if (character >= ' ') {
          value += character;
        }
      }
    };
    input.setEncoding('utf8');
    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}

async function main() {
  const email = process.argv[2];
  if (!email || process.argv.length !== 3) {
    throw new Error('Uso: pnpm exec node test/verify-local-login-interactive.cjs correo');
  }
  const target = loadPostgresTestEnvironment();
  const preflight = spawnSync(process.execPath, [path.join(__dirname, 'postgres-test-preflight.cjs')], {
    encoding: 'utf8',
    env: process.env,
  });
  if (preflight.status !== 0) throw new Error('Preflight de PostgreSQL Test falló');
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
      throw new Error('La conexión efectiva no corresponde a PostgreSQL Test');
    }
    const { rows: [user] } = await client.query(`
      SELECT u.activo, u.password_hash, (r.id IS NOT NULL) AS rol_valido
      FROM usuarios u LEFT JOIN roles r ON r.id = u.rol_id
      WHERE u.correo_electronico = $1
    `, [email]);
    const compatible = !!user?.password_hash &&
      /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(user.password_hash);
    let verified = null;
    let blocker = null;
    if (!user) blocker = 'Usuario no encontrado mediante comparación exacta';
    else if (!user.password_hash) blocker = 'El usuario no tiene hash';
    else if (!user.activo) blocker = 'La cuenta está inactiva';
    else {
      let password = await readPassword();
      try {
        verified = await bcrypt.compare(password, user.password_hash);
      } finally {
        password = '';
      }
      if (!verified) {
        blocker = compatible
          ? 'La contraseña no coincide con el hash'
          : 'bcrypt rechazó la contraseña o el formato del hash';
      }
    }
    await client.query('COMMIT');
    console.log(JSON.stringify({
      usuario_encontrado: !!user,
      cuenta_activa: user?.activo ?? null,
      rol_valido: user?.rol_valido ?? null,
      formato_hash_compatible: compatible,
      contrasena_verificada: verified,
      condicion_que_bloquea_login: blocker,
    }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(() => {
  console.error('No se pudo completar la verificación interactiva; revisa el destino y la terminal.');
  process.exitCode = 1;
});
