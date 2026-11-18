const { Pool } = require('pg');
const { loadPostgresTestEnvironment } = require('./test-environment.cjs');

async function main() {
  const target = loadPostgresTestEnvironment();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const identity = await pool.query(
      'SELECT current_database() AS database, current_schema() AS schema, inet_server_port() AS port, host(inet_server_addr()) AS address',
    );
    const actual = identity.rows[0];
    if (
      actual.database !== target.database ||
      actual.schema !== target.schema ||
      Number(actual.port) !== target.port ||
      !['127.0.0.1', '::1'].includes(actual.address)
    ) {
      throw new Error(`La identidad PostgreSQL no coincide con la base I3 autorizada: ${JSON.stringify({ target, actual })}`);
    }
    const migration = await pool.query(
      'SELECT COUNT(*)::int AS applied FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
    );
    const pausedColumn = await pool.query(
      "SELECT data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='clientes' AND column_name='pausado'",
    );
    const roles = await pool.query('SELECT id, nombre FROM roles ORDER BY id');
    const services = await pool.query('SELECT id, nombre, activo FROM servicios ORDER BY id');
    const contractStates = await pool.query('SELECT id, nombre FROM estados_contratos ORDER BY id');
    const folioSchema = await pool.query("SELECT to_regclass('public.folios_contrato_contadores') IS NOT NULL AS counter_table, EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='servicios' AND column_name='codigo_folio') AS service_code");
    const testCounters = folioSchema.rows[0].counter_table
      ? (await pool.query("SELECT COUNT(*)::int AS count FROM folios_contrato_contadores f JOIN servicios s ON s.id=f.servicio_id WHERE s.nombre LIKE 'I3E2E-%'")).rows[0].count
      : null;
    const artifacts = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM usuarios WHERE correo_electronico LIKE 'i3e2e-%') AS users,
        (SELECT COUNT(*)::int FROM clientes WHERE apellido_paterno LIKE 'I3E2E-%') AS clients,
        (SELECT COUNT(*)::int FROM contratos c JOIN clientes cl ON cl.id = c.cliente_id
         WHERE cl.apellido_paterno LIKE 'I3E2E-%') AS contracts,
        (SELECT COUNT(*)::int FROM servicios WHERE nombre LIKE 'I3E2E-%') AS services,
        (SELECT COUNT(*)::int FROM estados_contratos WHERE nombre LIKE 'I3E2E-%') AS contract_states
    `);
    const paymentArtifacts = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM usuarios WHERE correo_electronico LIKE 'paye2e-%') AS users,
        (SELECT COUNT(*)::int FROM clientes WHERE apellido_paterno LIKE 'PAYE2E-%') AS clients,
        (SELECT COUNT(*)::int FROM contratos WHERE folio LIKE 'PAYE2E-%') AS contracts,
        (SELECT COUNT(*)::int FROM pagos p JOIN contratos c ON c.id=p.contrato_id WHERE c.folio LIKE 'PAYE2E-%') AS payments,
        (SELECT COUNT(*)::int FROM pagos_programados p JOIN contratos c ON c.id=p.contrato_id WHERE c.folio LIKE 'PAYE2E-%') AS scheduled,
        (SELECT COUNT(*)::int FROM evidencias_pago e JOIN pagos p ON p.id=e.pago_id JOIN contratos c ON c.id=p.contrato_id WHERE c.folio LIKE 'PAYE2E-%') AS evidences,
        (SELECT COUNT(*)::int FROM comisiones x JOIN pagos p ON p.id=x.pago_id JOIN contratos c ON c.id=p.contrato_id WHERE c.folio LIKE 'PAYE2E-%') AS commissions,
        (SELECT COUNT(*)::int FROM dispersiones_comision d JOIN comisiones x ON x.id=d.comision_id JOIN pagos p ON p.id=x.pago_id JOIN contratos c ON c.id=p.contrato_id WHERE c.folio LIKE 'PAYE2E-%') AS disbursements,
        (SELECT COUNT(*)::int FROM receptores_dispersion r JOIN usuarios u ON u.id=r.creado_por WHERE u.correo_electronico LIKE 'paye2e-%') AS receivers,
        (SELECT COUNT(*)::int FROM formas_pago WHERE nombre LIKE 'PAYE2E-%') AS methods,
        (SELECT COUNT(*)::int FROM tipos_cobro WHERE nombre LIKE 'PAYE2E-%') AS collection_types,
        (SELECT COUNT(*)::int FROM servicios WHERE nombre LIKE 'PAYE2E-%') AS services,
        (SELECT COUNT(*)::int FROM estados_contratos WHERE nombre LIKE 'PAYE2E-%') AS contract_states
    `);
    console.log(JSON.stringify({
      target,
      actual,
      migrations_applied: migration.rows[0].applied,
      paused_column: pausedColumn.rows[0] || null,
      roles: roles.rows,
      services: services.rows,
      contract_states: contractStates.rows,
      folio_schema: folioSchema.rows[0],
      test_counters: testCounters,
      test_artifacts: artifacts.rows[0],
      payment_test_artifacts: paymentArtifacts.rows[0],
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`Preflight I3 falló: ${error.message}`);
  process.exitCode = 1;
});
