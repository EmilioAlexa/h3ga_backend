import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { PrismaService } from '../database/prisma.service';
import { RolesGuard } from '../roles/guards/roles.guard';
import { CortesFinancierosController } from './cortes-financieros.controller';
import { CortesFinancierosService } from './cortes-financieros.service';

const secret = 'finanzas-cortes-test-secret-32-chars';
const ids = {
  admin: '75f88a9b-5680-4330-9fc8-474d6092ec1d',
  financial: '3918f25e-20d2-4ef8-8a2a-a3263991196c',
  advisor: '0ffac71e-e568-450c-8578-d4656a520047',
  cut: 'caf2c963-4531-4998-80d8-655cb904d192',
  payment: '39987e79-6ff9-40c7-b069-6aeb3d122cd8',
  pendingPayment: '4d579eec-d3d1-448e-b38a-e20d8e83a033',
};
const stateIds: Record<string, number> = {
  'En preparación': 11,
  Abierto: 12,
  Cerrado: 13,
  Cancelado: 14,
};

describe('CortesFinancierosController integration (HTTP, service, JWT and roles)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let users: Map<string, any>;
  let cut: Record<string, any> | null;
  let payments: Array<Record<string, any>>;
  let details: Array<Record<string, any>>;
  let paymentReservations: Array<{ pago_id: string; corte_id: string }>;
  let periodReservations: Array<Record<string, any>>;
  let history: Array<Record<string, any>>;
  let prisma: Record<string, any>;

  const buildPayment = (id: string, stateName: string, amount: string) => ({
    id,
    monto: amount,
    fecha_pago: new Date('2026-11-07T18:00:00.000Z'),
    referencia_pago: `REF-${id.slice(0, 4)}`,
    folio_recibo: null,
    estado_pago_id: 1,
    estados_pago: { id: 1, nombre: stateName },
    formas_pago: { id: 1, nombre: 'Transferencia' },
    contratos: {
      id: '58f338c7-e50a-417f-8681-44c74f3a215b',
      folio: 'CONT-01',
      asesor_id: ids.advisor,
      usuarios: {
        id: ids.advisor,
        nombre: 'Asesor',
        apellido_paterno: 'Prueba',
        apellido_materno: null,
      },
      clientes: {
        id: 'e96a633b-2a1e-43c4-a870-ea67de1fb4cd',
        nombre: 'Cliente',
        apellido_paterno: 'Prueba',
        apellido_materno: null,
      },
      servicios: { id: 1, nombre: 'Modalidad 40' },
    },
    comisiones: [],
  });

  const currentState = () =>
    Object.keys(stateIds).find((name) => stateIds[name] === cut?.estado_id) ??
    null;
  const readCut = () => {
    if (!cut) return null;
    return {
      ...cut,
      estados_corte: {
        id: cut.estado_id,
        nombre: currentState(),
        descripcion: null,
      },
      usuarios_cortes_financieros_creado_porTousuarios: {
        id: ids.admin,
        nombre: 'Admin',
        apellido_paterno: 'Prueba',
        apellido_materno: null,
      },
      usuarios_cortes_financieros_cerrado_porTousuarios: null,
      _count: { detalle_corte: details.length, prenomina: 0 },
      detalle_corte: details.map((detail) => ({
        ...detail,
        pagos: payments.find((payment) => payment.id === detail.pago_id),
      })),
    };
  };

  const buildTransaction = () => ({
    estados_corte: {
      findUnique: jest.fn(async ({ where }: any) =>
        where.nombre in stateIds
          ? { id: stateIds[where.nombre], nombre: where.nombre }
          : null,
      ),
    },
    cortes_financieros: {
      create: jest.fn(async ({ data }: any) => {
        const created = { id: ids.cut, numero_corte: 1, ...data };
        cut = created;
        return {
          id: created.id,
          numero_corte: created.numero_corte,
          estado_id: created.estado_id,
        };
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        const current = cut;
        return current && current.id === where.id
          ? {
              ...current,
              estados_corte: { id: current.estado_id, nombre: currentState() },
            }
          : null;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (!cut || cut.id !== where.id || cut.estado_id !== where.estado_id)
          return { count: 0 };
        Object.assign(cut, data);
        return { count: 1 };
      }),
    },
    cortes_periodos_reservados: {
      create: jest.fn(async ({ data }: any) => {
        periodReservations.push(data);
        return data;
      }),
      deleteMany: jest.fn(async ({ where }: any) => {
        const before = periodReservations.length;
        periodReservations = periodReservations.filter(
          (row) => row.corte_id !== where.corte_id,
        );
        return { count: before - periodReservations.length };
      }),
    },
    cortes_pagos_reservados: {
      findMany: jest.fn(async ({ where }: any) =>
        paymentReservations.filter(
          (row) =>
            where.pago_id.in.includes(row.pago_id) &&
            (where.corte_id?.not ? row.corte_id !== where.corte_id.not : true),
        ),
      ),
      createMany: jest.fn(async ({ data }: any) => {
        paymentReservations.push(...data);
        return { count: data.length };
      }),
      deleteMany: jest.fn(async ({ where }: any) => {
        const before = paymentReservations.length;
        paymentReservations = paymentReservations.filter(
          (row) => row.corte_id !== where.corte_id,
        );
        return { count: before - paymentReservations.length };
      }),
    },
    pagos: {
      findMany: jest.fn(async ({ where }: any = {}) =>
        payments.filter((payment) => {
          const date = payment.fecha_pago.getTime();
          if (
            where?.fecha_pago &&
            !(
              date >= where.fecha_pago.gte.getTime() &&
              date < where.fecha_pago.lt.getTime()
            )
          )
            return false;
          if (
            where?.estados_pago?.is?.nombre &&
            payment.estados_pago.nombre !== where.estados_pago.is.nombre
          )
            return false;
          return true;
        }),
      ),
    },
    detalle_corte: {
      createMany: jest.fn(async ({ data }: any) => {
        details.push(...data);
        return { count: data.length };
      }),
    },
    historial_estados_corte: {
      create: jest.fn(async ({ data }: any) => {
        history.push(data);
        return data;
      }),
      findMany: jest.fn(async () => history),
    },
  });

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
    ]);
    const tx = buildTransaction();
    prisma = {
      $transaction: jest.fn(async (callback: (transaction: any) => unknown) =>
        callback(tx),
      ),
      usuarios: {
        findUnique: jest.fn(
          async ({ where }: any) => users.get(where.id) ?? null,
        ),
      },
      cortes_financieros: {
        findUnique: jest.fn(async () => readCut()),
        findMany: jest.fn(async () => (readCut() ? [readCut()] : [])),
        count: jest.fn(async () => (cut ? 1 : 0)),
      },
      pagos: tx.pagos,
      cortes_pagos_reservados: tx.cortes_pagos_reservados,
      historial_estados_corte: tx.historial_estados_corte,
    };
    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret, signOptions: { expiresIn: '1h' } }),
      ],
      controllers: [CortesFinancierosController],
      providers: [
        JwtAuthGuard,
        JwtStrategy,
        RolesGuard,
        CortesFinancierosService,
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
    cut = null;
    payments = [
      buildPayment(ids.payment, 'Validado', '1000.00'),
      buildPayment(
        ids.pendingPayment,
        'Pendiente de revisión financiera',
        '250.00',
      ),
    ];
    details = [];
    paymentReservations = [];
    periodReservations = [];
    history = [];
  });

  afterAll(async () => app.close());

  it('requires authentication and denies advisors', async () => {
    await request(app.getHttpServer()).get('/api/finanzas/cortes').expect(401);
    await request(app.getHttpServer())
      .get('/api/finanzas/cortes')
      .set('Authorization', `Bearer ${await tokenFor(ids.advisor)}`)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/finanzas/cortes')
      .set('Authorization', `Bearer ${await tokenFor(ids.advisor)}`)
      .send({ periodo_inicio: '2026-11-06' })
      .expect(403);
  });

  it('runs create, preview and generate through HTTP and the real service', async () => {
    const auth = `Bearer ${await tokenFor(ids.admin)}`;
    const created = await request(app.getHttpServer())
      .post('/api/finanzas/cortes')
      .set('Authorization', auth)
      .send({ periodo_inicio: '2026-11-06' })
      .expect(201);
    expect(created.body.folio).toBe('CF-2026-001');
    const cutId = created.body.id;

    const preview = await request(app.getHttpServer())
      .get(`/api/finanzas/cortes/${cutId}/preparacion`)
      .set('Authorization', auth)
      .expect(200);
    expect(preview.body.incluidos.cantidad).toBe(1);
    expect(preview.body.incluidos.total_ingresos).toBe('1000.00');
    expect(preview.body.excluidos.cantidad).toBe(1);

    const generated = await request(app.getHttpServer())
      .post(`/api/finanzas/cortes/${cutId}/generar`)
      .set('Authorization', auth)
      .send({ comentario: 'Integración de prueba' })
      .expect(200);
    expect(generated.body.estados_corte.nombre).toBe('Abierto');
    expect(generated.body.detalle_corte).toHaveLength(1);
    expect(generated.body.detalle_corte[0].monto).toBe('1000.00');
    expect(paymentReservations).toEqual([
      { pago_id: ids.payment, corte_id: cutId },
    ]);
  });

  it('allows the financial administrator and validates weekly input in the real service', async () => {
    const auth = `Bearer ${await tokenFor(ids.financial)}`;
    const transactionsBefore = prisma.$transaction.mock.calls.length;
    await request(app.getHttpServer())
      .post('/api/finanzas/cortes')
      .set('Authorization', auth)
      .send({ periodo_inicio: '2026-11-07' })
      .expect(400);
    expect(prisma.$transaction).toHaveBeenCalledTimes(transactionsBefore);
  });
});
