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
import { ContratosController } from './contratos.controller';
import { ContratosService } from './contratos.service';

const secret = 'finanzas-contratos-test-secret-32-chars';
const ids = {
  admin: '75f88a9b-5680-4330-9fc8-474d6092ec1d',
  financial: '3918f25e-20d2-4ef8-8a2a-a3263991196c',
  advisor: '0ffac71e-e568-450c-8578-d4656a520047',
  otherAdvisor: 'db0cbb62-a8ef-4587-8c28-1f3aaf63b20a',
  inactiveAdvisor: '0f44c44a-31af-4396-b30e-64a365a352ca',
  customer: 'e96a633b-2a1e-43c4-a870-ea67de1fb4cd',
  contract: 'caf2c963-4531-4998-80d8-655cb904d192',
  otherContract: '58f338c7-e50a-417f-8681-44c74f3a215b',
};

type MockUser = {
  id: string;
  activo: boolean;
  roles: { nombre: string };
};
type MockContract = Record<string, any> & {
  id: string;
  asesor_id: string;
  observaciones: string | null;
};

describe('ContratosController (JWT and contract ownership)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let users: Map<string, MockUser>;
  let contracts: MockContract[];
  let prisma: Record<string, any>;
  let transaction: Record<string, any>;

  const buildContract = (data: Record<string, any>, id = ids.contract) =>
    ({
      id,
      ...data,
      creado_en: new Date('2026-11-09T12:00:00.000Z'),
      clientes: {
        id: ids.customer,
        nombre: 'Cliente',
        apellido_paterno: 'Prueba',
        apellido_materno: null,
      },
      servicios: { id: 1, nombre: 'Servicio prueba' },
      usuarios: {
        id: data.asesor_id,
        nombre: 'Asesor',
        apellido_paterno: 'Prueba',
        apellido_materno: null,
      },
      estados_contratos: { id: 1, nombre: 'Activo', orden: 1 },
    }) as unknown as MockContract;

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
        ids.inactiveAdvisor,
        { id: ids.inactiveAdvisor, activo: false, roles: { nombre: 'asesor' } },
      ],
    ]);
    contracts = [];

    transaction = {
      clientes: {
        findUnique: jest.fn(async ({ where }: any) =>
          where.id === ids.customer ? { id: ids.customer } : null,
        ),
      },
      servicios: {
        findUnique: jest.fn(async ({ where }: any) =>
          where.id === 1 && where.activo === true ? { id: 1 } : null,
        ),
      },
      estados_contratos: {
        findUnique: jest.fn(async ({ where }: any) =>
          where.id === 1 ? { id: 1 } : null,
        ),
      },
      usuarios: {
        findUnique: jest.fn(
          async ({ where }: any) => users.get(where.id) ?? null,
        ),
      },
      contratos: {
        create: jest.fn(async ({ data }: any) => {
          const contract = buildContract(data);
          contracts.push(contract);
          return contract;
        }),
      },
    };

    prisma = {
      usuarios: {
        findUnique: jest.fn(
          async ({ where }: any) => users.get(where.id) ?? null,
        ),
      },
      $transaction: jest.fn(async (callback: (tx: any) => unknown) =>
        callback(transaction),
      ),
      contratos: {
        findMany: jest.fn(async ({ where, skip, take }: any) =>
          contracts
            .filter((contract) =>
              Object.entries(where).every(([key, value]: [string, any]) => {
                if (key === 'folio')
                  return contract.folio.includes(value.contains);
                if (key === 'fecha_contrato') {
                  const date = contract.fecha_contrato.getTime();
                  return (
                    (!value.gte || date >= value.gte.getTime()) &&
                    (!value.lte || date <= value.lte.getTime())
                  );
                }
                return contract[key] === value;
              }),
            )
            .slice(skip, skip + take),
        ),
        count: jest.fn(
          async ({ where }: any) =>
            contracts.filter((contract) =>
              Object.entries(where).every(
                ([key, value]) => contract[key] === value,
              ),
            ).length,
        ),
        findFirst: jest.fn(
          async ({ where }: any) =>
            contracts.find((contract) =>
              Object.entries(where).every(
                ([key, value]) => contract[key] === value,
              ),
            ) ?? null,
        ),
        updateMany: jest.fn(async ({ where, data }: any) => {
          const contract = contracts.find((item) =>
            Object.entries(where).every(([key, value]) => item[key] === value),
          );
          if (!contract) return { count: 0 };
          Object.assign(contract, data);
          return { count: 1 };
        }),
      },
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret, signOptions: { expiresIn: '1h' } }),
      ],
      controllers: [ContratosController],
      providers: [
        ContratosService,
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
    contracts = [
      buildContract(
        {
          cliente_id: ids.customer,
          servicio_id: 1,
          asesor_id: ids.advisor,
          folio: 'TEST-OWN',
          fecha_contrato: new Date('2026-11-09T00:00:00.000Z'),
          estado_contrato_id: 1,
          cantidad_pagos: null,
          observaciones: null,
        },
        ids.contract,
      ),
      buildContract(
        {
          cliente_id: ids.customer,
          servicio_id: 1,
          asesor_id: ids.otherAdvisor,
          folio: 'TEST-OTHER',
          fecha_contrato: new Date('2026-11-09T00:00:00.000Z'),
          estado_contrato_id: 1,
          cantidad_pagos: null,
          observaciones: null,
        },
        ids.otherContract,
      ),
    ];
    jest.clearAllMocks();
  });

  afterAll(async () => app.close());

  it('requires JWT and rejects roles outside the contract policy', async () => {
    await request(app.getHttpServer())
      .post('/api/finanzas/contratos')
      .send({})
      .expect(401);

    const unauthorizedId = 'e5141cb5-8c87-43aa-806e-8ad8183be203';
    users.set(unauthorizedId, {
      id: unauthorizedId,
      activo: true,
      roles: { nombre: 'capturista' },
    });
    const token = await tokenFor(unauthorizedId);
    await request(app.getHttpServer())
      .post('/api/finanzas/contratos')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(403);

    const inactiveToken = await tokenFor(ids.inactiveAdvisor);
    await request(app.getHttpServer())
      .get('/api/finanzas/contratos')
      .set('Authorization', `Bearer ${inactiveToken}`)
      .expect(401);
  });

  it('lets an advisor create without asesor_id and assigns the authenticated UUID', async () => {
    const token = await tokenFor(ids.advisor);
    const response = await request(app.getHttpServer())
      .post('/api/finanzas/contratos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        cliente_id: ids.customer,
        servicio_id: 1,
        folio: 'ADVISOR-001',
        fecha_contrato: '2026-11-09',
        estado_contrato_id: 1,
      })
      .expect(201);

    expect(response.body.asesor_id).toBe(ids.advisor);
    expect(transaction.contratos.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ asesor_id: ids.advisor }),
      }),
    );
    expect(transaction.usuarios.findUnique).not.toHaveBeenCalled();
  });

  it('rejects advisor_id from an advisor and rejects unknown properties', async () => {
    const token = await tokenFor(ids.advisor);
    const body = {
      cliente_id: ids.customer,
      servicio_id: 1,
      asesor_id: ids.otherAdvisor,
      folio: 'ADVISOR-002',
      fecha_contrato: '2026-11-09',
      estado_contrato_id: 1,
    };
    await request(app.getHttpServer())
      .post('/api/finanzas/contratos')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(400);

    const { asesor_id: _advisorId, ...safeBody } = body;
    await request(app.getHttpServer())
      .post('/api/finanzas/contratos')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...safeBody, relation_id: ids.otherAdvisor })
      .expect(400);
    expect(transaction.contratos.create).not.toHaveBeenCalled();
  });

  it.each([
    ['administrador', ids.admin],
    ['administrador financiero', ids.financial],
  ])(
    '%s can register and explicitly assign a valid advisor',
    async (_role, userId) => {
      const token = await tokenFor(userId);
      const response = await request(app.getHttpServer())
        .post('/api/finanzas/contratos')
        .set('Authorization', `Bearer ${token}`)
        .send({
          cliente_id: ids.customer,
          servicio_id: 1,
          asesor_id: ids.otherAdvisor,
          folio: `ADMIN-${userId.slice(0, 4)}`,
          fecha_contrato: '2026-11-09',
          estado_contrato_id: 1,
        })
        .expect(201);
      expect(response.body.asesor_id).toBe(ids.otherAdvisor);
      expect(transaction.usuarios.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: ids.otherAdvisor } }),
      );
    },
  );

  it.each([
    ['missing', 'ffffffff-ffff-4fff-8fff-ffffffffffff'],
    ['inactive', ids.inactiveAdvisor],
    ['non-advisor', ids.admin],
  ])(
    'rejects an %s advisor assignment from administration',
    async (_case, advisorId) => {
      for (const userId of [ids.admin, ids.financial]) {
        const token = await tokenFor(userId);
        await request(app.getHttpServer())
          .post('/api/finanzas/contratos')
          .set('Authorization', `Bearer ${token}`)
          .send({
            cliente_id: ids.customer,
            servicio_id: 1,
            asesor_id: advisorId,
            folio: 'ADMIN-INVALID',
            fecha_contrato: '2026-11-09',
            estado_contrato_id: 1,
          })
          .expect(400);
      }
    },
  );

  it('requires an advisor selection for administrative registration', async () => {
    const token = await tokenFor(ids.admin);
    await request(app.getHttpServer())
      .post('/api/finanzas/contratos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        cliente_id: ids.customer,
        servicio_id: 1,
        folio: 'ADMIN-MISSING-ADVISOR',
        fecha_contrato: '2026-11-09',
        estado_contrato_id: 1,
      })
      .expect(400);
  });

  it('returns controlled errors for invalid customer, service, and state references', async () => {
    const token = await tokenFor(ids.advisor);
    const body = {
      cliente_id: ids.customer,
      servicio_id: 1,
      folio: 'INVALID-REFERENCE',
      fecha_contrato: '2026-11-09',
      estado_contrato_id: 1,
    };
    for (const invalidBody of [
      { ...body, cliente_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' },
      { ...body, servicio_id: 99 },
      { ...body, estado_contrato_id: 99 },
    ]) {
      await request(app.getHttpServer())
        .post('/api/finanzas/contratos')
        .set('Authorization', `Bearer ${token}`)
        .send(invalidBody)
        .expect(400);
    }
  });

  it('scopes advisor listing and hides other advisors contracts by ID', async () => {
    const token = await tokenFor(ids.advisor);
    const listing = await request(app.getHttpServer())
      .get(`/api/finanzas/contratos?asesor_id=${ids.otherAdvisor}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(listing.body.data.map((item: any) => item.asesor_id)).toEqual([
      ids.advisor,
    ]);
    expect(prisma.contratos.findMany.mock.calls[0][0].where.asesor_id).toBe(
      ids.advisor,
    );

    await request(app.getHttpServer())
      .get(`/api/finanzas/contratos/${ids.otherContract}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/finanzas/contratos/${ids.contract}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('lets an advisor update only their own observations', async () => {
    const token = await tokenFor(ids.advisor);
    await request(app.getHttpServer())
      .patch(`/api/finanzas/contratos/${ids.contract}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ observaciones: 'Actualizadas por asesor' })
      .expect(200);
    expect(contracts[0].observaciones).toBe('Actualizadas por asesor');
    expect(prisma.contratos.updateMany.mock.calls[0][0].where).toEqual({
      id: ids.contract,
      asesor_id: ids.advisor,
    });

    await request(app.getHttpServer())
      .patch(`/api/finanzas/contratos/${ids.otherContract}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ observaciones: 'No permitido' })
      .expect(404);
    expect(contracts[1].observaciones).toBeNull();
  });

  it('keeps administrative reads and observation updates available', async () => {
    const token = await tokenFor(ids.financial);
    await request(app.getHttpServer())
      .patch(`/api/finanzas/contratos/${ids.otherContract}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ observaciones: 'Revisión financiera' })
      .expect(200);
    expect(contracts[1].observaciones).toBe('Revisión financiera');
  });
});
