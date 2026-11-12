import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import request from 'supertest';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JwtStrategy } from '../../auth/strategies/jwt.strategy';
import { PrismaService } from '../../database/prisma.service';
import { RolesGuard } from '../../roles/guards/roles.guard';
import { PagosController } from './pagos.controller';
import { PagosService } from './pagos.service';
import { ComisionesService } from '../comisiones/comisiones.service';

const secret = 'finanzas-pagos-test-secret-32-chars';
const ids = {
  admin: '75f88a9b-5680-4330-9fc8-474d6092ec1d',
  financial: '3918f25e-20d2-4ef8-8a2a-a3263991196c',
  advisor: '0ffac71e-e568-450c-8578-d4656a520047',
  otherAdvisor: 'db0cbb62-a8ef-4587-8c28-1f3aaf63b20a',
  receiver: '7cf0e449-23a7-462a-8ef9-5222b09a54e1',
  customer: 'e96a633b-2a1e-43c4-a870-ea67de1fb4cd',
  contract: 'caf2c963-4531-4998-80d8-655cb904d192',
  otherContract: '58f338c7-e50a-417f-8681-44c74f3a215b',
  payment: '39987e79-6ff9-40c7-b069-6aeb3d122cd8',
  otherPayment: '4d579eec-d3d1-448e-b38a-e20d8e83a033',
  cashPayment: '56a41d91-708f-48a0-a56e-f83aa446b496',
  scheduled: '06845e95-ea1d-44d6-9151-1bd999e32091',
  otherScheduled: 'a99d6050-8b8b-4864-bac0-c9f277cbca66',
};

const statusRows = [
  { id: 1, nombre: 'Pendiente de revisión financiera', orden: 1 },
  { id: 2, nombre: 'Rechazado', orden: 2 },
  { id: 3, nombre: 'Pendiente de autorización', orden: 3 },
  { id: 4, nombre: 'Validado', orden: 4 },
  { id: 5, nombre: 'Cancelado', orden: 5 },
];
const formRows = [
  { id: 1, nombre: 'Efectivo', activo: true },
  { id: 2, nombre: 'Transferencia electrónica', activo: true },
  { id: 3, nombre: 'Depósito', activo: true },
  { id: 4, nombre: 'Cheque', activo: true },
];
const evidenceTypeIds: Record<string, number> = {
  'Comprobante de efectivo': 11,
  'Comprobante bancario': 12,
  'Comprobante de cheque': 13,
};

type MockUser = { id: string; activo: boolean; roles: { nombre: string } };
type MockPayment = Record<string, any> & {
  id: string;
  contrato_id: string;
  estado_pago_id: number;
  forma_pago_id: number;
};

