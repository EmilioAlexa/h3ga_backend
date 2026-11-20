// Semilla limitada a clientes: nunca crea usuarios ni modifica catálogos financieros.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Pool } = require('pg');

const root = path.resolve(__dirname, '..');
const inheritedUrl = process.env.DATABASE_URL;
const { loadPostgresTestEnvironment } = require('../test/test-environment.cjs');
const target = loadPostgresTestEnvironment();
const batch = 'H3GA-INTEGRACION-LOCAL-2026';
const directory = path.join(root, 'storage', 'integration-seed');
const manifestPath = path.join(directory, 'local-integration-manifest.json');
const lockPath = path.join(directory, 'local-integration-seed.lock');
const accounts = [
  { key: 'charly', email: 'charlyasesor@hega.com', role: 'asesor', roleId: 268 },
  { key: 'cristian', email: 'crisasesor@hega.com', role: 'asesor', roleId: 268 },
  { key: 'emi', email: 'emiasesor@hega.com', role: 'asesor', roleId: 268 },
  { key: 'admin', email: 'emiliokuku2@gmail.com', role: 'administrador', roleId: 267 },
  { key: 'finanzas', email: 'emifinanzas@hega.com', role: 'administrador financiero', roleId: 266 },
];
const slots = [
  { key: 'charly_1', owner: 'charly', name: 'Cliente Test Charly Uno' },
  { key: 'charly_2', owner: 'charly', name: 'Cliente Test Charly Dos', referral: 'charly_1' },
  { key: 'cristian_1', owner: 'cristian', name: 'Cliente Test Cristian Uno' },
  { key: 'cristian_2', owner: 'cristian', name: 'Cliente Test Cristian Dos', referral: 'cristian_1' },
  { key: 'emi_1', owner: 'emi', name: 'Cliente Test Emi Uno' },
  { key: 'emi_2', owner: 'emi', name: 'Cliente Test Emi Dos' },
];
const catalogQueries = {
  servicios: 'SELECT id, nombre, codigo_folio, activo FROM servicios ORDER BY id',
  estados_contratos: 'SELECT id, nombre, orden FROM estados_contratos ORDER BY id',
  formas_pago: 'SELECT id, nombre, activo FROM formas_pago ORDER BY id',
  estados_pago: 'SELECT id, nombre, orden FROM estados_pago ORDER BY id',
  estados_pago_programado: 'SELECT id, nombre FROM estados_pago_programado ORDER BY id',
  tipos_cobro: 'SELECT id, nombre, activo FROM tipos_cobro ORDER BY id',
  tipos_evidencia_pago: 'SELECT id, nombre FROM tipos_evidencia_pago ORDER BY id',
  conceptos_dispersion: 'SELECT id, nombre, tipo_destino, activo, es_remanente FROM conceptos_dispersion ORDER BY id',
  estados_comisiones: 'SELECT id, nombre FROM estados_comisiones ORDER BY id',
  estados_corte: 'SELECT id, nombre FROM estados_corte ORDER BY id',
  estados_prenomina: 'SELECT id, nombre FROM estados_prenomina ORDER BY id',
};

