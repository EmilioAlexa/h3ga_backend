// Esta suite se incorpora a jest-postgres-e2e.json solo después de que el usuario
// aplique manualmente 20261118210000_clientes_eliminaciones_auditoria en PostgreSQL Test.
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { Pool, PoolClient } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

const prefix = `RETE2E-${randomUUID().slice(0, 12)}`;

describe('Retiro físico de clientes con auditoría en PostgreSQL Test', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let pool: Pool;
  let adminId: string;
  let financialId: string;
  let advisorId: string;
  let serviceId: number;
  let stateId: number;
  const userIds: string[] = [];
  const clientIds: string[] = [];
  const contractIds: string[] = [];
  const server = () => app.getHttpServer();
  const auth = async (id: string) => `Bearer ${await jwt.signAsync({ sub: id })}`;

  async function client(suffix: string) {
    const row = await prisma.clientes.create({ data: {
      nombre: 'Prueba', apellido_paterno: `${prefix}-${suffix}`, asesor_id: advisorId,
    } });
    clientIds.push(row.id);
    return row.id;
  }
  async function user(role: string, suffix: string) {
    const catalog = await prisma.roles.findUniqueOrThrow({ where: { nombre: role } });
    const row = await prisma.usuarios.create({ data: {
      rol_id: catalog.id, nombre: 'Prueba', apellido_paterno: suffix,
      correo_electronico: `${prefix}.${suffix}@example.test`.toLowerCase(), activo: true,
    } });
    userIds.push(row.id);
    return row.id;
  }
  async function waitForDeleteLock() {
    for (let attempt = 0; attempt < 100; attempt++) {
      const row = await pool.query(`SELECT EXISTS (
        SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
          AND wait_event_type='Lock' AND query LIKE '%FOR UPDATE%'
          AND query LIKE '%clientes%'
      ) AS waiting`);
      if (row.rows[0].waiting) return;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('El DELETE no llegó a esperar el bloqueo de fila del cliente');
  }
  async function heldClientLock(id: string): Promise<PoolClient> {
    const connection = await pool.connect();
    try {
      await connection.query('BEGIN');
      await connection.query('SELECT id FROM clientes WHERE id=$1 FOR KEY SHARE', [id]);
      return connection;
    } catch (error) {
      await connection.query('ROLLBACK');
      connection.release();
      throw error;
    }
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerStorage)
      .useValue({ increment: async () => ({ totalHits: 1, timeToExpire: 60_000, isBlocked: false, timeToBlockExpire: 0 }) })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
    if (process.env.H3GA_I3_TEST_DATABASE_VERIFIED !== '1') throw new Error('Falta la guarda PostgreSQL Test');
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== 'localhost' || url.port !== '5433' || url.pathname !== '/h3ga_finanzas_test' || url.searchParams.get('schema') !== 'public') {
      throw new Error('La suite solo permite PostgreSQL Test');
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const sql = 'SELECT current_database() AS database,current_schema() AS schema,inet_server_port() AS port,host(inet_server_addr()) AS address';
    const fromPg = (await pool.query(sql)).rows[0];
    const fromPrisma = (await prisma.$queryRawUnsafe<Array<typeof fromPg>>(sql))[0];
    expect(fromPrisma).toEqual(fromPg);
    expect(fromPg).toMatchObject({ database: 'h3ga_finanzas_test', schema: 'public', port: 5433 });
    expect(['127.0.0.1', '::1']).toContain(fromPg.address);
    const migrations = await prisma.$queryRaw<Array<{ applied: number; ready: boolean }>>`
      SELECT (SELECT COUNT(*)::int FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS applied,
             to_regclass('public.clientes_eliminaciones') IS NOT NULL AS ready`;
    if (migrations[0].applied !== 27 || !migrations[0].ready) {
      throw new Error('La migración de auditoría I7 no está aplicada exclusivamente en PostgreSQL Test');
    }
    adminId = await user('administrador', 'admin');
    financialId = await user('administrador financiero', 'financial');
    advisorId = await user('asesor', 'advisor');
    const service = await prisma.servicios.create({ data: { nombre: `${prefix} servicio`, activo: true } });
    serviceId = service.id;
    const state = await prisma.estados_contratos.create({ data: { nombre: `${prefix} estado`, orden: 1 } });
    stateId = state.id;
  }, 30_000);

  afterAll(async () => {
    try {
      if (!prisma) return;
      if (contractIds.length) await prisma.contratos.deleteMany({ where: { id: { in: contractIds } } });
      if (clientIds.length) {
        await prisma.historial_referidor_cliente.deleteMany({ where: { cliente_id: { in: clientIds } } });
        for (const id of [...clientIds].reverse()) await prisma.clientes.deleteMany({ where: { id } });
        await prisma.clientes_eliminaciones.deleteMany({ where: { cliente_id: { in: clientIds } } });
      }
      if (serviceId) await prisma.servicios.delete({ where: { id: serviceId } });
      if (stateId) await prisma.estados_contratos.delete({ where: { id: stateId } });
      if (userIds.length) await prisma.usuarios.deleteMany({ where: { id: { in: userIds } } });
    } finally {
      if (pool) await pool.end();
      if (app) await app.close();
    }
  }, 30_000);

  it('permite a ambos administradores retirar clientes libres y registra un evento durable', async () => {
    for (const actor of [adminId, financialId]) {
      const id = await client(actor === adminId ? 'admin' : 'financial');
      const before = await request(server()).get(`/api/clientes/${id}/dependencias`)
        .set('Authorization', await auth(actor)).expect(200);
      expect(before.body.apto_para_eliminacion).toBe(true);
      await request(server()).delete(`/api/clientes/${id}`)
        .set('Authorization', await auth(actor)).expect(204);
      await request(server()).get(`/api/clientes/${id}`)
        .set('Authorization', await auth(actor)).expect(404);
      const events = await prisma.clientes_eliminaciones.findMany({ where: { cliente_id: id } });
      expect(events).toHaveLength(1);
      expect(events[0].eliminado_por).toBe(actor);
      expect(events[0].eliminado_en).toBeInstanceOf(Date);
    }
  });

  it('serializa dos DELETE simultáneos y deja una sola auditoría', async () => {
    const id = await client('simultaneo');
    const responses = await Promise.all([adminId, financialId].map(async actor =>
      request(server()).delete(`/api/clientes/${id}`).set('Authorization', await auth(actor))));
    expect(responses.map(result => result.status).sort((a, b) => a - b)).toEqual([204, 404]);
    expect(await prisma.clientes.count({ where: { id } })).toBe(0);
    expect(await prisma.clientes_eliminaciones.count({ where: { cliente_id: id } })).toBe(1);
  });

  it('rechaza DELETE que espera un contrato insertado concurrentemente', async () => {
    const id = await client('contrato-concurrente');
    const connection = await heldClientLock(id);
    const deletion = request(server()).delete(`/api/clientes/${id}`)
      .set('Authorization', await auth(adminId)).then(result => result);
    const contractId = randomUUID();
    try {
      await waitForDeleteLock();
      await connection.query(`INSERT INTO contratos
        (id,cliente_id,servicio_id,asesor_id,folio,fecha_contrato,estado_contrato_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [contractId, id, serviceId, advisorId, `${prefix}-C`, '2026-11-18', stateId]);
      contractIds.push(contractId);
      await connection.query('COMMIT');
    } catch (error) {
      await connection.query('ROLLBACK');
      throw error;
    } finally {
      connection.release();
    }
    const response = await deletion;
    expect(response.status).toBe(409);
    expect(response.body.codigo).toBe('CLIENTE_CON_DEPENDENCIAS');
    expect(await prisma.contratos.count({ where: { id: contractId } })).toBe(1);
    expect(await prisma.clientes_eliminaciones.count({ where: { cliente_id: id } })).toBe(0);
  });

  it('rechaza DELETE que espera una nueva relación de Referidor con historial', async () => {
    const referidor = await client('referidor-concurrente');
    const titular = await client('titular-concurrente');
    const connection = await heldClientLock(referidor);
    const deletion = request(server()).delete(`/api/clientes/${referidor}`)
      .set('Authorization', await auth(adminId)).then(result => result);
    try {
      await waitForDeleteLock();
      await connection.query('UPDATE clientes SET referido_por_cliente_id=$1 WHERE id=$2', [referidor, titular]);
      await connection.query(`INSERT INTO historial_referidor_cliente
        (cliente_id,referidor_anterior_id,referidor_nuevo_id,actor_id,motivo)
        VALUES ($1,NULL,$2,$3,$4)`, [titular, referidor, adminId, 'Asignación sintética concurrente']);
      await connection.query('COMMIT');
    } catch (error) {
      await connection.query('ROLLBACK');
      throw error;
    } finally {
      connection.release();
    }
    const response = await deletion;
    expect(response.status).toBe(409);
    expect(response.body.codigo).toBe('CLIENTE_CON_DEPENDENCIAS');
    expect(await prisma.clientes.count({ where: { id: referidor } })).toBe(1);
    expect(await prisma.historial_referidor_cliente.count({ where: { cliente_id: titular } })).toBe(1);
    expect(await prisma.clientes_eliminaciones.count({ where: { cliente_id: referidor } })).toBe(0);
  });
});