describe('PagosController (JWT, amounts, roles, history and ownership)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let users: Map<string, MockUser>;
  let payments: MockPayment[];
  let histories: Record<string, any>[];
  let evidences: Record<string, any>[];
  let prisma: Record<string, any>;
  let tx: Record<string, any>;

  const contractFor = (id: string) => ({
    id,
    folio: id === ids.contract ? 'CONTRATO-1' : 'CONTRATO-2',
    cliente_id: ids.customer,
    asesor_id: id === ids.contract ? ids.advisor : ids.otherAdvisor,
    clientes: {
      id: ids.customer,
      nombre: 'Cliente',
      apellido_paterno: 'Prueba',
      apellido_materno: null,
    },
  });

  const buildPayment = (data: Record<string, any>, id = ids.payment) => {
    const forma = formRows.find((row) => row.id === data.forma_pago_id);
    const estado = statusRows.find((row) => row.id === data.estado_pago_id);
    const receiver = data.recibido_por ? users.get(data.recibido_por) : null;
    return {
      id,
      ...data,
      fecha_registro: new Date('2026-11-09T12:00:00.000Z'),
      contratos: contractFor(data.contrato_id),
      formas_pago: forma ? { id: forma.id, nombre: forma.nombre } : null,
      estados_pago: estado ?? null,
      pagos_programados: data.pago_programado_id
        ? {
            id: data.pago_programado_id,
            numero_pago: 1,
            fecha_esperada: null,
            fecha_vencimiento: null,
            monto_esperado: null,
          }
        : null,
      usuarios: data.registrado_por
        ? { id: data.registrado_por, nombre: 'Usuario' }
        : null,
      usuario_receptor: receiver
        ? { id: receiver.id, nombre: 'Receptor' }
        : null,
      evidencias_pago: evidences
        .filter((evidence) => evidence.pago_id === id)
        .map((evidence) => ({
          id: evidence.id,
          nombre_original: evidence.nombre_original,
          tipo_archivo: evidence.tipo_archivo,
          tipo_evidencia_id: evidence.tipo_evidencia_id,
          tipos_evidencia_pago: {
            id: evidence.tipo_evidencia_id,
            nombre: Object.keys(evidenceTypeIds).find(
              (name) => evidenceTypeIds[name] === evidence.tipo_evidencia_id,
            ),
          },
        })),
    } as unknown as MockPayment;
  };

  async function tokenFor(id: string) {
    return jwt.signAsync({ sub: id });
  }

  beforeAll(async () => {
    users = new Map([
      [
        ids.admin,
        { id: ids.admin, activo: true, roles: { nombre: 'administrador' } },
      ],
      [
        ids.financial,
        {
          id: ids.financial,
          activo: true,
          roles: { nombre: 'administrador financiero' },
        },
      ],
      [
        ids.advisor,
        { id: ids.advisor, activo: true, roles: { nombre: 'asesor' } },
      ],
      [
        ids.otherAdvisor,
        { id: ids.otherAdvisor, activo: true, roles: { nombre: 'asesor' } },
      ],
      [
        ids.receiver,
        { id: ids.receiver, activo: true, roles: { nombre: 'auxiliar' } },
      ],
    ]);
    payments = [];
    histories = [];
    evidences = [];

    tx = {
      contratos: {
        findUnique: jest.fn(async ({ where }: any) =>
          where.id === ids.contract || where.id === ids.otherContract
            ? { id: where.id, asesor_id: contractFor(where.id).asesor_id }
            : null,
        ),
      },
      formas_pago: {
        findUnique: jest.fn(
          async ({ where }: any) =>
            formRows.find(
              (form) =>
                form.id === where.id &&
                (where.activo === undefined || form.activo === where.activo),
            ) ?? null,
        ),
      },
      estados_pago: {
        findUnique: jest.fn(
          async ({ where }: any) =>
            statusRows.find(
              (status) =>
                status.id === where.id || status.nombre === where.nombre,
            ) ?? null,
        ),
      },
      usuarios: {
        findUnique: jest.fn(
          async ({ where }: any) => users.get(where.id) ?? null,
        ),
      },
      pagos_programados: {
        findUnique: jest.fn(async ({ where }: any) => {
          if (where.id === ids.scheduled)
            return { id: ids.scheduled, contrato_id: ids.contract };
          if (where.id === ids.otherScheduled) {
            return { id: ids.otherScheduled, contrato_id: ids.otherContract };
          }
          return null;
        }),
      },
      tipos_evidencia_pago: {
        findUnique: jest.fn(async ({ where }: any) => {
          const id = evidenceTypeIds[where.nombre];
          return id ? { id } : null;
        }),
      },
      evidencias_pago: {
        count: jest.fn(
          async ({ where }: any) =>
            evidences.filter(
              (evidence) =>
                evidence.pago_id === where.pago_id &&
                evidence.tipo_evidencia_id === where.tipo_evidencia_id,
            ).length,
        ),
      },
      pagos: {
        create: jest.fn(async ({ data }: any) => {
          const payment = buildPayment(data);
          payments.push(payment);
          return payment;
        }),
        findFirst: jest.fn(async ({ where }: any) => {
          const payment = payments.find((item) => item.id === where.id);
          if (!payment) return null;
          if (
            where.contratos?.is?.asesor_id &&
            contractFor(payment.contrato_id).asesor_id !==
              where.contratos.is.asesor_id
          ) {
            return null;
          }
          return {
            id: payment.id,
            estado_pago_id: payment.estado_pago_id,
            forma_pago_id: payment.forma_pago_id,
            estados_pago:
              statusRows.find((row) => row.id === payment.estado_pago_id) ??
              null,
            formas_pago:
              formRows.find((row) => row.id === payment.forma_pago_id) ?? null,
          };
        }),
        findUnique: jest.fn(async ({ where }: any) => {
          const payment = payments.find((item) => item.id === where.id);
          return payment ? buildPayment(payment, payment.id) : null;
        }),
        updateMany: jest.fn(async ({ where, data }: any) => {
          const payment = payments.find(
            (item) =>
              item.id === where.id &&
              item.estado_pago_id === where.estado_pago_id,
          );
          if (!payment) return { count: 0 };
          Object.assign(payment, data);
          return { count: 1 };
        }),
        findMany: jest.fn(async ({ where, skip, take }: any) =>
          payments
            .filter((payment) => {
              if (
                where.estado_pago_id &&
                payment.estado_pago_id !== where.estado_pago_id
              ) {
                return false;
              }
              if (
                where.contratos?.is?.asesor_id &&
                contractFor(payment.contrato_id).asesor_id !==
                  where.contratos.is.asesor_id
              ) {
                return false;
              }
              if (
                where.contratos?.is?.id &&
                payment.contrato_id !== where.contratos.is.id
              ) {
                return false;
              }
              return true;
            })
            .slice(skip, skip + take)
            .map((payment) => buildPayment(payment, payment.id)),
        ),
        count: jest.fn(
          async ({ where }: any) =>
            payments.filter((payment) => {
              if (
                where.estado_pago_id &&
                payment.estado_pago_id !== where.estado_pago_id
              ) {
                return false;
              }
              if (
                where.contratos?.is?.asesor_id &&
                contractFor(payment.contrato_id).asesor_id !==
                  where.contratos.is.asesor_id
              ) {
                return false;
              }
              return true;
            }).length,
        ),
      },
      historial_estados_pago: {
        create: jest.fn(async ({ data }: any) => {
          const history = {
            id: `history-${histories.length + 1}`,
            ...data,
            fecha_cambio: new Date(),
          };
          histories.push(history);
          return history;
        }),
      },
    };

    prisma = {
      usuarios: {
        findUnique: jest.fn(
          async ({ where }: any) => users.get(where.id) ?? null,
        ),
      },
      $transaction: jest.fn(async (callback: (transaction: any) => unknown) =>
        callback(tx),
      ),
      pagos: tx.pagos,
      historial_estados_pago: {
        findMany: jest.fn(async ({ where }: any) =>
          histories.filter((history) => history.pago_id === where.pago_id),
        ),
      },
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret, signOptions: { expiresIn: '1h' } }),
      ],
      controllers: [PagosController],
      providers: [
        PagosService,
        { provide: ComisionesService, useValue: { generateForValidatedPayment: jest.fn() } },
        JwtAuthGuard,
        JwtStrategy,
        RolesGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { getOrThrow: () => secret } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    jwt = app.get(JwtService);
  });

  beforeEach(() => {
    payments = [
      buildPayment(
        {
          contrato_id: ids.contract,
          pago_programado_id: null,
          forma_pago_id: 2,
          estado_pago_id: 1,
          monto: '500.00',
          fecha_pago: new Date('2026-11-09T12:00:00.000Z'),
          registrado_por: ids.advisor,
          referencia_pago: 'TRX-1',
          folio_recibo: null,
          recibido_por: null,
          lugar_recepcion: null,
          observaciones: null,
        },
        ids.payment,
      ) as MockPayment,
      buildPayment(
        {
          contrato_id: ids.otherContract,
          pago_programado_id: null,
          forma_pago_id: 2,
          estado_pago_id: 1,
          monto: '700.00',
          fecha_pago: new Date('2026-11-09T12:00:00.000Z'),
          registrado_por: ids.otherAdvisor,
          referencia_pago: 'TRX-2',
          folio_recibo: null,
          recibido_por: null,
          lugar_recepcion: null,
          observaciones: null,
        },
        ids.otherPayment,
      ) as MockPayment,
    ];
    histories = [];
    evidences = [];
    jest.clearAllMocks();
  });

  afterAll(async () => app.close());

  it('requires an active authenticated user with an allowed role', async () => {
    await request(app.getHttpServer()).get('/api/finanzas/pagos').expect(401);
    const unknownId = 'e5141cb5-8c87-43aa-806e-8ad8183be203';
    users.set(unknownId, {
      id: unknownId,
      activo: true,
      roles: { nombre: 'capturista' },
    });
    const token = await tokenFor(unknownId);
    await request(app.getHttpServer())
      .get('/api/finanzas/pagos')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('creates an advisor payment with JWT ownership and initial state history', async () => {
    const token = await tokenFor(ids.advisor);
    const response = await request(app.getHttpServer())
      .post('/api/finanzas/pagos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        contrato_id: ids.contract,
        pago_programado_id: ids.scheduled,
        forma_pago_id: 2,
        monto: '1500.00',
        fecha_pago: '2026-11-09T12:00:00.000Z',
        referencia_pago: 'TRX-NEW',
      })
      .expect(201);

    expect(response.body).toMatchObject({
      registrado_por: ids.advisor,
      estado_pago_id: 1,
      contrato_id: ids.contract,
      pago_programado_id: ids.scheduled,
    });
    expect(histories).toHaveLength(1);
    expect(histories[0]).toMatchObject({
      estado_anterior_id: null,
      estado_nuevo_id: 1,
      cambiado_por: ids.advisor,
    });
  });

  it.each([
    ['administrador', ids.admin],
    ['administrador financiero', ids.financial],
  ])('%s can also register a payment', async (_role, userId) => {
    const token = await tokenFor(userId);
    const response = await request(app.getHttpServer())
      .post('/api/finanzas/pagos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        contrato_id: ids.otherContract,
        forma_pago_id: 3,
        monto: '800.50',
        fecha_pago: '2026-11-09T12:00:00.000Z',
        referencia_pago: 'DEP-ADMIN',
      })
      .expect(201);
    expect(response.body.registrado_por).toBe(userId);
    expect(response.body.estado_pago_id).toBe(1);
  });

  it('requires cash receipt folio and an active receiving user', async () => {
    const token = await tokenFor(ids.advisor);
    const body = {
      contrato_id: ids.contract,
      forma_pago_id: 1,
      monto: '500.00',
      fecha_pago: '2026-11-09T12:00:00.000Z',
    };
    await request(app.getHttpServer())
      .post('/api/finanzas/pagos')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/finanzas/pagos')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...body, folio_recibo: 'REC-001' })
      .expect(400);
    const response = await request(app.getHttpServer())
      .post('/api/finanzas/pagos')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...body, folio_recibo: 'REC-001', recibido_por: ids.receiver })
      .expect(201);
    expect(response.body).toMatchObject({
      folio_recibo: 'REC-001',
      recibido_por: ids.receiver,
      registrado_por: ids.advisor,
    });
  });

  it('validates scheduled payment ownership, advisor contract ownership, and amount', async () => {
    const token = await tokenFor(ids.advisor);
    const body = {
      contrato_id: ids.contract,
      forma_pago_id: 2,
      monto: '12.50',
      fecha_pago: '2026-11-09T12:00:00.000Z',
    };
    await request(app.getHttpServer())
      .post('/api/finanzas/pagos')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...body, contrato_id: ids.otherContract })
      .expect(404);
    await request(app.getHttpServer())
      .post('/api/finanzas/pagos')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...body, pago_programado_id: ids.otherScheduled })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/finanzas/pagos')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...body, monto: '0.00' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/finanzas/pagos')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...body, monto: '1.999' })
      .expect(400);
  });

  it('scopes advisor list, detail, and history to contracts.asesor_id', async () => {
    const token = await tokenFor(ids.advisor);
    const response = await request(app.getHttpServer())
      .get(`/api/finanzas/pagos?asesor_id=${ids.otherAdvisor}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body.data.map((item: any) => item.id)).toEqual([
      ids.payment,
    ]);
    await request(app.getHttpServer())
      .get(`/api/finanzas/pagos/${ids.otherPayment}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/finanzas/pagos/${ids.otherPayment}/historial`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('enforces the financial review and administrator authorization matrix with evidence', async () => {
    const financialToken = await tokenFor(ids.financial);
    await request(app.getHttpServer())
      .patch(`/api/finanzas/pagos/${ids.payment}/estado`)
      .set('Authorization', `Bearer ${financialToken}`)
      .send({ accion: 'enviar_a_autorizacion' })
      .expect(400);

    evidences.push({
      pago_id: ids.payment,
      tipo_evidencia_id: evidenceTypeIds['Comprobante bancario'],
    });
    await request(app.getHttpServer())
      .patch(`/api/finanzas/pagos/${ids.payment}/estado`)
      .set('Authorization', `Bearer ${financialToken}`)
      .send({ accion: 'enviar_a_autorizacion' })
      .expect(200);
    expect(payments[0].estado_pago_id).toBe(3);

    await request(app.getHttpServer())
      .patch(`/api/finanzas/pagos/${ids.payment}/estado`)
      .set('Authorization', `Bearer ${financialToken}`)
      .send({ accion: 'rechazar' })
      .expect(403);

    const adminToken = await tokenFor(ids.admin);
    await request(app.getHttpServer())
      .patch(`/api/finanzas/pagos/${ids.payment}/estado`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ accion: 'validar', comentario: 'Autorización final' })
      .expect(200);
    expect(payments[0].estado_pago_id).toBe(4);
    expect(histories.at(-1)).toMatchObject({
      estado_anterior_id: 3,
      estado_nuevo_id: 4,
      cambiado_por: ids.admin,
    });
  });

  it('allows admin direct validation but requires method-specific evidence; rejected is terminal', async () => {
    const cashPayment = buildPayment(
      {
        contrato_id: ids.contract,
        pago_programado_id: null,
        forma_pago_id: 1,
        estado_pago_id: 1,
        monto: '80.00',
        registrado_por: ids.advisor,
        folio_recibo: 'REC-80',
        recibido_por: ids.receiver,
      },
      ids.cashPayment,
    ) as MockPayment;
    payments.push(cashPayment);
    const adminToken = await tokenFor(ids.admin);

    await request(app.getHttpServer())
      .patch(`/api/finanzas/pagos/${ids.cashPayment}/estado`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ accion: 'validar' })
      .expect(400);
    evidences.push({
      pago_id: ids.cashPayment,
      tipo_evidencia_id: evidenceTypeIds['Comprobante de efectivo'],
    });
    await request(app.getHttpServer())
      .patch(`/api/finanzas/pagos/${ids.cashPayment}/estado`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ accion: 'validar' })
      .expect(200);
    expect(payments[2].estado_pago_id).toBe(4);

    payments[2].estado_pago_id = 2;
    await request(app.getHttpServer())
      .patch(`/api/finanzas/pagos/${ids.cashPayment}/estado`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ accion: 'validar' })
      .expect(409);
  });

  it('returns the audit history for an owned payment', async () => {
    histories.push({
      id: 'history-1',
      pago_id: ids.payment,
      estado_anterior_id: null,
      estado_nuevo_id: 1,
      cambiado_por: ids.advisor,
      fecha_cambio: new Date(),
      comentario: 'Pago registrado',
    });
    const token = await tokenFor(ids.advisor);
    const response = await request(app.getHttpServer())
      .get(`/api/finanzas/pagos/${ids.payment}/historial`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].estado_nuevo_id).toBe(1);
  });

  it('allows financial rejection at the initial review and keeps cancellation unreachable', async () => {
    const token = await tokenFor(ids.financial);
    await request(app.getHttpServer())
      .patch(`/api/finanzas/pagos/${ids.otherPayment}/estado`)
      .set('Authorization', `Bearer ${token}`)
      .send({ accion: 'rechazar', comentario: 'Referencia incorrecta' })
      .expect(200);
    expect(payments[1].estado_pago_id).toBe(2);

    payments[0].estado_pago_id = 5;
    const adminToken = await tokenFor(ids.admin);
    await request(app.getHttpServer())
      .patch(`/api/finanzas/pagos/${ids.payment}/estado`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ accion: 'validar' })
      .expect(409);
  });
});
