import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { StorageService } from '../src/finanzas/evidencias/storage/storage.service';

const prefix = `PAYE2E-${randomUUID().slice(0, 12)}`;
const paymentStates = ['Pendiente de revisión financiera', 'Rechazado', 'Pendiente de autorización', 'Validado'];

describe('Pagos con PostgreSQL aislado', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let storage: StorageService;
  let advisorId: string;
  let otherAdvisorId: string;
  let adminId: string;
  let financialId: string;
  let contractId: string;
  let otherServiceContractId: string;
  let transferId: number;
  let cashId: number;
  let serviceId: number;
  let contractStateId: number;
  let penaltyTypeId: number;
  let principalTypeId: number;
  let firstPaymentId: string;
  const roleIds: number[] = [];
  const userIds: string[] = [];
  const clientIds: string[] = [];
  const contractIds: string[] = [];
  const formIds: number[] = [];
  const typeIds: number[] = [];
  const serviceIds: number[] = [];
  const contractStateIds: number[] = [];
  const scheduledStateIds: number[] = [];

  const server = () => app.getHttpServer();
  const tokenFor = (id: string) => jwt.signAsync({ sub: id });
  const paymentBody = (contract: string, method = transferId) => ({
    contrato_id: contract,
    forma_pago_id: method,
    monto: '125.50',
    fecha_pago: '2026-11-17T14:00:00.000Z',
  });

  async function assertTestDatabase() {
    if (process.env.H3GA_I3_TEST_DATABASE_VERIFIED !== '1') throw new Error('Falta la guarda PostgreSQL Test');
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== 'localhost' || url.port !== '5433' || url.pathname !== '/h3ga_finanzas_test' || url.searchParams.get('schema') !== 'public') {
      throw new Error('DATABASE_URL fuera de PostgreSQL Test');
    }
    const sql = 'SELECT current_database() AS database, current_schema() AS schema, inet_server_port() AS port, host(inet_server_addr()) AS address';
    const fromPrisma = (await prisma.$queryRawUnsafe<Array<{ database: string; schema: string; port: number; address: string }>>(sql))[0];
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const fromPg = (await pool.query(sql)).rows[0];
    await pool.end();
    for (const actual of [fromPrisma, fromPg]) {
      expect(actual).toMatchObject({ database: 'h3ga_finanzas_test', schema: 'public', port: 5433 });
      expect(['::1', '127.0.0.1']).toContain(actual.address);
    }
    expect(fromPrisma).toEqual(fromPg);
  }

  async function role(name: string) {
    const existing = await prisma.roles.findUnique({ where: { nombre: name } });
    if (existing) return existing.id;
    const row = await prisma.roles.create({ data: { nombre: name, descripcion: `${prefix} test` } });
    roleIds.push(row.id);
    return row.id;
  }
  async function user(rolId: number, suffix: string) {
    const row = await prisma.usuarios.create({ data: {
      rol_id: rolId, nombre: 'Prueba', apellido_paterno: suffix,
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
  async function contract(advisor: string, suffix: string, selectedService = serviceId) {
    const customer = await client(advisor, suffix);
    const row = await prisma.contratos.create({ data: {
      cliente_id: customer, asesor_id: advisor, servicio_id: selectedService,
      estado_contrato_id: contractStateId, fecha_contrato: new Date('2026-11-17'),
      folio: `${prefix}-${suffix}`,
    } });
    contractIds.push(row.id);
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
    storage = app.get(StorageService);
    await assertTestDatabase();
    const states = await prisma.estados_pago.findMany({ where: { nombre: { in: paymentStates } }, select: { nombre: true } });
    if (states.length !== paymentStates.length) throw new Error('Faltan estados de pago autorizados');
    if (await prisma.servicios.count({ where: { codigo_folio: { in: ['APD', 'M10'] } } })) {
      throw new Error('Un código de servicio de la suite ya pertenece a un catálogo preexistente');
    }
    if (await prisma.tipos_cobro.findUnique({ where: { nombre: 'Penalización' } })) {
      throw new Error('El tipo Penalización ya existe; la suite no modifica catálogos preexistentes');
    }
    const adminRole = await role('administrador');
    const financialRole = await role('administrador financiero');
    const advisorRole = await role('asesor');
    adminId = await user(adminRole, 'admin');
    financialId = await user(financialRole, 'financiero');
    advisorId = await user(advisorRole, 'asesor');
    otherAdvisorId = await user(advisorRole, 'otro');
    const service = await prisma.servicios.create({ data: { nombre: `${prefix} APD`, codigo_folio: 'APD', activo: true } });
    serviceId = service.id;
    serviceIds.push(service.id);
    const otherService = await prisma.servicios.create({ data: { nombre: `${prefix} M10`, codigo_folio: 'M10', activo: true } });
    serviceIds.push(otherService.id);
    const state = await prisma.estados_contratos.create({ data: { nombre: `${prefix} estado`, orden: 1 } });
    contractStateId = state.id;
    contractStateIds.push(state.id);
    contractId = await contract(advisorId, 'contrato');
    await contract(otherAdvisorId, 'otro-contrato');
    otherServiceContractId = await contract(advisorId, 'contrato-m10', otherService.id);
    const transfer = await prisma.formas_pago.create({ data: { nombre: `${prefix} Transferencia`, activo: true } });
    transferId = transfer.id;
    formIds.push(transfer.id);
    const cash = await prisma.formas_pago.create({ data: { nombre: `${prefix} Efectivo`, activo: true } });
    cashId = cash.id;
    formIds.push(cash.id);
    const penalty = await prisma.tipos_cobro.create({ data: { nombre: 'Penalización', activo: true } });
    penaltyTypeId = penalty.id;
    typeIds.push(penalty.id);
    const principal = await prisma.tipos_cobro.create({ data: { nombre: `${prefix} Principal`, activo: true } });
    principalTypeId = principal.id;
    typeIds.push(principal.id);
  }, 30_000);

  afterAll(async () => {
    try {
      if (!prisma) return;
      const payments = contractIds.length ? await prisma.pagos.findMany({ where: { contrato_id: { in: contractIds } }, select: { id: true } }) : [];
      const paymentIds = payments.map((row) => row.id);
      if (paymentIds.length) {
        const files = await prisma.evidencias_pago.findMany({ where: { pago_id: { in: paymentIds } }, select: { archivo_path: true } });
        for (const file of files) await storage.delete(file.archivo_path);
        const commissions = await prisma.comisiones.findMany({ where: { pago_id: { in: paymentIds } }, select: { id: true } });
        if (commissions.length) {
          await prisma.historial_estados_comisiones.deleteMany({ where: { comision_id: { in: commissions.map((row) => row.id) } } });
          await prisma.comisiones.deleteMany({ where: { id: { in: commissions.map((row) => row.id) } } });
        }
        await prisma.evidencias_pago.deleteMany({ where: { pago_id: { in: paymentIds } } });
        await prisma.correcciones_pago.deleteMany({ where: { pago_id: { in: paymentIds } } });
        await prisma.historial_estados_pago.deleteMany({ where: { pago_id: { in: paymentIds } } });
        await prisma.pagos.deleteMany({ where: { id: { in: paymentIds } } });
      }
      if (contractIds.length) await prisma.pagos_programados.deleteMany({ where: { contrato_id: { in: contractIds } } });
      if (scheduledStateIds.length) await prisma.estados_pago_programado.deleteMany({ where: { id: { in: scheduledStateIds } } });
      if (contractIds.length) await prisma.contratos.deleteMany({ where: { id: { in: contractIds } } });
      if (clientIds.length) await prisma.clientes.deleteMany({ where: { id: { in: clientIds } } });
      if (userIds.length) await prisma.usuarios.deleteMany({ where: { id: { in: userIds } } });
      if (formIds.length) await prisma.formas_pago.deleteMany({ where: { id: { in: formIds } } });
      if (typeIds.length) await prisma.tipos_cobro.deleteMany({ where: { id: { in: typeIds } } });
      if (contractStateIds.length) await prisma.estados_contratos.deleteMany({ where: { id: { in: contractStateIds } } });
      if (serviceIds.length) await prisma.servicios.deleteMany({ where: { id: { in: serviceIds } } });
      if (roleIds.length) await prisma.roles.deleteMany({ where: { id: { in: roleIds } } });
    } finally {
      if (app) await app.close();
    }
  }, 30_000);

  it('registra un pago con estado inicial, JWT e historial y aísla pagos ajenos', async () => {
    const token = await tokenFor(advisorId);
    await request(server()).post('/api/finanzas/pagos').set('Authorization', `Bearer ${token}`)
      .send({ ...paymentBody(contractId), registrado_por: otherAdvisorId }).expect(400);
    await request(server()).post('/api/finanzas/pagos').set('Authorization', `Bearer ${token}`)
      .send({ ...paymentBody(contractId), monto: '0.00' }).expect(400);
    const created = await request(server()).post('/api/finanzas/pagos').set('Authorization', `Bearer ${token}`)
      .send(paymentBody(contractId)).expect(201);
    firstPaymentId = created.body.id;
    expect(created.body).toMatchObject({ contrato_id: contractId, registrado_por: advisorId, monto: '125.5' });
    expect(created.body.contratos.folio).toBe(`${prefix}-contrato`);
    expect(created.body.estados_pago.nombre).toBe('Pendiente de revisión financiera');
    const history = await request(server()).get(`/api/finanzas/pagos/${firstPaymentId}/historial`)
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(history.body).toHaveLength(1);
    const otherToken = await tokenFor(otherAdvisorId);
    await request(server()).get(`/api/finanzas/pagos/${firstPaymentId}`)
      .set('Authorization', `Bearer ${otherToken}`).expect(404);
    await request(server()).post('/api/finanzas/pagos').set('Authorization', `Bearer ${otherToken}`)
      .send(paymentBody(contractId)).expect(404);
  });

  it('crea una obligación programada sin pago real y permite varios abonos vinculados', async () => {
    const token = await tokenFor(advisorId);
    const before = await prisma.pagos.count({ where: { contrato_id: contractId } });
    await request(server()).post('/api/finanzas/pagos-programados')
      .set('Authorization', `Bearer ${token}`)
      .send({ contrato_id: otherServiceContractId, numero_pago: 1, tipo_cobro_id: penaltyTypeId,
        fecha_esperada: '2026-11-18', fecha_vencimiento: '2026-11-20', monto_esperado: '200.00',
        motivo_penalizacion: 'Incumplimiento ficticio' }).expect(400);
    await request(server()).post('/api/finanzas/pagos-programados')
      .set('Authorization', `Bearer ${token}`)
      .send({ contrato_id: contractId, numero_pago: 1, tipo_cobro_id: penaltyTypeId,
        fecha_esperada: '2026-11-18', fecha_vencimiento: '2026-11-20',
        motivo_penalizacion: 'Incumplimiento ficticio' }).expect(400);
    const scheduled = await request(server()).post('/api/finanzas/pagos-programados')
      .set('Authorization', `Bearer ${token}`)
      .send({ contrato_id: contractId, numero_pago: 1, tipo_cobro_id: penaltyTypeId,
        fecha_esperada: '2026-11-18', fecha_vencimiento: '2026-11-20', monto_esperado: '200.00',
        motivo_penalizacion: 'Incumplimiento ficticio' }).expect(201);
    expect(scheduled.body).toMatchObject({
      monto_abonado_validado: '0.00', saldo_pendiente_confirmado: '200.00',
      motivo_saldo_no_disponible: null,
    });
    expect(await prisma.pagos.count({ where: { contrato_id: contractId } })).toBe(before);
    const one = await request(server()).post('/api/finanzas/pagos').set('Authorization', `Bearer ${token}`)
      .send({ ...paymentBody(contractId), pago_programado_id: scheduled.body.id, monto: '50.00' }).expect(201);
    const two = await request(server()).post('/api/finanzas/pagos').set('Authorization', `Bearer ${token}`)
      .send({ ...paymentBody(contractId), pago_programado_id: scheduled.body.id, monto: '75.00' }).expect(201);
    expect(one.body.pago_programado_id).toBe(scheduled.body.id);
    expect(two.body.pago_programado_id).toBe(scheduled.body.id);
    expect(await prisma.pagos.count({ where: { pago_programado_id: scheduled.body.id } })).toBe(2);
    await request(server()).post(`/api/finanzas/pagos/${one.body.id}/evidencias`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('%PDF-1.4\nfixture\n%%EOF'), { filename: 'abono.pdf', contentType: 'application/pdf' }).expect(201);
    await request(server()).patch(`/api/finanzas/pagos/${one.body.id}/estado`)
      .set('Authorization', `Bearer ${await tokenFor(adminId)}`).send({ accion: 'validar' }).expect(200);
    const current = await request(server()).get(`/api/finanzas/pagos-programados/${scheduled.body.id}`)
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(current.body).toMatchObject({
      monto_abonado_validado: '50.00', saldo_pendiente_confirmado: '150.00',
      motivo_saldo_no_disponible: null,
    });
    await request(server()).patch(`/api/finanzas/pagos-programados/${scheduled.body.id}`)
      .set('Authorization', `Bearer ${token}`).send({ monto_esperado: '300.00' }).expect(409);
  });

  it('exige motivo de rechazo y respeta revisión financiera y autorización final', async () => {
    const advisorToken = await tokenFor(advisorId);
    const financialToken = await tokenFor(financialId);
    const adminToken = await tokenFor(adminId);
    const rejected = await request(server()).post('/api/finanzas/pagos').set('Authorization', `Bearer ${advisorToken}`)
      .send(paymentBody(contractId)).expect(201);
    await request(server()).patch(`/api/finanzas/pagos/${rejected.body.id}/estado`)
      .set('Authorization', `Bearer ${financialToken}`).send({ accion: 'rechazar' }).expect(400);
    await request(server()).patch(`/api/finanzas/pagos/${rejected.body.id}/estado`)
      .set('Authorization', `Bearer ${financialToken}`).send({ accion: 'rechazar', comentario: 'Referencia incorrecta' }).expect(200);
    const review = await request(server()).post('/api/finanzas/pagos').set('Authorization', `Bearer ${advisorToken}`)
      .send(paymentBody(contractId)).expect(201);
    const pdf = Buffer.from('%PDF-1.4\nfixture\n%%EOF');
    await request(server()).post(`/api/finanzas/pagos/${review.body.id}/evidencias`)
      .set('Authorization', `Bearer ${advisorToken}`)
      .attach('file', pdf, { filename: 'comprobante.pdf', contentType: 'application/pdf' }).expect(201);
    await request(server()).patch(`/api/finanzas/pagos/${review.body.id}/estado`)
      .set('Authorization', `Bearer ${financialToken}`).send({ accion: 'enviar_a_autorizacion' }).expect(200);
    await request(server()).patch(`/api/finanzas/pagos/${review.body.id}/estado`)
      .set('Authorization', `Bearer ${adminToken}`).send({ accion: 'validar' }).expect(200);
    const validated = await prisma.pagos.findUniqueOrThrow({ where: { id: review.body.id }, include: { estados_pago: true } });
    expect(validated.estados_pago?.nombre).toBe('Validado');
    expect(await prisma.comisiones.count({ where: { pago_id: review.body.id } })).toBeGreaterThan(0);
  });

  it('valida directamente y rechaza cargas posteriores, conservando la evidencia privada', async () => {
    const token = await tokenFor(advisorId);
    const adminToken = await tokenFor(adminId);
    const otherToken = await tokenFor(otherAdvisorId);
    const pdf = Buffer.from('%PDF-1.4\nfixture\n%%EOF');
    const uploaded = await request(server()).post(`/api/finanzas/pagos/${firstPaymentId}/evidencias`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', pdf, { filename: 'comprobante.pdf', contentType: 'application/pdf' }).expect(201);
    await request(server()).patch(`/api/finanzas/pagos/${firstPaymentId}/estado`)
      .set('Authorization', `Bearer ${adminToken}`).send({ accion: 'validar' }).expect(200);
    await request(server()).post(`/api/finanzas/pagos/${firstPaymentId}/evidencias`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', pdf, { filename: 'nuevo.pdf', contentType: 'application/pdf' }).expect(409);
    expect(await prisma.evidencias_pago.count({ where: { pago_id: firstPaymentId } })).toBe(1);
    await request(server()).get(`/api/finanzas/evidencias/${uploaded.body.id}/descargar`)
      .set('Authorization', `Bearer ${otherToken}`).expect(404);
    const download = await request(server()).get(`/api/finanzas/evidencias/${uploaded.body.id}/descargar`)
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(download.headers['cache-control']).toBe('private, no-store');
    expect(download.body).toEqual(pdf);
  });

  it('exige recibo y receptor activo para efectivo', async () => {
    const token = await tokenFor(advisorId);
    await request(server()).post('/api/finanzas/pagos').set('Authorization', `Bearer ${token}`)
      .send(paymentBody(contractId, cashId)).expect(400);
    const created = await request(server()).post('/api/finanzas/pagos').set('Authorization', `Bearer ${token}`)
      .send({ ...paymentBody(contractId, cashId), folio_recibo: `${prefix}-REC`, recibido_por: adminId, lugar_recepcion: 'Caja de prueba' }).expect(201);
    expect(created.body.folio_recibo).toBe(`${prefix}-REC`);
  });

  it('serializa dos validaciones simultáneas sin duplicar comisiones ni historial', async () => {
    const advisorToken = await tokenFor(advisorId);
    const adminToken = await tokenFor(adminId);
    const created = await request(server()).post('/api/finanzas/pagos')
      .set('Authorization', `Bearer ${advisorToken}`).send(paymentBody(contractId)).expect(201);
    await request(server()).post(`/api/finanzas/pagos/${created.body.id}/evidencias`)
      .set('Authorization', `Bearer ${advisorToken}`)
      .attach('file', Buffer.from('%PDF-1.4\nfixture\n%%EOF'), { filename: 'concurrente.pdf', contentType: 'application/pdf' })
      .expect(201);
    const responses = await Promise.all([1, 2].map(() => request(server())
      .patch(`/api/finanzas/pagos/${created.body.id}/estado`)
      .set('Authorization', `Bearer ${adminToken}`).send({ accion: 'validar' })));
    expect(responses.map((response) => response.status).sort((a, b) => a - b)).toEqual([200, 409]);
    const validated = await prisma.estados_pago.findUniqueOrThrow({ where: { nombre: 'Validado' } });
    expect(await prisma.pagos.count({ where: { id: created.body.id, estado_pago_id: validated.id } })).toBe(1);
    expect(await prisma.comisiones.count({ where: { pago_id: created.body.id } })).toBe(1);
    expect(await prisma.historial_estados_pago.count({ where: { pago_id: created.body.id, estado_nuevo_id: validated.id } })).toBe(1);
  });

  it('corrige un rechazo, conserva la evidencia sustituida y exige comprobante vigente del método nuevo', async () => {
    const advisorToken = await tokenFor(advisorId);
    const financialToken = await tokenFor(financialId);
    const adminToken = await tokenFor(adminId);
    const oldFile = Buffer.from('%PDF-1.4\ncomprobante anterior\n%%EOF');
    const payment = await request(server()).post('/api/finanzas/pagos')
      .set('Authorization', `Bearer ${advisorToken}`).send(paymentBody(contractId)).expect(201);
    const oldEvidence = await request(server()).post(`/api/finanzas/pagos/${payment.body.id}/evidencias`)
      .set('Authorization', `Bearer ${advisorToken}`)
      .attach('file', oldFile, { filename: 'anterior.pdf', contentType: 'application/pdf' }).expect(201);
    await request(server()).patch(`/api/finanzas/pagos/${payment.body.id}/estado`)
      .set('Authorization', `Bearer ${financialToken}`)
      .send({ accion: 'rechazar', comentario: 'Revisar importe y forma de pago' }).expect(200);
    await request(server()).patch(`/api/finanzas/pagos/${payment.body.id}/corregir`)
      .set('Authorization', `Bearer ${await tokenFor(otherAdvisorId)}`)
      .send({ motivo: 'Corregir datos' }).expect(404);
    await request(server()).patch(`/api/finanzas/pagos/${payment.body.id}/corregir`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ motivo: 'Corregir datos' }).expect(403);
    await request(server()).patch(`/api/finanzas/pagos/${payment.body.id}/corregir`)
      .set('Authorization', `Bearer ${advisorToken}`)
      .send({ motivo: ' ' }).expect(400);
    await request(server()).patch(`/api/finanzas/pagos/${payment.body.id}/corregir`)
      .send({ motivo: 'Sin sesión' }).expect(401);
    await request(server()).patch(`/api/finanzas/pagos/${payment.body.id}/corregir`)
      .set('Authorization', `Bearer ${advisorToken}`)
      .send({ motivo: 'Faltan datos de efectivo', forma_pago_id: cashId }).expect(400);
    expect(await prisma.correcciones_pago.count({ where: { pago_id: payment.body.id } })).toBe(0);
    expect((await prisma.evidencias_pago.findUniqueOrThrow({ where: { id: oldEvidence.body.id } })).vigente).toBe(true);
    expect((await prisma.pagos.findUniqueOrThrow({ where: { id: payment.body.id }, include: { estados_pago: true } })).estados_pago?.nombre)
      .toBe('Rechazado');
    const corrected = await request(server()).patch(`/api/finanzas/pagos/${payment.body.id}/corregir`)
      .set('Authorization', `Bearer ${advisorToken}`)
      .send({ motivo: 'Se recibió en efectivo', monto: '150.25', forma_pago_id: cashId,
        folio_recibo: `${prefix}-CORR`, recibido_por: adminId, lugar_recepcion: 'Caja' }).expect(200);
    expect(corrected.body).toMatchObject({ id: payment.body.id, monto: '150.25', forma_pago_id: cashId,
      folio_recibo: `${prefix}-CORR` });
    expect(corrected.body.estados_pago.nombre).toBe('Pendiente de revisión financiera');
    const correctionRows = await prisma.correcciones_pago.findMany({ where: { pago_id: payment.body.id } });
    expect(correctionRows).toHaveLength(1);
    expect(correctionRows[0]).toMatchObject({ actor_id: advisorId, monto_anterior: expect.anything(),
      monto_nuevo: expect.anything(), forma_pago_id_anterior: transferId, forma_pago_id_nueva: cashId });
    expect(correctionRows[0].monto_anterior.toString()).toBe('125.5');
    expect(correctionRows[0].monto_nuevo.toString()).toBe('150.25');
    const old = await prisma.evidencias_pago.findUniqueOrThrow({ where: { id: oldEvidence.body.id } });
    expect(old).toMatchObject({ vigente: false, correccion_sustitucion_id: correctionRows[0].id });
    await request(server()).patch(`/api/finanzas/pagos/${payment.body.id}/estado`)
      .set('Authorization', `Bearer ${adminToken}`).send({ accion: 'validar' }).expect(400);
    const newEvidence = await request(server()).post(`/api/finanzas/pagos/${payment.body.id}/evidencias`)
      .set('Authorization', `Bearer ${advisorToken}`)
      .attach('file', Buffer.from('%PDF-1.4\ncomprobante nuevo\n%%EOF'),
        { filename: 'nuevo.pdf', contentType: 'application/pdf' }).expect(201);
    expect(newEvidence.body).toMatchObject({ vigente: true, correccion_origen_id: correctionRows[0].id });
    const evidenceList = await request(server()).get(`/api/finanzas/pagos/${payment.body.id}/evidencias`)
      .set('Authorization', `Bearer ${advisorToken}`).expect(200);
    expect(evidenceList.body).toHaveLength(2);
    await request(server()).get(`/api/finanzas/evidencias/${oldEvidence.body.id}/descargar`)
      .set('Authorization', `Bearer ${advisorToken}`).expect(200);
    await request(server()).patch(`/api/finanzas/pagos/${payment.body.id}/estado`)
      .set('Authorization', `Bearer ${adminToken}`).send({ accion: 'validar' }).expect(200);
    const audit = await request(server()).get(`/api/finanzas/pagos/${payment.body.id}/correcciones`)
      .set('Authorization', `Bearer ${advisorToken}`).expect(200);
    expect(audit.body).toHaveLength(1);
    expect(audit.body[0].motivo).toBe('Se recibió en efectivo');
    await request(server()).get(`/api/finanzas/pagos/${payment.body.id}/correcciones`)
      .set('Authorization', `Bearer ${await tokenFor(otherAdvisorId)}`).expect(404);
    await request(server()).patch(`/api/finanzas/pagos/${payment.body.id}/corregir`)
      .set('Authorization', `Bearer ${advisorToken}`)
      .send({ motivo: 'Intento posterior' }).expect(409);
  });

  it('serializa correcciones simultáneas y solo permite una transición desde Rechazado', async () => {
    const advisorToken = await tokenFor(advisorId);
    const financialToken = await tokenFor(financialId);
    const payment = await request(server()).post('/api/finanzas/pagos')
      .set('Authorization', `Bearer ${advisorToken}`).send(paymentBody(contractId)).expect(201);
    await request(server()).patch(`/api/finanzas/pagos/${payment.body.id}/estado`)
      .set('Authorization', `Bearer ${financialToken}`)
      .send({ accion: 'rechazar', comentario: 'Revisar' }).expect(200);
    const responses = await Promise.all([1, 2].map((n) => request(server())
      .patch(`/api/finanzas/pagos/${payment.body.id}/corregir`)
      .set('Authorization', `Bearer ${advisorToken}`)
      .send({ motivo: `Corrección ${n}`, monto: `${130 + n}.00` })));
    expect(responses.map((response) => response.status).sort((a, b) => a - b)).toEqual([200, 409]);
    expect(await prisma.correcciones_pago.count({ where: { pago_id: payment.body.id } })).toBe(1);
    const review = await prisma.estados_pago.findUniqueOrThrow({ where: { nombre: 'Pendiente de revisión financiera' } });
    expect(await prisma.historial_estados_pago.count({ where: { pago_id: payment.body.id, estado_nuevo_id: review.id } })).toBe(2);
  });

  it('impide corregir a un asesor que posee el contrato pero no registró el pago', async () => {
    const adminToken = await tokenFor(adminId);
    const advisorToken = await tokenFor(advisorId);
    const financialToken = await tokenFor(financialId);
    const payment = await request(server()).post('/api/finanzas/pagos')
      .set('Authorization', `Bearer ${adminToken}`).send(paymentBody(contractId)).expect(201);
    await request(server()).patch(`/api/finanzas/pagos/${payment.body.id}/estado`)
      .set('Authorization', `Bearer ${financialToken}`)
      .send({ accion: 'rechazar', comentario: 'Revisar' }).expect(200);
    await request(server()).patch(`/api/finanzas/pagos/${payment.body.id}/corregir`)
      .set('Authorization', `Bearer ${advisorToken}`)
      .send({ motivo: 'Intento del asesor del contrato' }).expect(403);
    expect(await prisma.correcciones_pago.count({ where: { pago_id: payment.body.id } })).toBe(0);
  });

  it('conserva fecha_pago histórica nula y excluye al auxiliar administrativo', async () => {
    const state = await prisma.estados_pago.findUniqueOrThrow({ where: { nombre: 'Pendiente de revisión financiera' } });
    const historical = await prisma.pagos.create({ data: {
      contrato_id: contractId, forma_pago_id: transferId, estado_pago_id: state.id,
      monto: '25.00', fecha_pago: null, registrado_por: advisorId,
    } });
    const advisorToken = await tokenFor(advisorId);
    const detail = await request(server()).get(`/api/finanzas/pagos/${historical.id}`)
      .set('Authorization', `Bearer ${advisorToken}`).expect(200);
    expect(detail.body.fecha_pago).toBeNull();
    const auxiliaryRole = await role('auxiliar administrativo');
    const auxiliaryId = await user(auxiliaryRole, 'auxiliar');
    await request(server()).get('/api/finanzas/pagos')
      .set('Authorization', `Bearer ${await tokenFor(auxiliaryId)}`).expect(403);
  });

  it('no publica saldo operativo para importe nulo, obligación cancelada o sobrepago histórico', async () => {
    const token = await tokenFor(advisorId);
    const unknown = await prisma.pagos_programados.create({
      data: { contrato_id: contractId, numero_pago: 80, monto_esperado: null },
    });
    const unknownResponse = await request(server()).get(`/api/finanzas/pagos-programados/${unknown.id}`)
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(unknownResponse.body).toMatchObject({
      monto_abonado_validado: '0.00', saldo_pendiente_confirmado: null,
      motivo_saldo_no_disponible: 'IMPORTE_NO_DEFINIDO',
    });
    let cancelled = await prisma.estados_pago_programado.findUnique({ where: { nombre: 'Cancelado' } });
    if (!cancelled) {
      cancelled = await prisma.estados_pago_programado.create({ data: { nombre: 'Cancelado' } });
      scheduledStateIds.push(cancelled.id);
    }
    const cancelledObligation = await prisma.pagos_programados.create({
      data: { contrato_id: contractId, numero_pago: 81, monto_esperado: '100.00', estado_id: cancelled.id },
    });
    const cancelledResponse = await request(server()).get(`/api/finanzas/pagos-programados/${cancelledObligation.id}`)
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(cancelledResponse.body).toMatchObject({
      saldo_pendiente_confirmado: null, motivo_saldo_no_disponible: 'CANCELADO',
    });
    const overpaid = await prisma.pagos_programados.create({
      data: { contrato_id: contractId, numero_pago: 82, monto_esperado: '10.00' },
    });
    const validated = await prisma.estados_pago.findUniqueOrThrow({ where: { nombre: 'Validado' } });
    await prisma.pagos.create({ data: {
      contrato_id: contractId, pago_programado_id: overpaid.id,
      forma_pago_id: transferId, estado_pago_id: validated.id,
      monto: '11.00', fecha_pago: new Date('2026-11-17T14:00:00.000Z'),
      registrado_por: advisorId,
    } });
    const overpaidResponse = await request(server()).get(`/api/finanzas/pagos-programados/${overpaid.id}`)
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(overpaidResponse.body).toMatchObject({
      monto_abonado_validado: '11.00', saldo_pendiente_confirmado: null,
      motivo_saldo_no_disponible: 'SOBREPAGO',
    });
  });

  it('exige vencimiento y expone Pendiente, Vencido y Cubierto con filtro y paginación coherentes', async () => {
    const advisorToken = await tokenFor(advisorId);
    const adminToken = await tokenFor(adminId);
    const base = { contrato_id: otherServiceContractId, monto_esperado: '10.00' };
    await request(server()).post('/api/finanzas/pagos-programados')
      .set('Authorization', `Bearer ${advisorToken}`)
      .send({ ...base, numero_pago: 91, fecha_esperada: '2099-01-01' }).expect(400);
    const pending = await request(server()).post('/api/finanzas/pagos-programados')
      .set('Authorization', `Bearer ${advisorToken}`)
      .send({ ...base, numero_pago: 91, fecha_esperada: '2099-01-01', fecha_vencimiento: '2099-01-02' }).expect(201);
    const expired = await request(server()).post('/api/finanzas/pagos-programados')
      .set('Authorization', `Bearer ${advisorToken}`)
      .send({ ...base, numero_pago: 92, fecha_esperada: '2000-01-01', fecha_vencimiento: '2000-01-02' }).expect(201);
    const covered = await request(server()).post('/api/finanzas/pagos-programados')
      .set('Authorization', `Bearer ${advisorToken}`)
      .send({ ...base, numero_pago: 93, fecha_esperada: '2000-01-03', fecha_vencimiento: '2000-01-04' }).expect(201);
    expect(pending.body.estado_operativo.nombre).toBe('Pendiente');
    expect(expired.body.estado_operativo.nombre).toBe('Vencido');
    const payment = await request(server()).post('/api/finanzas/pagos')
      .set('Authorization', `Bearer ${advisorToken}`)
      .send({ ...paymentBody(otherServiceContractId), pago_programado_id: covered.body.id, monto: '10.00' }).expect(201);
    await request(server()).post(`/api/finanzas/pagos/${payment.body.id}/evidencias`)
      .set('Authorization', `Bearer ${advisorToken}`)
      .attach('file', Buffer.from('%PDF-1.4\nfixture\n%%EOF'), { filename: 'cubierto.pdf', contentType: 'application/pdf' }).expect(201);
    await request(server()).patch(`/api/finanzas/pagos/${payment.body.id}/estado`)
      .set('Authorization', `Bearer ${adminToken}`).send({ accion: 'validar' }).expect(200);
    const coveredResult = await request(server()).get(`/api/finanzas/pagos-programados/${covered.body.id}`)
      .set('Authorization', `Bearer ${advisorToken}`).expect(200);
    expect(coveredResult.body).toMatchObject({ saldo_pendiente_confirmado: '0.00', estado_operativo: { nombre: 'Cubierto' } });
    for (const [name, expectedId] of [['Pendiente', pending.body.id], ['Vencido', expired.body.id], ['Cubierto', covered.body.id]] as const) {
      const state = await prisma.estados_pago_programado.findUniqueOrThrow({ where: { nombre: name } });
      const list = await request(server()).get('/api/finanzas/pagos-programados')
        .query({ contrato_id: otherServiceContractId, estado_id: state.id, page: 1, limit: 1 })
        .set('Authorization', `Bearer ${advisorToken}`).expect(200);
      expect(list.body.pagination).toMatchObject({ total: 1, totalPages: 1 });
      expect(list.body.data[0]).toMatchObject({ id: expectedId, estado_operativo: { id: state.id, nombre: name } });
    }
    await request(server()).patch(`/api/finanzas/pagos-programados/${pending.body.id}/estado`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ estado_id: (await prisma.estados_pago_programado.findUniqueOrThrow({ where: { nombre: 'Cubierto' } })).id }).expect(409);
  });

  it('requiere justificación persistida para duplicados, también al editar y bajo concurrencia', async () => {
    const token = await tokenFor(advisorId);
    const base = { contrato_id: contractId, fecha_esperada: '2031-04-01',
      fecha_vencimiento: '2031-04-02', monto_esperado: '321.45' };
    const first = await request(server()).post('/api/finanzas/pagos-programados')
      .set('Authorization', `Bearer ${token}`).send({ ...base, numero_pago: 101 }).expect(201);
    await request(server()).post('/api/finanzas/pagos-programados')
      .set('Authorization', `Bearer ${token}`).send({ ...base, numero_pago: 102 }).expect(409);
    const justified = await request(server()).post('/api/finanzas/pagos-programados')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...base, numero_pago: 102, justificacion_duplicado: 'Dos conceptos del mismo cobro ficticio' }).expect(201);
    expect(justified.body.justificacion_duplicado).toContain('Dos conceptos');
    const other = await request(server()).post('/api/finanzas/pagos-programados')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...base, numero_pago: 103, monto_esperado: '300.00' }).expect(201);
    await request(server()).patch(`/api/finanzas/pagos-programados/${other.body.id}`)
      .set('Authorization', `Bearer ${token}`).send({ monto_esperado: '321.45' }).expect(409);
    await request(server()).patch(`/api/finanzas/pagos-programados/${other.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ monto_esperado: '321.45', justificacion_duplicado: 'Registro complementario ficticio' }).expect(200);
    const race = { ...base, fecha_esperada: '2031-05-01', fecha_vencimiento: '2031-05-02' };
    const responses = await Promise.all([111, 112].map((numero_pago) => request(server())
      .post('/api/finanzas/pagos-programados').set('Authorization', `Bearer ${token}`)
      .send({ ...race, numero_pago })));
    expect(responses.map((response) => response.status).sort((a, b) => a - b)).toEqual([201, 409]);
    expect(await prisma.pagos_programados.count({ where: { contrato_id: contractId,
      fecha_esperada: new Date('2031-05-01'), monto_esperado: '321.45' } })).toBe(1);
    expect(first.body.justificacion_duplicado).toBeNull();
    const differentConcept = { ...base, fecha_esperada: '2031-06-01', fecha_vencimiento: '2031-06-02', monto_esperado: '123.45' };
    await request(server()).post('/api/finanzas/pagos-programados')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...differentConcept, numero_pago: 113, tipo_cobro_id: principalTypeId }).expect(201);
    await request(server()).post('/api/finanzas/pagos-programados')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...differentConcept, numero_pago: 114, tipo_cobro_id: penaltyTypeId,
        motivo_penalizacion: 'Concepto distinto ficticio' }).expect(201);
  });

  it('exige motivo de penalización y conserva TOPADO/NO_TOPADO e importe del beneficiario por cobro', async () => {
    const token = await tokenFor(advisorId);
    const base = { contrato_id: contractId, tipo_cobro_id: penaltyTypeId,
      fecha_esperada: '2032-02-01', fecha_vencimiento: '2032-02-02', monto_esperado: '100.00' };
    await request(server()).post('/api/finanzas/pagos-programados')
      .set('Authorization', `Bearer ${token}`).send({ ...base, numero_pago: 121 }).expect(400);
    const topado = await request(server()).post('/api/finanzas/pagos-programados')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...base, numero_pago: 121, motivo_penalizacion: 'Incumplimiento ficticio A',
        clasificacion_tope_apd: 'TOPADO', monto_recibido_beneficiario_apd: '2500.00' }).expect(201);
    const noTopado = await request(server()).post('/api/finanzas/pagos-programados')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...base, numero_pago: 122, fecha_esperada: '2032-03-01', fecha_vencimiento: '2032-03-02',
        motivo_penalizacion: 'Incumplimiento ficticio B', clasificacion_tope_apd: 'NO_TOPADO',
        monto_recibido_beneficiario_apd: '2700.00' }).expect(201);
    expect(topado.body).toMatchObject({ clasificacion_tope_apd: 'TOPADO', monto_recibido_beneficiario_apd: '2500', monto_esperado: '100' });
    expect(noTopado.body).toMatchObject({ clasificacion_tope_apd: 'NO_TOPADO', monto_recibido_beneficiario_apd: '2700' });
    await request(server()).post('/api/finanzas/pagos-programados')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...base, contrato_id: otherServiceContractId, numero_pago: 123,
        clasificacion_tope_apd: 'TOPADO', motivo_penalizacion: 'Incorrecta' }).expect(400);
    await request(server()).post('/api/finanzas/pagos-programados')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...base, contrato_id: otherServiceContractId, tipo_cobro_id: principalTypeId,
        numero_pago: 124, clasificacion_tope_apd: 'TOPADO' }).expect(400);
  });

  it('rechaza sobrepago y monto esperado nulo sin cambiar estado ni generar comisión', async () => {
    const advisorToken = await tokenFor(advisorId);
    const adminToken = await tokenFor(adminId);
    const obligation = await request(server()).post('/api/finanzas/pagos-programados')
      .set('Authorization', `Bearer ${advisorToken}`)
      .send({ contrato_id: contractId, numero_pago: 131, fecha_vencimiento: '2033-01-01',
        monto_esperado: '100.00' }).expect(201);
    const makePayment = async (amount: string) => {
      const created = await request(server()).post('/api/finanzas/pagos')
        .set('Authorization', `Bearer ${advisorToken}`)
        .send({ ...paymentBody(contractId), pago_programado_id: obligation.body.id, monto: amount }).expect(201);
      await request(server()).post(`/api/finanzas/pagos/${created.body.id}/evidencias`)
        .set('Authorization', `Bearer ${advisorToken}`)
        .attach('file', Buffer.from('%PDF-1.4\nfixture\n%%EOF'), { filename: 'abono.pdf', contentType: 'application/pdf' }).expect(201);
      return created.body.id as string;
    };
    const first = await makePayment('60.00');
    const second = await makePayment('50.00');
    await request(server()).patch(`/api/finanzas/pagos/${first}/estado`)
      .set('Authorization', `Bearer ${adminToken}`).send({ accion: 'validar' }).expect(200);
    await request(server()).patch(`/api/finanzas/pagos/${second}/estado`)
      .set('Authorization', `Bearer ${adminToken}`).send({ accion: 'validar' }).expect(409);
    const pending = await prisma.estados_pago.findUniqueOrThrow({ where: { nombre: 'Pendiente de revisión financiera' } });
    expect(await prisma.pagos.count({ where: { id: second, estado_pago_id: pending.id } })).toBe(1);
    expect(await prisma.comisiones.count({ where: { pago_id: second } })).toBe(0);
    const unknown = await prisma.pagos_programados.create({ data: { contrato_id: contractId, numero_pago: 132, monto_esperado: null } });
    const unknownPayment = await request(server()).post('/api/finanzas/pagos')
      .set('Authorization', `Bearer ${advisorToken}`)
      .send({ ...paymentBody(contractId), pago_programado_id: unknown.id, monto: '1.00' }).expect(201);
    await request(server()).post(`/api/finanzas/pagos/${unknownPayment.body.id}/evidencias`)
      .set('Authorization', `Bearer ${advisorToken}`)
      .attach('file', Buffer.from('%PDF-1.4\nfixture\n%%EOF'), { filename: 'historico.pdf', contentType: 'application/pdf' }).expect(201);
    await request(server()).patch(`/api/finanzas/pagos/${unknownPayment.body.id}/estado`)
      .set('Authorization', `Bearer ${adminToken}`).send({ accion: 'validar' }).expect(409);
  });

  it('serializa validaciones de dos pagos distintos sobre la misma obligación', async () => {
    const advisorToken = await tokenFor(advisorId);
    const adminToken = await tokenFor(adminId);
    const obligation = await request(server()).post('/api/finanzas/pagos-programados')
      .set('Authorization', `Bearer ${advisorToken}`)
      .send({ contrato_id: contractId, numero_pago: 141, fecha_vencimiento: '2034-01-01',
        monto_esperado: '100.00' }).expect(201);
    const ids: string[] = [];
    for (const n of [1, 2]) {
      const created = await request(server()).post('/api/finanzas/pagos')
        .set('Authorization', `Bearer ${advisorToken}`)
        .send({ ...paymentBody(contractId), pago_programado_id: obligation.body.id, monto: '60.00',
          referencia_pago: `carrera-${n}` }).expect(201);
      ids.push(created.body.id);
      await request(server()).post(`/api/finanzas/pagos/${created.body.id}/evidencias`)
        .set('Authorization', `Bearer ${advisorToken}`)
        .attach('file', Buffer.from('%PDF-1.4\nfixture\n%%EOF'), { filename: `carrera-${n}.pdf`, contentType: 'application/pdf' }).expect(201);
    }
    const results = await Promise.all(ids.map((id) => request(server())
      .patch(`/api/finanzas/pagos/${id}/estado`)
      .set('Authorization', `Bearer ${adminToken}`).send({ accion: 'validar' })));
    expect(results.map((result) => result.status).sort((a, b) => a - b)).toEqual([200, 409]);
    const validated = await prisma.estados_pago.findUniqueOrThrow({ where: { nombre: 'Validado' } });
    expect(await prisma.pagos.count({ where: { id: { in: ids }, estado_pago_id: validated.id } })).toBe(1);
    expect(await prisma.comisiones.count({ where: { pago_id: { in: ids } } })).toBe(1);
    const detail = await request(server()).get(`/api/finanzas/pagos-programados/${obligation.body.id}`)
      .set('Authorization', `Bearer ${advisorToken}`).expect(200);
    expect(detail.body).toMatchObject({ monto_abonado_validado: '60.00', saldo_pendiente_confirmado: '40.00' });
  });

  it('cancela con auditoría solo por administración y bloquea pagos posteriores', async () => {
    const advisorToken = await tokenFor(advisorId);
    const financialToken = await tokenFor(financialId);
    const adminToken = await tokenFor(adminId);
    const created = await request(server()).post('/api/finanzas/pagos-programados')
      .set('Authorization', `Bearer ${advisorToken}`)
      .send({ contrato_id: contractId, numero_pago: 151, fecha_vencimiento: '2035-01-01', monto_esperado: '30.00' }).expect(201);
    await request(server()).patch(`/api/finanzas/pagos-programados/${created.body.id}/cancelar`)
      .set('Authorization', `Bearer ${advisorToken}`).send({ motivo: 'Intento asesor' }).expect(403);
    await request(server()).patch(`/api/finanzas/pagos-programados/${created.body.id}/cancelar`)
      .set('Authorization', `Bearer ${financialToken}`).send({ motivo: ' ' }).expect(400);
    const cancelled = await request(server()).patch(`/api/finanzas/pagos-programados/${created.body.id}/cancelar`)
      .set('Authorization', `Bearer ${financialToken}`).send({ motivo: 'Obligación ficticia anulada' }).expect(200);
    expect(cancelled.body).toMatchObject({ contrato_id: contractId, cancelado_por: financialId,
      motivo_cancelacion: 'Obligación ficticia anulada', estado_operativo: { nombre: 'Cancelado' },
      saldo_pendiente_confirmado: null, motivo_saldo_no_disponible: 'CANCELADO' });
    expect(new Date(cancelled.body.cancelado_en).getTime()).toBeGreaterThan(0);
    await request(server()).patch(`/api/finanzas/pagos-programados/${created.body.id}/cancelar`)
      .set('Authorization', `Bearer ${adminToken}`).send({ motivo: 'Segundo intento' }).expect(409);
    await request(server()).post('/api/finanzas/pagos')
      .set('Authorization', `Bearer ${advisorToken}`)
      .send({ ...paymentBody(contractId), pago_programado_id: created.body.id }).expect(409);
    expect(await prisma.pagos.count({ where: { pago_programado_id: created.body.id } })).toBe(0);
    const cancelledState = await prisma.estados_pago_programado.findUniqueOrThrow({ where: { nombre: 'Cancelado' } });
    const list = await request(server()).get('/api/finanzas/pagos-programados')
      .query({ contrato_id: contractId, estado_id: cancelledState.id })
      .set('Authorization', `Bearer ${advisorToken}`).expect(200);
    expect(list.body.data.some((row: { id: string }) => row.id === created.body.id)).toBe(true);
    const adminCreated = await request(server()).post('/api/finanzas/pagos-programados')
      .set('Authorization', `Bearer ${advisorToken}`)
      .send({ contrato_id: contractId, numero_pago: 152, fecha_vencimiento: '2035-01-02',
        monto_esperado: '31.00' }).expect(201);
    const adminCancelled = await request(server()).patch(`/api/finanzas/pagos-programados/${adminCreated.body.id}/cancelar`)
      .set('Authorization', `Bearer ${adminToken}`).send({ motivo: 'Administración ficticia' }).expect(200);
    expect(adminCancelled.body.cancelado_por).toBe(adminId);
  });

  it('rechaza cancelación ante cualquier pago vinculado y serializa la carrera con el alta', async () => {
    const advisorToken = await tokenFor(advisorId);
    const adminToken = await tokenFor(adminId);
    for (const [n, name] of ['Pendiente de revisión financiera', 'Pendiente de autorización', 'Rechazado', 'Validado', 'Cancelado'].entries()) {
      const obligation = await request(server()).post('/api/finanzas/pagos-programados')
        .set('Authorization', `Bearer ${advisorToken}`)
        .send({ contrato_id: contractId, numero_pago: 160 + n,
          fecha_vencimiento: '2036-01-01', monto_esperado: '20.00' }).expect(201);
      const state = await prisma.estados_pago.findUniqueOrThrow({ where: { nombre: name } });
      await prisma.pagos.create({ data: { contrato_id: contractId, pago_programado_id: obligation.body.id,
        forma_pago_id: transferId, estado_pago_id: state.id, monto: '1.00', registrado_por: advisorId } });
      await request(server()).patch(`/api/finanzas/pagos-programados/${obligation.body.id}/cancelar`)
        .set('Authorization', `Bearer ${adminToken}`).send({ motivo: 'No corresponde' }).expect(409);
    }
    const race = await request(server()).post('/api/finanzas/pagos-programados')
      .set('Authorization', `Bearer ${advisorToken}`)
      .send({ contrato_id: contractId, numero_pago: 170, fecha_vencimiento: '2036-02-01',
        monto_esperado: '20.00' }).expect(201);
    const [registration, cancellation] = await Promise.all([
      request(server()).post('/api/finanzas/pagos').set('Authorization', `Bearer ${advisorToken}`)
        .send({ ...paymentBody(contractId), pago_programado_id: race.body.id, monto: '5.00' }),
      request(server()).patch(`/api/finanzas/pagos-programados/${race.body.id}/cancelar`)
        .set('Authorization', `Bearer ${adminToken}`).send({ motivo: 'Carrera ficticia' }),
    ]);
    expect([[201, 409], [409, 200]]).toContainEqual([registration.status, cancellation.status]);
    const linked = await prisma.pagos.count({ where: { pago_programado_id: race.body.id } });
    const row = await prisma.pagos_programados.findUniqueOrThrow({ where: { id: race.body.id }, include: { estados_pago_programado: true } });
    expect(linked === 1 && row.estados_pago_programado?.nombre !== 'Cancelado' ||
      linked === 0 && row.estados_pago_programado?.nombre === 'Cancelado').toBe(true);
  });
});
