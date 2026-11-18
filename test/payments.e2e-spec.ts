import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
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
const legacyCommissionSelect = { id: true, concepto_id: true, monto_comision: true,
  receptor_nombre_snapshot: true, receptor_dispersion_id: true, beneficiario_id: true,
  estados_comisiones: true, conceptos_dispersion: true } as const;

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
  const referralTestClientIds: string[] = [];
  const contractIds: string[] = [];
  const formIds: number[] = [];
  const typeIds: number[] = [];
  const serviceIds: number[] = [];
  const contractStateIds: number[] = [];
  const scheduledStateIds: number[] = [];
  const receiverIds: string[] = [];
  const cutIds: string[] = [];
  const prenominaStateIds: number[] = [];

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
    }, select: { id: true } });
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
    if (await prisma.servicios.count({ where: { codigo_folio: { in: ['APD', 'M10', 'M40', 'M40R'] } } })) {
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
      const ownPrenominas = cutIds.length ? await prisma.prenomina.findMany({ where: { corte_id: { in: cutIds } }, select: { id: true } }) : [];
      if (ownPrenominas.length) {
        const ids = ownPrenominas.map(row => row.id);
        const details = await prisma.detalle_prenomina.findMany({ where: { prenomina_id: { in: ids } }, select: { id: true } });
        if (details.length) {
          await prisma.comisiones.updateMany({ where: { detalle_prenomina_id: { in: details.map(row => row.id) } }, data: { detalle_prenomina_id: null } });
          await prisma.detalle_prenomina.deleteMany({ where: { id: { in: details.map(row => row.id) } } });
        }
        await prisma.prenomina.deleteMany({ where: { id: { in: ids } } });
      }
      if (cutIds.length) {
        await prisma.cortes_pagos_reservados.deleteMany({ where: { corte_id: { in: cutIds } } });
        await prisma.cortes_periodos_reservados.deleteMany({ where: { corte_id: { in: cutIds } } });
        await prisma.detalle_corte.deleteMany({ where: { corte_id: { in: cutIds } } });
        await prisma.historial_estados_corte.deleteMany({ where: { corte_id: { in: cutIds } } });
        await prisma.cortes_financieros.deleteMany({ where: { id: { in: cutIds } } });
      }
      if (paymentIds.length) {
        const files = await prisma.evidencias_pago.findMany({ where: { pago_id: { in: paymentIds } }, select: { archivo_path: true } });
        for (const file of files) await storage.delete(file.archivo_path);
        const commissions = await prisma.comisiones.findMany({ where: { pago_id: { in: paymentIds } }, select: { id: true } });
        if (commissions.length) {
          const disbursements = await prisma.dispersiones_comision.findMany({ where: { comision_id: { in: commissions.map(row => row.id) } }, select: { id: true, comprobante_path: true } });
          for (const row of disbursements) await storage.delete(row.comprobante_path);
          if (disbursements.length) await prisma.dispersiones_comision.deleteMany({ where: { id: { in: disbursements.map(row => row.id) } } });
          await prisma.historial_estados_comisiones.deleteMany({ where: { comision_id: { in: commissions.map((row) => row.id) } } });
          await prisma.comisiones.deleteMany({ where: { id: { in: commissions.map((row) => row.id) } } });
        }
        await prisma.evidencias_pago.deleteMany({ where: { pago_id: { in: paymentIds } } });
        await prisma.correcciones_pago.deleteMany({ where: { pago_id: { in: paymentIds } } });
        await prisma.historial_estados_pago.deleteMany({ where: { pago_id: { in: paymentIds } } });
        await prisma.pagos.deleteMany({ where: { id: { in: paymentIds } } });
      }
      if (contractIds.length) {
        await prisma.historial_configuracion_dispersion.deleteMany({ where: { contrato_id: { in: contractIds } } });
        await prisma.contrato_dispersion_detalle.deleteMany({ where: { contrato_id: { in: contractIds } } });
      }
      if (referralTestClientIds.length) {
        await prisma.historial_referidor_cliente.deleteMany({ where: { cliente_id: { in: referralTestClientIds } } });
      }
      if (receiverIds.length) await prisma.receptores_dispersion.deleteMany({ where: { id: { in: receiverIds } } });
      if (contractIds.length) await prisma.pagos_programados.deleteMany({ where: { contrato_id: { in: contractIds } } });
      if (scheduledStateIds.length) await prisma.estados_pago_programado.deleteMany({ where: { id: { in: scheduledStateIds } } });
      if (contractIds.length) await prisma.contratos.deleteMany({ where: { id: { in: contractIds } } });
      if (prenominaStateIds.length) await prisma.estados_prenomina.deleteMany({ where: { id: { in: prenominaStateIds } } });
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
    const imssConcept = await prisma.conceptos_dispersion.findUniqueOrThrow({ where: { nombre: 'IMSS' } });
    await request(server()).put(`/api/finanzas/contratos/${otherServiceContractId}/comisiones`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ configuracion: [{ concepto_id: imssConcept.id, valor: '5.0' }] }).expect(200);
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

  it('conserva snapshots de comisión, filtra el contrato del asesor y rechaza receptor ajeno', async () => {
    const adminToken = await tokenFor(adminId);
    const advisorToken = await tokenFor(advisorId);
    const otherToken = await tokenFor(otherAdvisorId);
    const concept = await prisma.conceptos_dispersion.findUniqueOrThrow({ where: { nombre: 'Asesor' } });
    const receiver = await request(server()).post('/api/finanzas/receptores-dispersion')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ concepto_id: concept.id, usuario_id: advisorId }).expect(201);
    receiverIds.push(receiver.body.id);
    const otherReceiver = await request(server()).post('/api/finanzas/receptores-dispersion')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ concepto_id: concept.id, usuario_id: otherAdvisorId }).expect(201);
    receiverIds.push(otherReceiver.body.id);
    const config = (id: string, value: string) => ({ configuracion: [{ concepto_id: concept.id, receptor_dispersion_id: id, valor: value }] });
    await request(server()).put(`/api/finanzas/contratos/${contractId}/comisiones`)
      .set('Authorization', `Bearer ${adminToken}`).send(config(otherReceiver.body.id, '12.5')).expect(400);
    await request(server()).put(`/api/finanzas/contratos/${contractId}/comisiones`)
      .set('Authorization', `Bearer ${adminToken}`).send(config(receiver.body.id, '12.3')).expect(400);
    await request(server()).put(`/api/finanzas/contratos/${contractId}/comisiones`)
      .set('Authorization', `Bearer ${adminToken}`).send(config(receiver.body.id, '12.5')).expect(200);
    const registerAndValidate = async (reference: string, targetContract = contractId) => {
      const created = await request(server()).post('/api/finanzas/pagos')
        .set('Authorization', `Bearer ${advisorToken}`)
        .send({ ...paymentBody(targetContract), monto: '100.00', referencia_pago: reference }).expect(201);
      await request(server()).post(`/api/finanzas/pagos/${created.body.id}/evidencias`)
        .set('Authorization', `Bearer ${advisorToken}`)
        .attach('file', Buffer.from('%PDF-1.4\nfixture\n%%EOF'), { filename: `${reference}.pdf`, contentType: 'application/pdf' }).expect(201);
      return created.body.id as string;
    };
    const firstId = await registerAndValidate('comision-primera');
    const race = await Promise.all([1, 2].map(() => request(server())
      .patch(`/api/finanzas/pagos/${firstId}/estado`)
      .set('Authorization', `Bearer ${adminToken}`).send({ accion: 'validar' })));
    expect(race.map(result => result.status).sort((a, b) => a - b)).toEqual([200, 409]);
    const first = await prisma.comisiones.findMany({ where: { pago_id: firstId }, select: legacyCommissionSelect });
    expect(first).toHaveLength(2);
    expect(first.find(row => row.conceptos_dispersion.nombre === 'Asesor')?.monto_comision.toFixed(2)).toBe('12.50');
    expect(first.find(row => row.conceptos_dispersion.nombre === 'Empresa')?.monto_comision.toFixed(2)).toBe('87.50');
    const companyCommission = first.find(row => row.conceptos_dispersion.nombre === 'Empresa')!;
    const proof = Buffer.from('%PDF-1.4\ncomprobante-dispersion-prueba\n%%EOF');
    const confirm = (commissionId: string, key: string, reference: string, token: string, contents = proof) => request(server())
      .put(`/api/finanzas/comisiones/${commissionId}/dispersar`)
      .set('Authorization', `Bearer ${token}`)
      .field('idempotency_key', key)
      .field('referencia_transferencia', reference)
      .attach('file', contents, { filename: 'comprobante.pdf', contentType: 'application/pdf' });
    await request(server()).put(`/api/finanzas/comisiones/${companyCommission.id}/dispersar`)
      .set('Authorization', `Bearer ${adminToken}`).send({ comentario: 'No representa salida' }).expect(400);
    const filesBeforeRejectedDispersion = (await readdir('storage/postgres-tests')).length;
    await confirm(companyCommission.id, randomUUID(), 'REF-EMPRESA-TEST', adminToken).expect(409);
    expect((await readdir('storage/postgres-tests')).length).toBe(filesBeforeRejectedDispersion);
    expect(await prisma.dispersiones_comision.count({ where: { comision_id: companyCommission.id } })).toBe(0);
    await confirm(first.find(row => row.conceptos_dispersion.nombre === 'Asesor')!.id, randomUUID(), 'REF-SIN-PERMISO', advisorToken).expect(403);
    await request(server()).put(`/api/finanzas/contratos/${contractId}/comisiones`)
      .set('Authorization', `Bearer ${adminToken}`).send(config(receiver.body.id, '20.0')).expect(200);
    const secondId = await registerAndValidate('comision-segunda');
    await request(server()).patch(`/api/finanzas/pagos/${secondId}/estado`)
      .set('Authorization', `Bearer ${adminToken}`).send({ accion: 'validar' }).expect(200);
    const second = await prisma.comisiones.findFirstOrThrow({ where: { pago_id: secondId, concepto_id: concept.id }, select: legacyCommissionSelect });
    expect(second.monto_comision.toFixed(2)).toBe('20.00');
    expect((await prisma.comisiones.findFirstOrThrow({ where: { pago_id: firstId, concepto_id: concept.id }, select: legacyCommissionSelect })).monto_comision.toFixed(2)).toBe('12.50');
    const imssConcept = await prisma.conceptos_dispersion.findUniqueOrThrow({ where: { nombre: 'IMSS' } });
    await request(server()).put(`/api/finanzas/contratos/${otherServiceContractId}/comisiones`)
      .set('Authorization', `Bearer ${adminToken}`).send({ configuracion: [config(receiver.body.id, '15.0').configuracion[0],
        { concepto_id: imssConcept.id, valor: '5.0' }] }).expect(200);
    const otherContractPaymentId = await registerAndValidate('comision-otro-contrato', otherServiceContractId);
    await request(server()).patch(`/api/finanzas/pagos/${otherContractPaymentId}/estado`)
      .set('Authorization', `Bearer ${adminToken}`).send({ accion: 'validar' }).expect(200);
    const filtered = await request(server()).get('/api/finanzas/comisiones')
      .query({ contrato_id: otherServiceContractId })
      .set('Authorization', `Bearer ${advisorToken}`).expect(200);
    expect(filtered.body.total).toBe(1);
    expect(filtered.body.data[0].pagos.contratos.id).toBe(otherServiceContractId);
    const own = await request(server()).get('/api/finanzas/comisiones')
      .query({ contrato_id: contractId })
      .set('Authorization', `Bearer ${advisorToken}`).expect(200);
    expect(own.body.data.some((row: { id: string }) => row.id === second.id)).toBe(true);
    expect(own.body.data.every((row: { concepto_id: number }) => row.concepto_id === concept.id)).toBe(true);
    expect(own.body.data.every((row: { pagos: { contratos: { id: string } } }) => row.pagos.contratos.id === contractId)).toBe(true);
    const unrelated = await request(server()).get('/api/finanzas/comisiones')
      .query({ contrato_id: contractId })
      .set('Authorization', `Bearer ${otherToken}`).expect(200);
    expect(unrelated.body.total).toBe(0);
    await request(server()).put(`/api/finanzas/comisiones/${second.id}/dispersar`)
      .set('Authorization', `Bearer ${adminToken}`).send({}).expect(400);
    await confirm(second.id, 'clave-inválida', 'REF-TEST-SEGUNDA', adminToken).expect(400);
    await confirm(second.id, randomUUID(), ' ', adminToken).expect(400);
    const financialToken = await tokenFor(financialId);
    const operationKey = randomUUID();
    await confirm(second.id, operationKey, 'REF-TEST-SEGUNDA', adminToken, Buffer.from('archivo inválido')).expect(400);
    const filesBeforeConfirmation = (await readdir('storage/postgres-tests')).length;
    const confirmations = await Promise.all([adminToken, financialToken].map(token =>
      confirm(second.id, operationKey, 'REF-TEST-SEGUNDA', token)));
    expect(confirmations.map(result => result.status).sort((a, b) => a - b)).toEqual([200, 200]);
    expect(confirmations[0].body).toEqual(confirmations[1].body);
    expect(confirmations[0].body).toMatchObject({ comision_id: second.id, referencia_transferencia: 'REF-TEST-SEGUNDA', monto_confirmado: '20.00' });
    expect(confirmations[0].body.comprobante_path).toBeUndefined();
    const dispersed = await prisma.estados_comisiones.findUniqueOrThrow({ where: { nombre: 'Dispersada' } });
    expect(await prisma.historial_estados_comisiones.count({ where: { comision_id: second.id, estado_nuevo_id: dispersed.id } })).toBe(1);
    expect(await prisma.dispersiones_comision.count({ where: { comision_id: second.id } })).toBe(1);
    expect((await readdir('storage/postgres-tests')).length).toBe(filesBeforeConfirmation + 1);
    expect((await prisma.comisiones.findUniqueOrThrow({ where: { id: second.id }, select: legacyCommissionSelect })).estados_comisiones.nombre).toBe('Dispersada');
    const filesBeforeRetry = (await readdir('storage/postgres-tests')).length;
    const retry = await confirm(second.id, operationKey, 'REF-TEST-SEGUNDA', adminToken).expect(200);
    expect(retry.body).toEqual(confirmations[0].body);
    expect((await readdir('storage/postgres-tests')).length).toBe(filesBeforeRetry);
    await confirm(second.id, operationKey, 'REF-DIFERENTE', adminToken).expect(409);
    await confirm(second.id, operationKey, 'REF-TEST-SEGUNDA', adminToken,
      Buffer.from('%PDF-1.4\ncontenido-distinto\n%%EOF')).expect(409);
    await confirm(second.id, randomUUID(), 'REF-OTRA-CLAVE', adminToken).expect(409);
    const proofDownload = await request(server())
      .get(`/api/finanzas/dispersiones-comision/${confirmations[0].body.id}/comprobante`)
      .set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(proofDownload.headers['content-type']).toMatch(/application\/pdf/);
    expect(proofDownload.headers['cache-control']).toBe('private, no-store');
    expect(proofDownload.body).toEqual(proof);
    await request(server()).get(`/api/finanzas/dispersiones-comision/${confirmations[0].body.id}/comprobante`)
      .set('Authorization', `Bearer ${advisorToken}`).expect(403);
    await request(server()).get(`/api/finanzas/dispersiones-comision/${confirmations[0].body.id}/comprobante`).expect(401);
    const brokerConcept = await prisma.conceptos_dispersion.findUniqueOrThrow({ where: { nombre: 'Bróker' } });
    const broker = await request(server()).post('/api/finanzas/receptores-dispersion')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ concepto_id: brokerConcept.id, nombre_externo: `${prefix} Bróker` }).expect(201);
    receiverIds.push(broker.body.id);
    const [assignment, deactivation] = await Promise.all([
      request(server()).put(`/api/finanzas/contratos/${contractId}/comisiones`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ configuracion: [config(receiver.body.id, '20.0').configuracion[0],
          { concepto_id: brokerConcept.id, receptor_dispersion_id: broker.body.id, valor: '10.0' }] }),
      request(server()).patch(`/api/finanzas/receptores-dispersion/${broker.body.id}/desactivar`)
        .set('Authorization', `Bearer ${adminToken}`).send({}),
    ]);
    expect([[200, 409], [400, 200]]).toContainEqual([assignment.status, deactivation.status]);
    const brokerState = await prisma.receptores_dispersion.findUniqueOrThrow({ where: { id: broker.body.id } });
    const activeAssignment = await prisma.contrato_dispersion_detalle.count({ where: { contrato_id: contractId,
      receptor_dispersion_id: broker.body.id, activo: true } });
    expect(brokerState.activo ? activeAssignment === 1 : activeAssignment === 0).toBe(true);
  });

  it('registra destinos manuales, conserva sus snapshots y aísla al asesor', async () => {
    const adminToken = await tokenFor(adminId);
    const advisorToken = await tokenFor(advisorId);
    const target = await contract(advisorId, 'destinos-manuales');
    const concepts = Object.fromEntries((await prisma.conceptos_dispersion.findMany({ where: { nombre: { in: ['Director', 'Gerente', 'Bróker', 'IMSS', 'Referidor'] } } })).map(c => [c.nombre, c.id]));
    const rows: Array<{ concepto_id: number; receptor_dispersion_id?: string; valor: string }> = [];
    for (const [name, value] of [['Director', '10.0'], ['Gerente', '5.0'], ['Bróker', '2.5']] as const) {
      const created = await request(server()).post('/api/finanzas/receptores-dispersion')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ concepto_id: concepts[name], nombre_externo: `${prefix} Manual ${name}` }).expect(201);
      receiverIds.push(created.body.id);
      rows.push({ concepto_id: concepts[name], receptor_dispersion_id: created.body.id, valor: value });
    }
    await request(server()).post('/api/finanzas/receptores-dispersion')
      .set('Authorization', `Bearer ${advisorToken}`)
      .send({ concepto_id: concepts.Director, nombre_externo: 'Sin permiso' }).expect(403);
    await request(server()).post('/api/finanzas/receptores-dispersion')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ concepto_id: concepts.Director, usuario_id: advisorId }).expect(400);
    await request(server()).post('/api/finanzas/receptores-dispersion')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ concepto_id: concepts.Referidor, nombre_externo: 'Texto sin cliente' }).expect(409);
    await request(server()).put(`/api/finanzas/contratos/${target}/comisiones`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ configuracion: [{ concepto_id: concepts.Referidor, valor: '5.0' }] }).expect(409);
    await request(server()).put(`/api/finanzas/contratos/${target}/comisiones`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ configuracion: [...rows, { concepto_id: concepts.IMSS, valor: '1.0' }] }).expect(400);
    await request(server()).put(`/api/finanzas/contratos/${target}/comisiones`)
      .set('Authorization', `Bearer ${advisorToken}`)
      .send({ configuracion: rows }).expect(403);
    await request(server()).put(`/api/finanzas/contratos/${target}/comisiones`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ configuracion: rows }).expect(200);
    const payment = await request(server()).post('/api/finanzas/pagos')
      .set('Authorization', `Bearer ${advisorToken}`)
      .send({ ...paymentBody(target), monto: '100.00' }).expect(201);
    await request(server()).post(`/api/finanzas/pagos/${payment.body.id}/evidencias`)
      .set('Authorization', `Bearer ${advisorToken}`)
      .attach('file', Buffer.from('%PDF-1.4\nmanual\n%%EOF'), { filename: 'manual.pdf', contentType: 'application/pdf' }).expect(201);
    await request(server()).patch(`/api/finanzas/pagos/${payment.body.id}/estado`)
      .set('Authorization', `Bearer ${adminToken}`).send({ accion: 'validar' }).expect(200);
    const before = await prisma.comisiones.findMany({ where: { pago_id: payment.body.id }, select: legacyCommissionSelect });
    expect(before).toHaveLength(4);
    expect(before.find(x => x.conceptos_dispersion.nombre === 'Empresa')?.monto_comision.toFixed(2)).toBe('82.50');
    expect(before.find(x => x.conceptos_dispersion.nombre === 'Director')?.receptor_nombre_snapshot).toBe(`${prefix} Manual Director`);
    expect(before.find(x => x.conceptos_dispersion.nombre === 'Gerente')?.receptor_nombre_snapshot).toBe(`${prefix} Manual Gerente`);
    expect(before.find(x => x.conceptos_dispersion.nombre === 'Bróker')?.receptor_nombre_snapshot).toBe(`${prefix} Manual Bróker`);
    expect(before.every(x => x.beneficiario_id === null)).toBe(true);
    const directorCommission = before.find(x => x.conceptos_dispersion.nombre === 'Director')!;
    await request(server()).put(`/api/finanzas/comisiones/${directorCommission.id}/dispersar`)
      .set('Authorization', `Bearer ${adminToken}`)
      .field('idempotency_key', randomUUID()).field('referencia_transferencia', 'NO-TRANSFERENCIA')
      .attach('file', Buffer.from('%PDF-1.4\nno-dispersar\n%%EOF'), { filename: 'no.pdf', contentType: 'application/pdf' }).expect(409);
    await request(server()).put(`/api/finanzas/contratos/${target}/comisiones`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ configuracion: [
        { concepto_id: concepts.Director, valor: '20.0' },
        { concepto_id: concepts.Gerente, valor: '5.0' },
        { concepto_id: concepts['Bróker'], valor: '2.5' },
      ] }).expect(200);
    expect((await prisma.comisiones.findFirstOrThrow({ where: { pago_id: payment.body.id, concepto_id: concepts.Director }, select: legacyCommissionSelect })).receptor_nombre_snapshot).toBe(`${prefix} Manual Director`);
    const another = await request(server()).post('/api/finanzas/pagos')
      .set('Authorization', `Bearer ${advisorToken}`)
      .send({ ...paymentBody(target), monto: '100.00', referencia_pago: 'manual-segundo' }).expect(201);
    await request(server()).post(`/api/finanzas/pagos/${another.body.id}/evidencias`)
      .set('Authorization', `Bearer ${advisorToken}`)
      .attach('file', Buffer.from('%PDF-1.4\nmanual-segundo\n%%EOF'), { filename: 'manual2.pdf', contentType: 'application/pdf' }).expect(201);
    await request(server()).patch(`/api/finanzas/pagos/${another.body.id}/estado`)
      .set('Authorization', `Bearer ${adminToken}`).send({ accion: 'validar' }).expect(200);
    const after = await prisma.comisiones.findFirstOrThrow({ where: { pago_id: another.body.id, concepto_id: concepts.Director }, select: legacyCommissionSelect });
    expect(after.receptor_nombre_snapshot).toBeNull();
    expect(after.monto_comision.toFixed(2)).toBe('20.00');
    const advisorView = await request(server()).get('/api/finanzas/comisiones')
      .query({ contrato_id: target }).set('Authorization', `Bearer ${advisorToken}`).expect(200);
    expect(advisorView.body.total).toBe(0);
    expect(await prisma.comisiones.count({ where: { pago_id: payment.body.id } })).toBe(4);
  });

  it('bloquea validación M10 sin IMSS y permite el porcentaje explícito sin receptor', async () => {
    const adminToken = await tokenFor(adminId);
    const advisorToken = await tokenFor(advisorId);
    const m10 = await prisma.servicios.findUniqueOrThrow({ where: { codigo_folio: 'M10' } });
    const target = await contract(advisorId, 'imss-obligatorio', m10.id);
    const imss = await prisma.conceptos_dispersion.findUniqueOrThrow({ where: { nombre: 'IMSS' } });
    const payment = await request(server()).post('/api/finanzas/pagos')
      .set('Authorization', `Bearer ${advisorToken}`)
      .send({ ...paymentBody(target), monto: '100.00' }).expect(201);
    await request(server()).post(`/api/finanzas/pagos/${payment.body.id}/evidencias`)
      .set('Authorization', `Bearer ${advisorToken}`)
      .attach('file', Buffer.from('%PDF-1.4\nimss\n%%EOF'), { filename: 'imss.pdf', contentType: 'application/pdf' }).expect(201);
    await request(server()).patch(`/api/finanzas/pagos/${payment.body.id}/estado`)
      .set('Authorization', `Bearer ${adminToken}`).send({ accion: 'validar' }).expect(409);
    await request(server()).put(`/api/finanzas/contratos/${target}/comisiones`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ configuracion: [] }).expect(400);
    await request(server()).put(`/api/finanzas/contratos/${target}/comisiones`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ configuracion: [{ concepto_id: imss.id, valor: '0.0' }] }).expect(400);
    await request(server()).put(`/api/finanzas/contratos/${target}/comisiones`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ configuracion: [{ concepto_id: imss.id, valor: '8.5' }] }).expect(200);
    await request(server()).patch(`/api/finanzas/pagos/${payment.body.id}/estado`)
      .set('Authorization', `Bearer ${adminToken}`).send({ accion: 'validar' }).expect(200);
    const rows = await prisma.comisiones.findMany({ where: { pago_id: payment.body.id }, select: legacyCommissionSelect });
    expect(rows.find(x => x.conceptos_dispersion.nombre === 'IMSS')).toMatchObject({ receptor_dispersion_id: null, beneficiario_id: null, receptor_nombre_snapshot: null });
    expect(rows.find(x => x.conceptos_dispersion.nombre === 'IMSS')?.monto_comision.toFixed(2)).toBe('8.50');
    expect(rows.find(x => x.conceptos_dispersion.nombre === 'Empresa')?.monto_comision.toFixed(2)).toBe('91.50');
    for (const code of ['M40', 'M40R'] as const) {
      const service = await prisma.servicios.create({ data: { nombre: `${prefix} ${code}`, codigo_folio: code, activo: true } });
      serviceIds.push(service.id);
      const modalContract = await contract(advisorId, `imss-${code}`, service.id);
      await request(server()).put(`/api/finanzas/contratos/${modalContract}/comisiones`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ configuracion: [{ concepto_id: imss.id, valor: '7.0' }] }).expect(200);
      const modalPayment = await request(server()).post('/api/finanzas/pagos')
        .set('Authorization', `Bearer ${advisorToken}`)
        .send({ ...paymentBody(modalContract), monto: '100.00' }).expect(201);
      await request(server()).post(`/api/finanzas/pagos/${modalPayment.body.id}/evidencias`)
        .set('Authorization', `Bearer ${advisorToken}`)
        .attach('file', Buffer.from(`%PDF-1.4\n${code}\n%%EOF`), { filename: `${code}.pdf`, contentType: 'application/pdf' }).expect(201);
      await request(server()).patch(`/api/finanzas/pagos/${modalPayment.body.id}/estado`)
        .set('Authorization', `Bearer ${adminToken}`).send({ accion: 'validar' }).expect(200);
      const modalImss = await prisma.comisiones.findFirstOrThrow({ where: { pago_id: modalPayment.body.id, concepto_id: imss.id }, select: legacyCommissionSelect });
      expect(modalImss.monto_comision.toFixed(2)).toBe('7.00');
      expect(modalImss.receptor_dispersion_id).toBeNull();
    }
  });

  it('vincula Referidor por UUID, audita cambios administrativos y congela nombre e ID históricos', async () => {
    const advisorToken = await tokenFor(advisorId);
    const adminToken = await tokenFor(adminId);
    const otherAdvisorClient = await client(otherAdvisorId, 'referidor-ajeno');
    const createClient = (body: Record<string, unknown>) => request(server()).post('/api/clientes')
      .set('Authorization', `Bearer ${advisorToken}`).send(body);
    const firstRef = await createClient({ nombre: 'Referidor', apellido_paterno: 'Igual' }).expect(201);
    clientIds.push(firstRef.body.id); referralTestClientIds.push(firstRef.body.id);
    const secondRef = await createClient({ nombre: 'Referidor', apellido_paterno: 'Igual' }).expect(201);
    clientIds.push(secondRef.body.id); referralTestClientIds.push(secondRef.body.id);
    await createClient({ nombre: 'Titular', apellido_paterno: 'Ajeno', referido_por_cliente_id: otherAdvisorClient }).expect(404);
    await createClient({ nombre: 'Titular', apellido_paterno: 'Inexistente', referido_por_cliente_id: randomUUID() }).expect(404);
    const owner = await createClient({ nombre: 'Titular', apellido_paterno: 'Prueba', referido_por_cliente_id: firstRef.body.id }).expect(201);
    clientIds.push(owner.body.id); referralTestClientIds.push(owner.body.id);
    expect((await prisma.clientes.findUniqueOrThrow({ where: { id: owner.body.id }, select: { referido_por_cliente_id: true } })).referido_por_cliente_id).toBe(firstRef.body.id);
    const referralContract = await prisma.contratos.create({ data: {
      cliente_id: owner.body.id, asesor_id: advisorId, servicio_id: serviceId, estado_contrato_id: contractStateId,
      fecha_contrato: new Date('2026-11-17'), folio: `${prefix}-referidor-uuid`,
    }, select: { id: true } });
    contractIds.push(referralContract.id);
    const concept = await prisma.conceptos_dispersion.findUniqueOrThrow({ where: { nombre: 'Referidor' } });
    await request(server()).put(`/api/finanzas/contratos/${referralContract.id}/comisiones`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ configuracion: [{ concepto_id: concept.id, receptor_dispersion_id: randomUUID(), valor: '10.0' }] }).expect(400);
    await request(server()).put(`/api/finanzas/contratos/${referralContract.id}/comisiones`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ configuracion: [{ concepto_id: concept.id, valor: '10.0' }] }).expect(200);
    const registerAndValidate = async (reference: string) => {
      const payment = await request(server()).post('/api/finanzas/pagos')
        .set('Authorization', `Bearer ${advisorToken}`)
        .send({ ...paymentBody(referralContract.id), fecha_pago: '2027-01-04T14:00:00.000Z', monto: '100.00', referencia_pago: reference }).expect(201);
      await request(server()).post(`/api/finanzas/pagos/${payment.body.id}/evidencias`)
        .set('Authorization', `Bearer ${advisorToken}`)
        .attach('file', Buffer.from(`%PDF-1.4\n${reference}\n%%EOF`), { filename: `${reference}.pdf`, contentType: 'application/pdf' }).expect(201);
      await request(server()).patch(`/api/finanzas/pagos/${payment.body.id}/estado`)
        .set('Authorization', `Bearer ${adminToken}`).send({ accion: 'validar' }).expect(200);
      return payment.body.id as string;
    };
    const firstPayment = await registerAndValidate('referidor-primer-pago');
    const firstSnapshot = await prisma.comisiones.findFirstOrThrow({ where: { pago_id: firstPayment, concepto_id: concept.id }, select: { receptor_cliente_id: true, receptor_nombre_snapshot: true, monto_comision: true } });
    expect(firstSnapshot).toMatchObject({ receptor_cliente_id: firstRef.body.id, receptor_nombre_snapshot: 'Referidor Igual' });
    expect(firstSnapshot.monto_comision.toFixed(2)).toBe('10.00');
    await request(server()).patch(`/api/clientes/${firstRef.body.id}`)
      .set('Authorization', `Bearer ${advisorToken}`)
      .send({ apellido_paterno: 'Renombrado' }).expect(200);
    await request(server()).patch(`/api/clientes/${owner.body.id}/referidor`)
      .set('Authorization', `Bearer ${advisorToken}`)
      .send({ referidor_cliente_id: secondRef.body.id, motivo: 'Sin autorización' }).expect(403);
    await request(server()).patch(`/api/clientes/${owner.body.id}`)
      .set('Authorization', `Bearer ${advisorToken}`)
      .send({ referido_por_cliente_id: secondRef.body.id }).expect(400);
    await request(server()).patch(`/api/clientes/${owner.body.id}/referidor`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ referidor_cliente_id: secondRef.body.id, motivo: 'Se verificó el dato' }).expect(200);
    const history = await request(server()).get(`/api/clientes/${owner.body.id}/referidor/historial`)
      .set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(history.body).toHaveLength(2);
    expect(history.body[0]).toMatchObject({ referidor_anterior_id: firstRef.body.id, referidor_nuevo_id: secondRef.body.id, actor_id: adminId });
    const secondPayment = await registerAndValidate('referidor-segundo-pago');
    const secondSnapshot = await prisma.comisiones.findFirstOrThrow({ where: { pago_id: secondPayment, concepto_id: concept.id }, select: { receptor_cliente_id: true, receptor_nombre_snapshot: true } });
    expect(secondSnapshot).toMatchObject({ receptor_cliente_id: secondRef.body.id, receptor_nombre_snapshot: 'Referidor Igual' });
    expect((await prisma.comisiones.findFirstOrThrow({ where: { pago_id: firstPayment, concepto_id: concept.id }, select: { receptor_cliente_id: true, receptor_nombre_snapshot: true } }))).toMatchObject({
      receptor_cliente_id: firstRef.body.id, receptor_nombre_snapshot: 'Referidor Igual',
    });
    const cut = await request(server()).post('/api/finanzas/cortes')
      .set('Authorization', `Bearer ${adminToken}`).send({ periodo_inicio: '2027-01-01' }).expect(201);
    cutIds.push(cut.body.id);
    await request(server()).post(`/api/finanzas/cortes/${cut.body.id}/generar`)
      .set('Authorization', `Bearer ${adminToken}`).send({}).expect(200);
    const preview = await request(server()).get(`/api/finanzas/cortes/${cut.body.id}/prenomina/preparacion`)
      .set('Authorization', `Bearer ${adminToken}`).expect(200);
    const referralGroups = preview.body.por_receptor.filter((group: { destino: string }) => group.destino === 'Referidor');
    expect(referralGroups).toHaveLength(2);
    expect(referralGroups.map((group: { receptor_cliente_id: string }) => group.receptor_cliente_id).sort((a: string, b: string) => a.localeCompare(b))).toEqual([firstRef.body.id, secondRef.body.id].sort((a: string, b: string) => a.localeCompare(b)));
    expect(referralGroups.every((group: { receptor: string }) => group.receptor === 'Referidor Igual')).toBe(true);
    const state = await prisma.estados_prenomina.create({ data: { nombre: `${prefix} Preparada` }, select: { id: true } });
    prenominaStateIds.push(state.id);
    const payroll = await request(server()).post(`/api/finanzas/cortes/${cut.body.id}/prenomina/generar`)
      .set('Authorization', `Bearer ${adminToken}`).send({ estado_id: state.id }).expect(201);
    expect(payroll.body.detalle_prenomina).toHaveLength(2);
    const detailIds = payroll.body.detalle_prenomina.map((row: { receptor_cliente_id: string }) => row.receptor_cliente_id);
    expect(detailIds.sort((a: string, b: string) => a.localeCompare(b))).toEqual([firstRef.body.id, secondRef.body.id].sort((a: string, b: string) => a.localeCompare(b)));
    expect(payroll.body.detalle_prenomina.every((row: { receptor_cliente_id: string; comisiones: Array<{ receptor_cliente_id: string }> }) =>
      row.comisiones.every(commission => commission.receptor_cliente_id === row.receptor_cliente_id))).toBe(true);
    expect(await prisma.prenomina.count({ where: { corte_id: cut.body.id } })).toBe(1);
    const listing = await request(server()).get('/api/finanzas/prenominas')
      .query({ corte_id: cut.body.id }).set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(listing.body.total).toBe(1);
    expect(listing.body.data[0].detalle_prenomina).toHaveLength(2);
  });

  it('requiere nombre manual para Otro y conserva su snapshot sin dispersarlo', async () => {
    const adminToken = await tokenFor(adminId);
    const advisorToken = await tokenFor(advisorId);
    const target = await contract(advisorId, 'destino-otro');
    const concept = await prisma.conceptos_dispersion.findUniqueOrThrow({ where: { nombre: 'Otro' } });
    expect(concept.tipo_destino).toBe('externo');
    await request(server()).post('/api/finanzas/receptores-dispersion')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ concepto_id: concept.id, nombre_externo: '   ' }).expect(400);
    await request(server()).put(`/api/finanzas/contratos/${target}/comisiones`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ configuracion: [{ concepto_id: concept.id, valor: '3.5' }] }).expect(400);
    const receiver = await request(server()).post('/api/finanzas/receptores-dispersion')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ concepto_id: concept.id, nombre_externo: `${prefix} Otro comprobado` }).expect(201);
    receiverIds.push(receiver.body.id);
    await request(server()).put(`/api/finanzas/contratos/${target}/comisiones`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ configuracion: [{ concepto_id: concept.id, receptor_dispersion_id: receiver.body.id, valor: '3.5' }] }).expect(200);
    const payment = await request(server()).post('/api/finanzas/pagos')
      .set('Authorization', `Bearer ${advisorToken}`)
      .send({ ...paymentBody(target), monto: '100.00' }).expect(201);
    await request(server()).post(`/api/finanzas/pagos/${payment.body.id}/evidencias`)
      .set('Authorization', `Bearer ${advisorToken}`)
      .attach('file', Buffer.from('%PDF-1.4\notro\n%%EOF'), { filename: 'otro.pdf', contentType: 'application/pdf' }).expect(201);
    await request(server()).patch(`/api/finanzas/pagos/${payment.body.id}/estado`)
      .set('Authorization', `Bearer ${adminToken}`).send({ accion: 'validar' }).expect(200);
    const snapshot = await prisma.comisiones.findFirstOrThrow({ where: { pago_id: payment.body.id, concepto_id: concept.id }, select: { id: true, receptor_nombre_snapshot: true, monto_comision: true, estados_comisiones: { select: { nombre: true } } } });
    expect(snapshot.receptor_nombre_snapshot).toBe(`${prefix} Otro comprobado`);
    expect(snapshot.monto_comision.toFixed(2)).toBe('3.50');
    expect(snapshot.estados_comisiones.nombre).toBe('Pendiente de dispersión');
    const advisorView = await request(server()).get('/api/finanzas/comisiones')
      .query({ contrato_id: target }).set('Authorization', `Bearer ${advisorToken}`).expect(200);
    expect(advisorView.body.total).toBe(0);
  });

  it('reserva y reutiliza un periodo solo tras cancelar, conserva detalles y cierra sin duplicar ingresos', async () => {
    const adminToken = await tokenFor(adminId);
    const advisorToken = await tokenFor(advisorId);
    const payment = await request(server()).post('/api/finanzas/pagos')
      .set('Authorization', `Bearer ${advisorToken}`)
      .send({ ...paymentBody(contractId), fecha_pago: '2026-11-20T15:00:00.000Z', monto: '73.25' }).expect(201);
    await request(server()).post(`/api/finanzas/pagos/${payment.body.id}/evidencias`)
      .set('Authorization', `Bearer ${advisorToken}`)
      .attach('file', Buffer.from('%PDF-1.4\nfixture\n%%EOF'), { filename: 'corte.pdf', contentType: 'application/pdf' }).expect(201);
    await request(server()).patch(`/api/finanzas/pagos/${payment.body.id}/estado`)
      .set('Authorization', `Bearer ${adminToken}`).send({ accion: 'validar' }).expect(200);
    const create = () => request(server()).post('/api/finanzas/cortes')
      .set('Authorization', `Bearer ${adminToken}`).send({ periodo_inicio: '2026-11-20' });
    const attempts = await Promise.all([create(), create()]);
    expect(attempts.map(result => result.status).sort((a, b) => a - b)).toEqual([201, 409]);
    const firstCut = attempts.find(result => result.status === 201)!.body;
    cutIds.push(firstCut.id);
    await request(server()).get(`/api/finanzas/cortes/${firstCut.id}/preparacion`)
      .set('Authorization', `Bearer ${adminToken}`).expect(200);
    const generated = await request(server()).post(`/api/finanzas/cortes/${firstCut.id}/generar`)
      .set('Authorization', `Bearer ${adminToken}`).send({}).expect(200);
    expect(generated.body.resumen).toMatchObject({ cantidad_pagos: 1, total_ingresos: '73.25' });
    expect(generated.body.resumen.cantidad_comisiones).toBeGreaterThan(0);
    await request(server()).post(`/api/finanzas/cortes/${firstCut.id}/generar`)
      .set('Authorization', `Bearer ${adminToken}`).send({}).expect(409);
    await request(server()).post(`/api/finanzas/cortes/${firstCut.id}/cancelar`)
      .set('Authorization', `Bearer ${adminToken}`).send({ comentario: 'Corte ficticio cancelado' }).expect(200);
    const historical = await request(server()).get(`/api/finanzas/cortes/${firstCut.id}`)
      .set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(historical.body.resumen).toMatchObject({ cantidad_pagos: 1, total_ingresos: '73.25' });
    const secondCut = await create();
    expect(secondCut.status).toBe(201);
    cutIds.push(secondCut.body.id);
    const reopened = await request(server()).post(`/api/finanzas/cortes/${secondCut.body.id}/generar`)
      .set('Authorization', `Bearer ${adminToken}`).send({}).expect(200);
    expect(reopened.body.resumen).toMatchObject({ cantidad_pagos: 1, total_ingresos: '73.25' });
    await request(server()).post(`/api/finanzas/cortes/${secondCut.body.id}/cerrar`)
      .set('Authorization', `Bearer ${adminToken}`).send({}).expect(200);
    await request(server()).post(`/api/finanzas/cortes/${secondCut.body.id}/cancelar`)
      .set('Authorization', `Bearer ${adminToken}`).send({}).expect(409);
    expect(await prisma.cortes_pagos_reservados.count({ where: { pago_id: payment.body.id } })).toBe(1);
  });

  it('excluye asesores y auxiliar administrativo de cortes y limita la consulta de comisiones', async () => {
    const advisorToken = await tokenFor(advisorId);
    const financialToken = await tokenFor(financialId);
    const auxiliaryRole = await role('auxiliar administrativo');
    const auxiliaryId = await user(auxiliaryRole, 'auxiliar-comisiones');
    const auxiliaryToken = await tokenFor(auxiliaryId);
    await request(server()).get('/api/finanzas/cortes').expect(401);
    await request(server()).get('/api/finanzas/comisiones').expect(401);
    await request(server()).get('/api/finanzas/cortes')
      .set('Authorization', `Bearer ${advisorToken}`).expect(403);
    await request(server()).get('/api/finanzas/cortes')
      .set('Authorization', `Bearer ${auxiliaryToken}`).expect(403);
    await request(server()).get('/api/finanzas/comisiones')
      .set('Authorization', `Bearer ${auxiliaryToken}`).expect(403);
    await request(server()).get('/api/finanzas/cortes')
      .set('Authorization', `Bearer ${financialToken}`).expect(200);
    await request(server()).get('/api/finanzas/comisiones')
      .set('Authorization', `Bearer ${financialToken}`).expect(200);
  });
});
