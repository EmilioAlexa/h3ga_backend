const { spawn, spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const inheritedDatabaseUrl = process.env.DATABASE_URL;
const { loadPostgresTestEnvironment } = require('../test/test-environment.cjs');

function port(value, name) {
  if (!value || !/^\d{1,5}$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
    throw new Error(`${name} debe ser un puerto explícito entre 1 y 65535`);
  }
  return Number(value);
}

function argumentsForIntegration(args) {
  const options = { checkOnly: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--check-only') options.checkOnly = true;
    else if (args[i] === '--port') options.httpPort = port(args[++i], 'PORT');
    else if (args[i] === '--web-port') options.webPort = port(args[++i], 'FLUTTER_WEB_PORT');
    else throw new Error(`Argumento de arranque no reconocido: ${args[i]}`);
  }
  if (!options.httpPort || !options.webPort) {
    throw new Error('Se requieren --port y --web-port explícitos');
  }
  if (options.httpPort === options.webPort) {
    throw new Error('Los puertos de API y Flutter Web deben diferir');
  }
  return options;
}

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: projectRoot,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) throw new Error('Preflight o estado de migraciones de PostgreSQL Test falló');
  return result.stdout;
}

function verifyDatabase() {
  const target = loadPostgresTestEnvironment();
  if (inheritedDatabaseUrl && inheritedDatabaseUrl !== process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL externa diferente de .env.test: arranque rechazado');
  }
  const report = JSON.parse(runNode([path.join(projectRoot, 'test', 'postgres-test-preflight.cjs')]));
  if (
    report.actual.database !== target.database ||
    report.actual.schema !== target.schema ||
    Number(report.actual.port) !== target.port ||
    !['127.0.0.1', '::1'].includes(report.actual.address) ||
    report.migrations_applied !== 27
  ) {
    throw new Error('La base efectiva o las 27 migraciones de Test no coinciden');
  }
  const status = runNode([
    '-r', path.join(projectRoot, 'test', 'test-environment.cjs'),
    path.join(projectRoot, 'node_modules', 'prisma', 'build', 'index.js'),
    'migrate', 'status',
  ]);
  if (!status.includes('27 migrations found') || !status.includes('Database schema is up to date!')) {
    throw new Error('Prisma detectó migraciones pendientes o inesperadas');
  }
  console.log('PostgreSQL Test verificado: localhost:5433/h3ga_finanzas_test/public; 27/27 migraciones.');
}

async function assertPortAvailable(httpPort) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error(`Puerto HTTP ${httpPort} no disponible en 127.0.0.1`)));
    server.listen(httpPort, '127.0.0.1', () => server.close(resolve));
  });
}

async function main() {
  const options = argumentsForIntegration(process.argv.slice(2));
  verifyDatabase();
  await assertPortAvailable(options.httpPort);
  console.log(`API local: http://127.0.0.1:${options.httpPort}/api; origen Flutter Web: http://localhost:${options.webPort}.`);
  if (options.checkOnly) return;
  const entrypoint = path.join(projectRoot, 'dist', 'main.js');
  if (!existsSync(entrypoint)) throw new Error('Falta dist/main.js; ejecutar pnpm build primero');
  const child = spawn(process.execPath, [entrypoint], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: String(options.httpPort),
      FLUTTER_WEB_PORT: String(options.webPort),
      H3GA_LOCAL_INTEGRATION: '1',
    },
  });
  child.once('error', () => { process.exitCode = 1; });
  child.once('exit', (code) => { process.exitCode = code ?? 1; });
  process.once('SIGINT', () => child.kill('SIGINT'));
  process.once('SIGTERM', () => child.kill('SIGTERM'));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
