// Every run owns a new database. Never reset the integration database in .env.test.
const { randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');
const { resolve } = require('node:path');
const { Pool } = require('pg');
const { loadPostgresTestEnvironment } = require('../test/test-environment.cjs');

const root = resolve(__dirname, '..');
function run(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`Proceso interrumpido: ${signal}`));
      else resolve(code ?? 1);
    });
  });
}

async function main() {
  // Ignore any inherited temporary destination; derive credentials from .env.test.
  delete process.env.H3GA_E2E_DATABASE_URL;
  loadPostgresTestEnvironment();
  const source = new URL(process.env.DATABASE_URL);
  if (source.pathname !== '/h3ga_finanzas_test') throw new Error('Origen de Test inesperado');
  const database = `h3ga_e2e_${randomBytes(12).toString('hex')}`;
  const adminUrl = new URL(source);
  adminUrl.pathname = '/postgres';
  const admin = new Pool({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 5000 });
  let created = false;
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    created = true;
    source.pathname = `/${database}`;
    const env = {
      ...process.env,
      DATABASE_URL: source.toString(),
      H3GA_E2E_DATABASE_URL: source.toString(),
      LOCAL_STORAGE_PATH: `./storage/e2e/${database}/evidencias`,
      CONTRACT_LOCAL_STORAGE_PATH: `./storage/e2e/${database}/contratos`,
    };
    console.log(`E2E: base temporal ${database} en localhost:5433`);
    const migrationCode = await run(['node_modules/prisma/build/index.js', 'migrate', 'deploy'], env);
    if (migrationCode !== 0) throw new Error('No se pudieron preparar las migraciones E2E');
    const seed = new Pool({ connectionString: source.toString() });
    try {
      await seed.query(`INSERT INTO roles (nombre) VALUES
        ('administrador'), ('administrador financiero'), ('asesor'), ('auxiliar administrativo')
        ON CONFLICT (nombre) DO NOTHING`);
    } finally { await seed.end(); }
    const args = process.argv.slice(2).filter(arg => arg !== '--');
    process.exitCode = await run([
      '--experimental-vm-modules', 'node_modules/jest/bin/jest.js',
      '--config', 'test/jest-e2e.json', '--runInBand', ...args,
    ], env);
  } finally {
    try {
      if (created) {
        if (!/^h3ga_e2e_[a-f0-9]{24}$/.test(database)) throw new Error('Nombre temporal inesperado');
        await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
        console.log(`E2E: base temporal eliminada (${database})`);
      }
    } finally { await admin.end(); }
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
