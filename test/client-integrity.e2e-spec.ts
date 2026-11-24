import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

const prefix = `CIE2E-${randomUUID().slice(0, 12)}`;

describe('Integridad de clientes en PostgreSQL Test', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let adminId: string;
  let financialId: string;
  let advisorId: string;
  let otherAdvisorId: string;
  let auxiliaryId: string;
  let emptyId: string;
  let referrerId: string;
  let contractClientId: string;
  let rutaClientId: string;
  let cascadeClientId: string;
  let objectiveId: number;
  let referredId: string;
  let contractId: string;
  let serviceId: number;
  let stateId: number;
  let rutaLinkId: string;
  let auditReady = false;
  const userIds: string[] = [];
  const clientIds: string[] = [];
  const server = () => app.getHttpServer();
  const auth = async (id: string) => `Bearer ${await jwt.signAsync({ sub: id })}`;

  async function user(role: string, suffix: string) {
    const catalog = await prisma.roles.findUniqueOrThrow({ where: { nombre: role } });
    const row = await prisma.usuarios.create({ data: {
      rol_id: catalog.id, nombre: 'Prueba', apellido_paterno: suffix,
      correo_electronico: `${prefix}.${suffix}@example.test`.toLowerCase(), activo: true,
    } });
    userIds.push(row.id);
    return row.id;
  }
  async function client(advisor: string, suffix: string) {
    const row = await prisma.clientes.create({ data: {
      nombre: 'Prueba', apellido_paterno: `${prefix}-${suffix}`, asesor_id: advisor,
    } });
    clientIds.push(row.id);
    return row.id;
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
    if (process.env.H3GA_I3_TEST_DATABASE_VERIFIED !== '1') throw new Error('Falta guarda PostgreSQL Test');
    const identitySql = 'SELECT current_database() AS database,current_schema() AS schema,inet_server_port() AS port,host(inet_server_addr()) AS address';
    const fromPrisma = (await prisma.$queryRawUnsafe<Array<{ database: string; schema: string; port: number; address: string }>>(identitySql))[0];
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const fromPg = (await pool.query(identitySql)).rows[0];
    await pool.end();
    expect(fromPrisma).toEqual(fromPg);
    expect(fromPg).toMatchObject({ database: process.env.H3GA_TEST_DATABASE_NAME, schema: 'public', port: 5433 });
    expect(['::1', '127.0.0.1']).toContain(fromPg.address);
    const migrations = await prisma.$queryRaw<Array<{ applied: number }>>`
      SELECT COUNT(*)::int AS applied FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    if (migrations[0].applied < 26) throw new Error('Faltan migraciones autorizadas anteriores a I7');
    auditReady = (await prisma.$queryRaw<Array<{ ready: boolean }>>`
      SELECT to_regclass('public.clientes_eliminaciones') IS NOT NULL AS ready`)[0].ready;
    adminId = await user('administrador', 'admin');
    financialId = await user('administrador financiero', 'financial');
    advisorId = await user('asesor', 'advisor');
    otherAdvisorId = await user('asesor', 'other');
    auxiliaryId = await user('auxiliar administrativo', 'auxiliary');
    emptyId = await client(advisorId, 'empty');
    referrerId = await client(advisorId, 'referrer');
    contractClientId = await client(advisorId, 'contract');
    rutaClientId = await client(advisorId, 'ruta');
    cascadeClientId = await client(advisorId, 'cascade');
    const objective = await prisma.objetivo_especifico_inicial.create({ data: { nombre: `${prefix} objetivo` } });
    objectiveId = objective.id;
    await prisma.cliente_objetivos_especificos.create({ data: { cliente_id: cascadeClientId, objetivo_id: objectiveId } });
    const service = await prisma.servicios.create({ data: { nombre: `${prefix} servicio`, activo: true } });
    serviceId = service.id;
    const state = await prisma.estados_contratos.create({ data: { nombre: `${prefix} estado`, orden: 1 } });
    stateId = state.id;
    const contract = await prisma.contratos.create({ data: {
      cliente_id: contractClientId, servicio_id: serviceId, asesor_id: advisorId,
      folio: `${prefix}-C`, estado_contrato_id: stateId, fecha_contrato: new Date('2026-11-18'),
    } });
    contractId = contract.id;
    rutaLinkId = randomUUID();
    await prisma.$executeRaw`INSERT INTO "cliente_auxiliares" ("id","cliente_id","auxiliar_id","autorizado_por")
      VALUES (${rutaLinkId}::uuid,${rutaClientId}::uuid,${auxiliaryId}::uuid,${adminId}::uuid)`;
  }, 30_000);

  afterAll(async () => {
    try {
      if (!prisma) return;
      if (rutaLinkId) await prisma.$executeRaw`DELETE FROM "cliente_auxiliares" WHERE "id"=${rutaLinkId}::uuid`;
      if (cascadeClientId && objectiveId) await prisma.cliente_objetivos_especificos.delete({ where: { cliente_id_objetivo_id: { cliente_id: cascadeClientId, objetivo_id: objectiveId } } });
      if (contractId) await prisma.contratos.delete({ where: { id: contractId } });
      if (clientIds.length) {
        await prisma.historial_referidor_cliente.deleteMany({ where: { cliente_id: { in: clientIds } } });
        for (const id of [...clientIds].reverse()) {
          await prisma.clientes.deleteMany({ where: { id } });
        }
      }
      if (serviceId) await prisma.servicios.delete({ where: { id: serviceId } });
      if (stateId) await prisma.estados_contratos.delete({ where: { id: stateId } });
      if (objectiveId) await prisma.objetivo_especifico_inicial.delete({ where: { id: objectiveId } });
      if (auditReady && clientIds.length) await prisma.clientes_eliminaciones.deleteMany({ where: { cliente_id: { in: clientIds } } });
      if (userIds.length) await prisma.usuarios.deleteMany({ where: { id: { in: userIds } } });
    } finally {
      if (app) await app.close();
    }
  }, 30_000);

  it('previsualiza las 22 FK reales sin exponer identidades ajenas', async () => {
    const url = `/api/clientes/${emptyId}/dependencias`;
    await request(server()).get(url).expect(401);
    await request(server()).get(url).set('Authorization', await auth(advisorId)).expect(403);
    await request(server()).get(url).set('Authorization', await auth(otherAdvisorId)).expect(403);
    await request(server()).get(url).set('Authorization', await auth(auxiliaryId)).expect(403);
    await request(server()).get('/api/clientes/no-uuid/dependencias').set('Authorization', await auth(adminId)).expect(400);
    await request(server()).get(`/api/clientes/${randomUUID()}/dependencias`).set('Authorization', await auth(adminId)).expect(404);
    const preview = await request(server()).get(url).set('Authorization', await auth(adminId)).expect(200);
    expect(preview.body.apto_para_eliminacion).toBe(true);
    expect(preview.body.dependencias).toHaveLength(22);
    expect(preview.body.bloqueantes).toEqual([]);
    expect(preview.body.indirectas.pagos).toBe(0);
    expect(JSON.stringify(preview.body)).not.toContain(`${prefix}.`);
    await request(server()).get(url).set('Authorization', await auth(financialId)).expect(200);
  });

  it('bloquea contrato y relación de Ruta sin alterar sus filas', async () => {
    const byContract = await request(server()).get(`/api/clientes/${contractClientId}/dependencias`)
      .set('Authorization', await auth(adminId)).expect(200);
    expect(byContract.body.bloqueantes).toEqual(expect.arrayContaining([expect.objectContaining({ tabla: 'contratos', columna: 'cliente_id', cantidad: 1 })]));
    const conflict = await request(server()).delete(`/api/clientes/${contractClientId}`)
      .set('Authorization', await auth(adminId)).expect(409);
    expect(conflict.body.codigo).toBe('CLIENTE_CON_DEPENDENCIAS');
    expect(await prisma.contratos.count({ where: { id: contractId } })).toBe(1);
    const byRuta = await request(server()).get(`/api/clientes/${rutaClientId}/dependencias`)
      .set('Authorization', await auth(financialId)).expect(200);
    expect(byRuta.body.bloqueantes).toEqual(expect.arrayContaining([expect.objectContaining({ tabla: 'cliente_auxiliares', cantidad: 1, on_delete: 'RESTRICT' })]));
    await request(server()).delete(`/api/clientes/${rutaClientId}`)
      .set('Authorization', await auth(financialId)).expect(409);
    expect(await prisma.clientes.count({ where: { id: rutaClientId } })).toBe(1);
  });

  it('impide que ON DELETE CASCADE borre objetivos persistidos', async () => {
    const preview = await request(server()).get(`/api/clientes/${cascadeClientId}/dependencias`)
      .set('Authorization', await auth(adminId)).expect(200);
    expect(preview.body.bloqueantes).toEqual(expect.arrayContaining([
      expect.objectContaining({ tabla: 'cliente_objetivos_especificos', cantidad: 1, on_delete: 'CASCADE' }),
    ]));
    const blocked = await request(server()).delete(`/api/clientes/${cascadeClientId}`)
      .set('Authorization', await auth(adminId)).expect(409);
    expect(blocked.body.codigo).toBe('CLIENTE_CON_DEPENDENCIAS');
    expect(await prisma.cliente_objetivos_especificos.count({ where: { cliente_id: cascadeClientId } })).toBe(1);
  });

  it('conserva referidor e historial y condiciona el retiro libre a la auditoría', async () => {
    const created = await request(server()).post('/api/clientes')
      .set('Authorization', await auth(advisorId))
      .send({ nombre: 'Prueba', apellido_paterno: `${prefix}-referred`, referido_por_cliente_id: referrerId }).expect(201);
    referredId = created.body.id;
    clientIds.push(referredId);
    const referrer = await request(server()).get(`/api/clientes/${referrerId}/dependencias`)
      .set('Authorization', await auth(adminId)).expect(200);
    expect(referrer.body.bloqueantes).toEqual(expect.arrayContaining([
      expect.objectContaining({ tabla: 'clientes', columna: 'referido_por_cliente_id', cantidad: 1 }),
      expect.objectContaining({ tabla: 'historial_referidor_cliente', columna: 'referidor_nuevo_id', cantidad: 1 }),
    ]));
    await request(server()).delete(`/api/clientes/${referrerId}`)
      .set('Authorization', await auth(adminId)).expect(409);
    const free = await request(server()).delete(`/api/clientes/${emptyId}`)
      .set('Authorization', await auth(adminId));
    if (auditReady) {
      expect(free.status).toBe(204);
      expect(await prisma.clientes.count({ where: { id: emptyId } })).toBe(0);
      expect(await prisma.clientes_eliminaciones.count({ where: { cliente_id: emptyId, eliminado_por: adminId } })).toBe(1);
    } else {
      expect(free.status).toBe(409);
      expect(free.body.codigo).toBe('AUDITORIA_NO_DISPONIBLE');
      expect(await prisma.clientes.count({ where: { id: emptyId } })).toBe(1);
    }
    expect(await prisma.historial_referidor_cliente.count({ where: { cliente_id: referredId } })).toBe(1);
  });
});