function preflight() {
  if (inheritedUrl && inheritedUrl !== process.env.DATABASE_URL) throw new Error('DATABASE_URL heredada no coincide con .env.test');
  const run = (args) => spawnSync(process.execPath, args, { cwd: root, env: process.env, encoding: 'utf8', maxBuffer: 1024 * 1024 });
  const check = run([path.join(root, 'test', 'postgres-test-preflight.cjs')]);
  if (check.status !== 0) throw new Error('Falló el preflight de Test');
  const report = JSON.parse(check.stdout);
  if (report.actual.database !== target.database || report.actual.schema !== target.schema ||
      Number(report.actual.port) !== target.port || !['127.0.0.1', '::1'].includes(report.actual.address) ||
      report.migrations_applied !== 28) throw new Error('Identidad o migraciones incompatibles con Test');
  const status = run(['-r', path.join(root, 'test', 'test-environment.cjs'), path.join(root, 'node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'status']);
  if (status.status !== 0 || !status.stdout.includes('28 migrations found') || !status.stdout.includes('Database schema is up to date!')) {
    throw new Error('Prisma detectó migraciones pendientes o inesperadas');
  }
}

function readManifest() {
  if (!fs.existsSync(manifestPath)) return null;
  const value = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (value.lote !== batch || value.database !== 'h3ga_finanzas_test' || value.version !== 1 || !value.clientes) {
    throw new Error('Manifiesto incompatible; se requiere revisión manual');
  }
  return value;
}

async function inspect() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const identity = (await client.query('SELECT current_database() AS database, current_schema() AS schema, inet_server_port() AS port, host(inet_server_addr()) AS address')).rows[0];
    if (identity.database !== target.database || identity.schema !== target.schema || Number(identity.port) !== target.port || !['127.0.0.1', '::1'].includes(identity.address)) throw new Error('Identidad PostgreSQL distinta de Test');
    const rows = (await client.query('SELECT u.id, u.correo_electronico, u.activo, r.id AS rol_id, r.nombre AS rol FROM usuarios u LEFT JOIN roles r ON r.id = u.rol_id WHERE u.correo_electronico = ANY($1::text[])', [accounts.map(a => a.email)])).rows;
    const users = accounts.map(a => {
      const row = rows.find(u => u.correo_electronico === a.email);
      return { clave: a.key, encontrado: !!row, id: row?.id ?? null, activo: row?.activo ?? null, rol: row?.rol ?? null, rol_correcto: !!row && row.rol === a.role && row.rol_id === a.roleId };
    });
    const catalogs = {};
    for (const [name, sql] of Object.entries(catalogQueries)) catalogs[name] = (await client.query(sql)).rows;
    const possibleCollisions = (await client.query('SELECT count(*)::int AS total FROM clientes WHERE nombre = ANY($1::text[]) AND apellido_paterno = $2', [slots.map(s => s.name), 'Integracion Local 2026'])).rows[0].total;
    const manifest = readManifest();
    const manifestIds = manifest ? Object.values(manifest.clientes).filter(x => x && x.id).map(x => x.id) : [];
    const persisted = manifestIds.length ? (await client.query('SELECT id, asesor_id, referido_por_cliente_id FROM clientes WHERE id = ANY($1::uuid[])', [manifestIds])).rows : [];
    await client.query('COMMIT');
    return { destino: `${target.host}:${target.port}/${target.database}/${target.schema}`, migraciones: '28/28', lote: batch, usuarios: users, catalogos: catalogs, posibles_coincidencias_nombre: possibleCollisions, manifiesto: manifest ? { clientes: manifest.clientes, pendiente: manifest.pendiente ?? null, encontrados: persisted.length } : null };
  } finally { client.release(); await pool.end(); }
}

function saveManifest(manifest) {
  const temporary = `${manifestPath}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(manifest, null, 2) + '\n', { encoding: 'utf8', flag: 'w' });
  fs.renameSync(temporary, manifestPath);
}

async function execute(report) {
  if (report.usuarios.some(u => !u.encontrado || !u.activo || !u.rol_correcto)) throw new Error('Una cuenta requerida falta, está inactiva o tiene otro rol');
  fs.mkdirSync(directory, { recursive: true });
  let lock;
  try { lock = fs.openSync(lockPath, 'wx'); } catch { throw new Error('Existe bloqueo de otra ejecución; revisar antes de continuar'); }
  let app;
  try {
    let manifest = readManifest();
    if (!manifest) {
      if (report.posibles_coincidencias_nombre) throw new Error('Hay coincidencias sin manifiesto; no se asumirá propiedad');
      manifest = { version: 1, lote: batch, database: target.database, clientes: {}, pendiente: null };
      saveManifest(manifest);
    }
    if (manifest.pendiente) throw new Error('Una operación quedó sin confirmar en el manifiesto; reconciliar manualmente');
    const { NestFactory } = require('@nestjs/core');
    const { AppModule } = require('../dist/app.module.js');
    const { PrismaService } = require('../dist/database/prisma.service.js');
    const { ClientesService } = require('../dist/clientes/clientes.service.js');
    const { CreateClienteDto } = require('../dist/clientes/dto/create-cliente.dto.js');
    const { ValidationPipe } = require('@nestjs/common');
    app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    const prisma = app.get(PrismaService);
    const [identity] = await prisma.$queryRaw`SELECT current_database() AS database, current_schema() AS schema, inet_server_port() AS port, host(inet_server_addr()) AS address`;
    if (identity.database !== target.database || identity.schema !== target.schema || Number(identity.port) !== target.port || !['127.0.0.1', '::1'].includes(identity.address)) throw new Error('Prisma no está conectado a Test');
    const service = app.get(ClientesService);
    const validator = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    for (const slot of slots) {
      const owner = report.usuarios.find(u => u.clave === slot.owner);
      if (manifest.clientes[slot.key]) {
        const current = await prisma.clientes.findUnique({ where: { id: manifest.clientes[slot.key].id }, select: { id: true, asesor_id: true } });
        if (!current || current.asesor_id !== owner.id) throw new Error(`El cliente ${slot.key} no coincide con el manifiesto; no se modifica`);
        console.log(`Cliente existente ${slot.key}: ${current.id}`);
        continue;
      }
      const collision = await prisma.clientes.findFirst({ where: { nombre: slot.name, apellido_paterno: 'Integracion Local 2026' }, select: { id: true } });
      if (collision) throw new Error(`Hay una coincidencia sin identificar para ${slot.key}; se requiere revisión manual`);
      const referral = slot.referral ? manifest.clientes[slot.referral]?.id : undefined;
      if (slot.referral && !referral) throw new Error('Falta el cliente referidor del manifiesto');
      const dto = await validator.transform(
        { nombre: slot.name, apellido_paterno: 'Integracion Local 2026', ...(referral ? { referido_por_cliente_id: referral } : {}) },
        { type: 'body', metatype: CreateClienteDto },
      );
      manifest.pendiente = { accion: 'crear_cliente', clave: slot.key, asesor_id: owner.id };
      saveManifest(manifest);
      const created = await service.create(dto, { id: owner.id, roles: { nombre: 'asesor' } });
      const audit = referral ? await prisma.historial_referidor_cliente.findFirst({ where: { cliente_id: created.id, referidor_nuevo_id: referral, actor_id: owner.id }, select: { id: true } }) : null;
      if (referral && !audit) throw new Error('No se encontró la auditoría inicial del referidor; reconciliar antes de continuar');
      manifest.clientes[slot.key] = { id: created.id, asesor_id: owner.id, referidor_inicial_id: referral ?? null, historial_inicial_id: audit?.id ?? null };
      manifest.pendiente = null;
      saveManifest(manifest);
      console.log(`Cliente ${slot.key}: ${created.id}`);
    }
    console.log('Lote de clientes finalizado. Los registros y el manifiesto se conservan.');
  } finally {
    if (app) await app.close();
    fs.closeSync(lock);
    fs.unlinkSync(lockPath);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const diagnostic = args.length === 0 || (args.length === 1 && args[0] === '--diagnostico');
  const apply = args.length === 2 && args[0] === '--ejecutar' && args[1] === '--aprobar-lote-clientes';
  if (!diagnostic && !apply) throw new Error('Usar --diagnostico o --ejecutar --aprobar-lote-clientes');
  preflight();
  const report = await inspect();
  if (diagnostic) console.log(JSON.stringify(report, null, 2));
  else await execute(report);
}

main().catch((error) => { console.error(`Semilla detenida: ${error.message}`); process.exitCode = 1; });
