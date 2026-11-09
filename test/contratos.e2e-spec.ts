import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { setupSwagger } from '../src/config/swagger.config';
import { PrismaService } from '../src/database/prisma.service';

const ids = {
  admin: '75f88a9b-5680-4330-9fc8-474d6092ec1d',
  financial: '3918f25e-20d2-4ef8-8a2a-a3263991196c',
  advisor: '0ffac71e-e568-450c-8578-d4656a520047',
  otherAdvisor: 'db0cbb62-a8ef-4587-8c28-1f3aaf63b20a',
  customer: 'e96a633b-2a1e-43c4-a870-ea67de1fb4cd',
  contract: 'caf2c963-4531-4998-80d8-655cb904d192',
  otherContract: '58f338c7-e50a-417f-8681-44c74f3a215b',
};

describe('Contratos API (e2e)', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  let contracts: Record<string, any>[];
  let prisma: Record<string, any>;

  const userRecords = new Map([
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
  ]);

  const contractRecord = (data: Record<string, any>, id: string) => ({
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
  });

  async function tokenFor(userId: string) {
    return jwt.signAsync({ sub: userId });
  }

  beforeEach(async () => {
    contracts = [
      contractRecord(
        {
          cliente_id: ids.customer,
          servicio_id: 1,
          asesor_id: ids.advisor,
          folio: 'E2E-OWN',
          fecha_contrato: new Date('2026-11-09T00:00:00.000Z'),
          estado_contrato_id: 1,
          cantidad_pagos: null,
          observaciones: null,
        },
        ids.contract,
      ),
      contractRecord(
        {
          cliente_id: ids.customer,
          servicio_id: 1,
          asesor_id: ids.otherAdvisor,
          folio: 'E2E-OTHER',
          fecha_contrato: new Date('2026-11-09T00:00:00.000Z'),
          estado_contrato_id: 1,
          cantidad_pagos: null,
          observaciones: null,
        },
        ids.otherContract,
      ),
    ];

    const transaction = {
      clientes: {
        findUnique: jest.fn(async ({ where }: any) =>
          where.id === ids.customer ? { id: ids.customer } : null,
        ),
      },
      servicios: {
        findUnique: jest.fn(async ({ where }: any) =>
          where.id === 1 && where.activo ? { id: 1 } : null,
        ),
      },
      estados_contratos: {
        findUnique: jest.fn(async ({ where }: any) =>
          where.id === 1 ? { id: 1 } : null,
        ),
      },
      usuarios: {
        findUnique: jest.fn(
          async ({ where }: any) => userRecords.get(where.id) ?? null,
        ),
      },
      contratos: {
        create: jest.fn(async ({ data }: any) => {
          const created = contractRecord(
            data,
            '43cc15f3-2d6e-4dca-8934-240b8a3018f4',
          );
          contracts.push(created);
          return created;
        }),
      },
    };
    prisma = {
      usuarios: {
        findUnique: jest.fn(
          async ({ where }: any) => userRecords.get(where.id) ?? null,
        ),
      },
      $transaction: jest.fn(async (callback: (tx: any) => unknown) =>
        callback(transaction),
      ),
      contratos: {
        findMany: jest.fn(async ({ where, skip, take }: any) =>
          contracts
            .filter((record) =>
              Object.entries(where).every(
                ([key, value]) => record[key] === value,
              ),
            )
            .slice(skip, skip + take),
        ),
        count: jest.fn(
          async ({ where }: any) =>
            contracts.filter((record) =>
              Object.entries(where).every(
                ([key, value]) => record[key] === value,
              ),
            ).length,
        ),
        findFirst: jest.fn(
          async ({ where }: any) =>
            contracts.find((record) =>
              Object.entries(where).every(
                ([key, value]) => record[key] === value,
              ),
            ) ?? null,
        ),
        updateMany: jest.fn(async ({ where, data }: any) => {
          const record = contracts.find((item) =>
            Object.entries(where).every(([key, value]) => item[key] === value),
          );
          if (!record) return { count: 0 };
          Object.assign(record, data);
          return { count: 1 };
        }),
      },
    };

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    setupSwagger(app);
    await app.init();
    jwt = app.get(JwtService);
  });

  afterEach(async () => app.close());

  it('assigns advisor-created contracts to the authenticated user', async () => {
    const token = await tokenFor(ids.advisor);
    const response = await request(app.getHttpServer())
      .post('/api/finanzas/contratos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        cliente_id: ids.customer,
        servicio_id: 1,
        folio: 'E2E-ADVISOR-CREATE',
        fecha_contrato: '2026-11-09',
        estado_contrato_id: 1,
      })
      .expect(201);

    expect(response.body.asesor_id).toBe(ids.advisor);
  });

  it('lets administrators select an advisor and requires that assignment', async () => {
    const token = await tokenFor(ids.financial);
    const response = await request(app.getHttpServer())
      .post('/api/finanzas/contratos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        cliente_id: ids.customer,
        servicio_id: 1,
        asesor_id: ids.otherAdvisor,
        folio: 'E2E-ADMIN-CREATE',
        fecha_contrato: '2026-11-09',
        estado_contrato_id: 1,
      })
      .expect(201);
    expect(response.body.asesor_id).toBe(ids.otherAdvisor);

    await request(app.getHttpServer())
      .post('/api/finanzas/contratos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        cliente_id: ids.customer,
        servicio_id: 1,
        folio: 'E2E-ADMIN-NO-ADVISOR',
        fecha_contrato: '2026-11-09',
        estado_contrato_id: 1,
      })
      .expect(400);
  });

  it('rejects advisor impersonation and hides foreign contracts from GET and PATCH', async () => {
    const token = await tokenFor(ids.advisor);
    await request(app.getHttpServer())
      .post('/api/finanzas/contratos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        cliente_id: ids.customer,
        servicio_id: 1,
        asesor_id: ids.otherAdvisor,
        folio: 'E2E-IMPERSONATION',
        fecha_contrato: '2026-11-09',
        estado_contrato_id: 1,
      })
      .expect(400);

    await request(app.getHttpServer())
      .get(`/api/finanzas/contratos/${ids.otherContract}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/finanzas/contratos/${ids.otherContract}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ observaciones: 'No permitido' })
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/finanzas/contratos/${ids.contract}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ observaciones: 'Actualización propia' })
      .expect(200);
  });
});
