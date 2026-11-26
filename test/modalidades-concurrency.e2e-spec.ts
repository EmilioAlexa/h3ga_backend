/** Pruebas de escrituras concurrentes REALES, pendientes hasta aplicar la migración
 * con autorización en una base aislada. No ejecutan migraciones ni semillas.
 * H3GA_MODALIDADES_TEST_WRITES=1 y H3GA_MODALIDADES_TEST_DATABASE_URL son explícitos.
 * La base debe llamarse h3ga_modalidades_test y contener un asesor activo.
 * Las limpiezas solo eliminan filas creadas por ESTA suite con UUID aleatorios.
 */
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/database/prisma.service';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { ModalidadesService } from '../src/gestion/modalidades/modalidades.service';

const run = process.env.H3GA_MODALIDADES_TEST_WRITES === '1' ? describe : describe.skip;
run('Modalidades — concurrencia con persistencia real aislada', () => {
  let db: PrismaService, service: ModalidadesService, asesorId: string;
  let pool: Pool;
  const createdClients: string[] = [];
  beforeAll(async () => {
    const raw = process.env.H3GA_MODALIDADES_TEST_DATABASE_URL;
    if (!raw) throw new Error('Falta URL explícita de la base aislada');
    const url = new URL(raw);
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/h3ga_modalidades_test') throw new Error('Esta suite no admite bases compartidas ni de Finanzas');
    pool = new Pool({ connectionString: raw, options: '-c timezone=UTC' });
    db = new PrismaClient({ adapter: new PrismaPg(pool) }) as PrismaService; await db.$connect();
    const ready = await db.$queryRaw<{ tabla: string | null }[]>`SELECT to_regclass('public.modalidades_seguimiento')::text AS tabla`;
    if (!ready[0].tabla) throw new Error('La migración aprobada aún no está aplicada; la suite no la ejecuta');
    const asesor = await db.usuarios.findFirst({ where: { activo: true, roles: { nombre: 'asesor' } }, select: { id: true } });
    if (!asesor) throw new Error('Se requiere asesor de pruebas ya existente');
    asesorId = asesor.id; service = new ModalidadesService(db, {} as any);
  });
  afterAll(async () => {
    if (!db) return;
    for (const cliente_id of createdClients) await db.$transaction(async (tx) => {
      await tx.modalidades_seguimiento.deleteMany({ where: { aplicacion: { cliente_id } } });
      await tx.modalidades_aplicacion.deleteMany({ where: { cliente_id } });
      await tx.diagnostico_especializado.deleteMany({ where: { cliente_id } });
      await tx.clientes.delete({ where: { id: cliente_id } });
    });
    await db.$disconnect();
    await pool.end();
  });
  async function cliente() {
    const id = randomUUID();
    await db.$transaction(async (tx) => {
      await tx.clientes.create({ data: { id, nombre: 'Prueba concurrencia Modalidades', apellido_paterno: id, asesor_id: asesorId } });
      await tx.diagnostico_especializado.create({ data: { cliente_id: id, asesor_id: asesorId } });
    });
    createdClients.push(id); return id;
  }
  const user = () => ({ id: asesorId, roles: { nombre: 'asesor' } });
  it('12 altas simultáneas producen una sola aplicación y un seguimiento', async () => {
    const id = await cliente();
    await Promise.all(Array.from({ length: 12 }, () => service.guardar(id, { modalidades: ['modalidad_10'] }, user())));
    expect(await db.modalidades_aplicacion.count({ where: { cliente_id: id } })).toBe(1);
    expect(await db.modalidades_seguimiento.count({ where: { aplicacion: { cliente_id: id } } })).toBe(1);
  }, 30000);
  it('dos altas incompatibles concurrentes no guardan M10+M40', async () => {
    const id = await cliente();
    const outcomes = await Promise.allSettled([
      service.guardar(id, { modalidades: ['modalidad_10'] }, user()),
      service.guardar(id, { modalidades: ['modalidad_40'] }, user()),
    ]);
    expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.modalidades_aplicacion.count({ where: { cliente_id: id } })).toBe(1);
    const row = await db.modalidades_aplicacion.findFirstOrThrow({ where: { cliente_id: id } });
    expect(row.aplica_m10 && row.aplica_m40).toBe(false);
  });
  it('actualizaciones simultáneas conservan los datos de ambas modalidades', async () => {
    const id = await cliente();
    await service.guardar(id, { modalidades: ['modalidad_10', 'modalidad_40_retroactiva'] }, user());
    await Promise.all([
      service.actualizar(id, 'modalidad_10', { fecha_cita_imss: '2027-01-01', ultimo_salario_diario_registrado: '100.11' }, user()),
      service.actualizar(id, 'modalidad_40_retroactiva', { fecha_cita_imss: '2027-02-02', ultimo_salario_diario_registrado: '200.22' }, user()),
    ]);
    const result = await service.findModalidades(id, user());
    expect(result!.modalidades.find((m) => m.modalidad === 'modalidad_10')!.ultimo_salario_diario_registrado!.toString()).toBe('100.11');
    expect(result!.modalidades.find((m) => m.modalidad === 'modalidad_40_retroactiva')!.ultimo_salario_diario_registrado!.toString()).toBe('200.22');
    expect(result!.valores_historicos_compartidos.ultimo_salario_diario_registrado).toBeNull();
  });
});
