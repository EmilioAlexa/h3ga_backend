import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerStorage } from '@nestjs/throttler';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

const runId = randomUUID().replaceAll('-', '').slice(0, 12);
const runPrefix = `I3E2E-${runId}`;

describe('I3 con PostgreSQL local aislado', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let serviceId: number;
  let currentYear: number;
  const serviceIds: Record<'APD' | 'M10' | 'M40' | 'M40R', number> = {} as Record<'APD' | 'M10' | 'M40' | 'M40R', number>;
  let contractStateId: number;
  let advisorId: string;
  let adminId: string;
  let financialId: string;
  const createdRoleIds: number[] = [];
  const createdServiceIds: number[] = [];
  const createdStateIds: number[] = [];
  const createdUserIds: string[] = [];
  const createdClientIds: string[] = [];
  const createdContractIds: string[] = [];
  let serial = 0;

  const server = () => app.getHttpServer();
  const tokenFor = (id: string) => jwt.signAsync({ sub: id });

  async function assertDatabaseIdentity() {
    if (process.env.H3GA_I3_TEST_DATABASE_VERIFIED !== '1') {
      throw new Error('Falta la guarda del entorno I3');
    }
    const url = new URL(process.env.DATABASE_URL!);
    if (
      url.hostname !== 'localhost' ||
      url.port !== '5433' ||
      url.pathname !== '/h3ga_finanzas_test' ||
      url.searchParams.get('schema') !== 'public'
    ) {
      throw new Error('DATABASE_URL fuera de h3ga_finanzas_test');
    }
    const prismaRows = await prisma.$queryRaw<
      Array<{ database: string; schema: string; port: number; address: string }>
    >`SELECT current_database() AS database, current_schema() AS schema, inet_server_port() AS port, host(inet_server_addr()) AS address`;
    const fromNest = prismaRows[0];
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const fromPg = (await pool.query(
      'SELECT current_database() AS database, current_schema() AS schema, inet_server_port() AS port, host(inet_server_addr()) AS address',
    )).rows[0];
    await pool.end();
    for (const identity of [fromNest, fromPg]) {
      expect(identity).toMatchObject({
        database: 'h3ga_finanzas_test',
        schema: 'public',
        port: 5433,
      });
      expect(['127.0.0.1', '::1']).toContain(identity.address);
    }
    expect(fromNest).toEqual(fromPg);
  }

  async function ensureRole(name: string) {
    const existing = await prisma.roles.findUnique({ where: { nombre: name } });
    if (existing) return existing.id;
    const created = await prisma.roles.create({
      data: { nombre: name, descripcion: `${runPrefix} test` },
    });
    createdRoleIds.push(created.id);
    return created.id;
  }

  async function createUser(roleId: number, label: string) {
    const created = await prisma.usuarios.create({
      data: {
        rol_id: roleId,
        nombre: 'Prueba',
        apellido_paterno: label,
        correo_electronico: `${runPrefix}.${label}@example.test`.toLowerCase(),
        activo: true,
      },
    });
    createdUserIds.push(created.id);
    return created.id;
  }

  async function createClient() {
    const advisorToken = await tokenFor(advisorId);
    const response = await request(server())
      .post('/api/clientes')
      .set('Authorization', `Bearer ${advisorToken}`)
      .send({ nombre: 'Prueba', apellido_paterno: `${runPrefix}-${++serial}` })
      .expect(201);
    createdClientIds.push(response.body.id);
    expect(response.body).toMatchObject({ pausado: false });
    return response.body.id as string;
  }

  const contractBody = (clienteId: string, selectedServiceId = serviceId) => ({
    cliente_id: clienteId,
    servicio_id: selectedServiceId,
    estado_contrato_id: contractStateId,
    fecha_contrato: '2026-11-17',
  });

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerStorage)
      .useValue({ increment: async () => ({ totalHits: 1, timeToExpire: 60_000, isBlocked: false, timeToBlockExpire: 0 }) })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
    // Ninguna escritura ocurre antes de verificar la conexión real de Nest y pg.
    await assertDatabaseIdentity();

    const ready = await prisma.$queryRaw<Array<{ ready: boolean }>>`
      SELECT to_regclass('public.folios_contrato_contadores') IS NOT NULL
        AND EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'servicios' AND column_name = 'codigo_folio') AS ready`;
    if (!ready[0]?.ready) throw new Error('La migracion I3 de folios no esta aplicada a la base de pruebas');
    const existingMappings = await prisma.servicios.count({
      where: { codigo_folio: { in: ['APD', 'M10', 'M40', 'M40R'] } },
    });
    if (existingMappings) throw new Error('La suite I3 requiere que los codigos de servicio de prueba no esten asignados');
    currentYear = (await prisma.$queryRaw<Array<{ anio: number }>>`
      SELECT EXTRACT(YEAR FROM clock_timestamp() AT TIME ZONE 'America/Cancun')::int AS anio`)[0].anio;

    const adminRole = await ensureRole('administrador');
    const financialRole = await ensureRole('administrador financiero');
    const advisorRole = await ensureRole('asesor');
    adminId = await createUser(adminRole, 'admin');
    financialId = await createUser(financialRole, 'financiero');
    advisorId = await createUser(advisorRole, 'asesor');

    for (const code of ['APD', 'M10', 'M40', 'M40R'] as const) {
      const created = await prisma.servicios.create({
        data: { nombre: `${runPrefix} ${code}`, codigo_folio: code, activo: true },
      });
      serviceIds[code] = created.id;
      createdServiceIds.push(created.id);
    }
    serviceId = serviceIds.APD;
    const state = await prisma.estados_contratos.findFirst({ orderBy: { id: 'asc' } });
    if (state) contractStateId = state.id;
    else {
      const created = await prisma.estados_contratos.create({
        data: { nombre: `${runPrefix} estado`, orden: 1 },
      });
      contractStateId = created.id;
      createdStateIds.push(created.id);
    }
  }, 30_000);

  afterAll(async () => {
    try {
      if (prisma && createdClientIds.length) {
        // También recoge un contrato que haya respondido 201 antes de que la prueba registrara su ID.
        const ownContracts = await prisma.contratos.findMany({
          where: { cliente_id: { in: createdClientIds } },
          select: { id: true },
        });
        const ids = [...new Set([...createdContractIds, ...ownContracts.map((row) => row.id)])];
        if (ids.length) await prisma.contratos.deleteMany({ where: { id: { in: ids } } });
        await prisma.clientes.deleteMany({ where: { id: { in: createdClientIds } } });
      }
      if (prisma && createdUserIds.length) {
        await prisma.usuarios.deleteMany({ where: { id: { in: createdUserIds } } });
      }
      if (prisma && createdServiceIds.length) {
        await prisma.folios_contrato_contadores.deleteMany({ where: { servicio_id: { in: createdServiceIds } } });
        await prisma.servicios.deleteMany({ where: { id: { in: createdServiceIds } } });
      }
      if (prisma && createdStateIds.length) {
        await prisma.estados_contratos.deleteMany({ where: { id: { in: createdStateIds } } });
      }
      if (prisma && createdRoleIds.length) {
        await prisma.roles.deleteMany({ where: { id: { in: createdRoleIds } } });
      }
    } finally {
      if (app) await app.close();
    }
  }, 30_000);

  it('confirma que Nest y Prisma escriben exclusivamente en la base autorizada', async () => {
    await assertDatabaseIdentity();
  });

  it('expone el catálogo de servicios al asesor sin inventar IDs', async () => {
    const advisorToken = await tokenFor(advisorId);
    const response = await request(server()).get('/api/finanzas/catalogos/servicios')
      .set('Authorization', `Bearer ${advisorToken}`).expect(200);
    expect(response.body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: serviceId, activo: true }),
    ]));
  });

  it('genera APD, M10, M40 y M40R con contadores independientes y reinicio anual', async () => {
    const advisorToken = await tokenFor(advisorId);
    await prisma.folios_contrato_contadores.create({
      data: { servicio_id: serviceIds.APD, anio: currentYear - 1, ultimo: 968n },
    });
    for (const code of ['APD', 'M10', 'M40', 'M40R'] as const) {
      const clientId = await createClient();
      const response = await request(server()).post('/api/finanzas/contratos')
        .set('Authorization', `Bearer ${advisorToken}`)
        .send(contractBody(clientId, serviceIds[code])).expect(201);
      createdContractIds.push(response.body.id);
      expect(response.body.folio).toBe(`${code === 'APD' ? '' : code}${currentYear}00001`);
      expect(response.body.servicio_id).toBe(serviceIds[code]);
    }
    const secondClientId = await createClient();
    const second = await request(server()).post('/api/finanzas/contratos')
      .set('Authorization', `Bearer ${advisorToken}`)
      .send(contractBody(secondClientId, serviceIds.APD)).expect(201);
    createdContractIds.push(second.body.id);
    expect(second.body.folio).toBe(`${currentYear}00002`);
    expect((await prisma.folios_contrato_contadores.findUnique({
      where: { servicio_id_anio: { servicio_id: serviceIds.APD, anio: currentYear - 1 } },
    }))?.ultimo).toBe(968n);
  });

  it('rechaza folio del request y la base impide duplicados normalizados', async () => {
    const advisorToken = await tokenFor(advisorId);
    const clientId = await createClient();
    const body = contractBody(clientId, serviceIds.M10);
    await request(server()).post('/api/finanzas/contratos')
      .set('Authorization', `Bearer ${advisorToken}`)
      .send({ ...body, folio: 'MANUAL-001' }).expect(400);
    const created = await request(server()).post('/api/finanzas/contratos')
      .set('Authorization', `Bearer ${advisorToken}`)
      .send(body).expect(201);
    createdContractIds.push(created.body.id);
    await expect(prisma.contratos.create({
      data: {
        ...body,
        asesor_id: advisorId,
        folio: `  ${String(created.body.folio).toLowerCase()}  `,
        fecha_contrato: new Date('2026-11-17'),
      },
    })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('revierte la reserva del contador si falla el INSERT contractual', async () => {
    const advisorToken = await tokenFor(advisorId);
    const clientId = await createClient();
    const before = await prisma.folios_contrato_contadores.findUniqueOrThrow({
      where: { servicio_id_anio: { servicio_id: serviceIds.APD, anio: currentYear } },
    });
    const nextFolio = `${currentYear}${(before.ultimo + 1n).toString().padStart(5, '0')}`;
    const collision = await prisma.contratos.create({
      data: {
        ...contractBody(clientId, serviceIds.M10),
        asesor_id: advisorId,
        folio: nextFolio,
        fecha_contrato: new Date('2026-11-17'),
      },
    });
    createdContractIds.push(collision.id);
    try {
      await request(server()).post('/api/finanzas/contratos')
        .set('Authorization', `Bearer ${advisorToken}`)
        .send(contractBody(clientId, serviceIds.APD)).expect(409);
      const after = await prisma.folios_contrato_contadores.findUniqueOrThrow({
        where: { servicio_id_anio: { servicio_id: serviceIds.APD, anio: currentYear } },
      });
      expect(after.ultimo).toBe(before.ultimo);
    } finally {
      await prisma.contratos.delete({ where: { id: collision.id } });
      createdContractIds.splice(createdContractIds.indexOf(collision.id), 1);
    }
    const retry = await request(server()).post('/api/finanzas/contratos')
      .set('Authorization', `Bearer ${advisorToken}`)
      .send(contractBody(clientId, serviceIds.APD)).expect(201);
    createdContractIds.push(retry.body.id);
    expect(retry.body.folio).toBe(nextFolio);
  });

  it('asigna folios distintos en solicitudes simultáneas con PostgreSQL', async () => {
    const advisorToken = await tokenFor(advisorId);
    const clientIds = await Promise.all(Array.from({ length: 6 }, () => createClient()));
    const before = await prisma.folios_contrato_contadores.findUniqueOrThrow({
      where: { servicio_id_anio: { servicio_id: serviceIds.APD, anio: currentYear } },
    });
    const lockPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    const lockClient = await lockPool.connect();
    let responses: Array<request.Response> = [];
    let pending: Promise<Array<request.Response>> | undefined;
    let committed = false;
    try {
      await lockClient.query('BEGIN');
      await lockClient.query('SELECT ultimo FROM folios_contrato_contadores WHERE servicio_id = $1 AND anio = $2 FOR UPDATE',
        [serviceIds.APD, currentYear]);
      pending = Promise.all(clientIds.map((clientId) => request(server())
        .post('/api/finanzas/contratos')
        .set('Authorization', `Bearer ${advisorToken}`)
        .send(contractBody(clientId, serviceIds.APD))));
      let blocked = false;
      for (let attempt = 0; attempt < 30 && !blocked; attempt++) {
        const result = await lockPool.query<{ count: number }>(`
          SELECT COUNT(*)::int AS count FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'
            AND query LIKE '%folios_contrato_contadores%' AND pid <> pg_backend_pid()`);
        blocked = result.rows[0].count > 0;
        if (!blocked) await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(blocked).toBe(true);
      await lockClient.query('COMMIT');
      committed = true;
      responses = await pending;
    } finally {
      if (!committed) await lockClient.query('ROLLBACK').catch(() => undefined);
      await pending?.catch(() => undefined);
      lockClient.release();
      await lockPool.end();
    }
    expect(responses.map((response) => response.status)).toEqual(Array(6).fill(201));
    responses.forEach((response) => createdContractIds.push(response.body.id));
    const folios = responses.map((response) => response.body.folio).sort();
    const expected = Array.from({ length: 6 }, (_, index) =>
      `${currentYear}${(before.ultimo + BigInt(index + 1)).toString().padStart(5, '0')}`);
    expect(folios).toEqual(expected);
    const after = await prisma.folios_contrato_contadores.findUniqueOrThrow({
      where: { servicio_id_anio: { servicio_id: serviceIds.APD, anio: currentYear } },
    });
    expect(after.ultimo).toBe(before.ultimo + 6n);
  });

  it('aplica permisos reales de pausa y reactivación con HTTP 400/401/403/404', async () => {
    const clientId = await createClient();
    const route = `/api/clientes/${clientId}/estado-operativo`;
    const adminToken = await tokenFor(adminId);
    const financialToken = await tokenFor(financialId);
    const advisorToken = await tokenFor(advisorId);
    await request(server()).patch(route).send({ pausado: true }).expect(401);
    await request(server()).patch(route).set('Authorization', `Bearer ${advisorToken}`).send({ pausado: true }).expect(403);
    await request(server()).patch(route).set('Authorization', `Bearer ${adminToken}`).send({ pausado: 'true' }).expect(400);
    await request(server()).patch('/api/clientes/ffffffff-ffff-4fff-8fff-ffffffffffff/estado-operativo')
      .set('Authorization', `Bearer ${adminToken}`).send({ pausado: true }).expect(404);
    await request(server()).patch(route).set('Authorization', `Bearer ${adminToken}`).send({ pausado: true }).expect(200);
    expect((await prisma.clientes.findUnique({ where: { id: clientId } }))?.pausado).toBe(true);
    await request(server()).patch(route).set('Authorization', `Bearer ${financialToken}`).send({ pausado: false }).expect(200);
    expect((await prisma.clientes.findUnique({ where: { id: clientId } }))?.pausado).toBe(false);
    await request(server()).patch(route).set('Authorization', `Bearer ${financialToken}`).send({ pausado: true }).expect(200);
    await request(server()).patch(route).set('Authorization', `Bearer ${adminToken}`).send({ pausado: false }).expect(200);
  });

  it('impide contratar al cliente pausado y permite hacerlo tras reactivar', async () => {
    const clientId = await createClient();
    const adminToken = await tokenFor(adminId);
    const advisorToken = await tokenFor(advisorId);
    const route = `/api/clientes/${clientId}/estado-operativo`;
    await request(server()).patch(route).set('Authorization', `Bearer ${adminToken}`).send({ pausado: true }).expect(200);
    const body = contractBody(clientId);
    await request(server()).post('/api/finanzas/contratos')
      .set('Authorization', `Bearer ${advisorToken}`).send(body).expect(409);
    await request(server()).patch(route).set('Authorization', `Bearer ${adminToken}`).send({ pausado: false }).expect(200);
    const created = await request(server()).post('/api/finanzas/contratos')
      .set('Authorization', `Bearer ${advisorToken}`).send(body).expect(201);
    createdContractIds.push(created.body.id);
    expect(created.body).toMatchObject({ cliente_id: clientId, servicio_id: serviceId, asesor_id: advisorId });
    const listed = await request(server()).get('/api/finanzas/contratos')
      .set('Authorization', `Bearer ${advisorToken}`).expect(200);
    expect(listed.body.data.some((row: { id: string }) => row.id === created.body.id)).toBe(true);
  });

  it('serializa una pausa concurrente antes de crear contrato con bloqueo real de PostgreSQL', async () => {
    const clientId = await createClient();
    const advisorToken = await tokenFor(advisorId);
    let releaseLock!: () => void;
    let signalLocked!: () => void;
    const released = new Promise<void>((resolve) => { releaseLock = resolve; });
    const locked = new Promise<void>((resolve) => { signalLocked = resolve; });
    const owner = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM clientes WHERE id = ${clientId}::uuid FOR UPDATE`;
      await tx.clientes.update({ where: { id: clientId }, data: { pausado: true } });
      signalLocked();
      await released;
    }, { timeout: 10_000 });
    try {
      await locked;
      let settled = false;
      const pending = request(server()).post('/api/finanzas/contratos')
        .set('Authorization', `Bearer ${advisorToken}`)
        .send(contractBody(clientId))
        .then((response) => { settled = true; return response; });
      const watcher = new Pool({ connectionString: process.env.DATABASE_URL });
      let blocked = false;
      try {
        for (let attempt = 0; attempt < 30 && !blocked; attempt++) {
          const result = await watcher.query<{ count: number }>(`
            SELECT COUNT(*)::int AS count
            FROM pg_stat_activity
            WHERE datname = current_database()
              AND wait_event_type = 'Lock'
              AND query LIKE '%clientes%'
              AND query LIKE '%FOR UPDATE%'
              AND pid <> pg_backend_pid()
          `);
          blocked = result.rows[0].count > 0;
          if (!blocked) await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } finally {
        await watcher.end();
      }
      expect(blocked).toBe(true);
      expect(settled).toBe(false);
      releaseLock();
      await owner;
      const response = await pending;
      expect(response.status).toBe(409);
      expect(await prisma.contratos.count({ where: { cliente_id: clientId } })).toBe(0);
    } finally {
      releaseLock();
      await owner.catch(() => undefined);
    }
  }, 20_000);
});
