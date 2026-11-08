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
import { CatalogosController } from './catalogos.controller';
import { CatalogosService } from './catalogos.service';

const jwtSecret = 'finanzas-catalogos-test-secret-32-chars';
const adminId = '75f88a9b-5680-4330-9fc8-474d6092ec1d';
const financialAdminId = '3918f25e-20d2-4ef8-8a2a-a3263991196c';
const advisorId = '0ffac71e-e568-450c-8578-d4656a520047';

type User = { id: string; activo: boolean; roles: { nombre: string } };
type ServiceRecord = {
  id: number;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
};

describe('CatalogosController DELETE (JWT, roles and referential integrity)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let services: ServiceRecord[];
  let users: Map<string, User>;
  let paymentScheduleReferences: number;
  let paymentStateHistoryReferences: number;
  let prisma: Record<string, any>;
  let transaction: Record<string, any>;

  async function tokenFor(userId: string) {
    return jwt.signAsync({ sub: userId });
  }

  beforeAll(async () => {
    users = new Map([
      [adminId, { id: adminId, activo: true, roles: { nombre: 'administrador' } }],
      [
        financialAdminId,
        {
          id: financialAdminId,
          activo: true,
          roles: { nombre: 'administrador financiero' },
        },
      ],
      [advisorId, { id: advisorId, activo: true, roles: { nombre: 'asesor' } }],
    ]);
    services = [{ id: 1, nombre: 'Servicio de prueba', descripcion: null, activo: true }];
    paymentScheduleReferences = 0;
    paymentStateHistoryReferences = 0;

    transaction = {
      servicios: {
        findUnique: jest.fn(async ({ where }: { where: { id: number } }) =>
          services.find((record) => record.id === where.id) ?? null,
        ),
        update: jest.fn(
          async ({ where, data }: { where: { id: number }; data: Partial<ServiceRecord> }) => {
            const record = services.find((item) => item.id === where.id);
            if (!record) throw new Error('missing service');
            Object.assign(record, data);
            return { id: record.id, activo: record.activo };
          },
        ),
      },
      estados_pago_programado: {
        findUnique: jest.fn(async ({ where }: { where: { id: number } }) =>
          where.id === 2 ? { id: 2 } : null,
        ),
        delete: jest.fn(async ({ where }: { where: { id: number } }) => ({ id: where.id })),
      },
      pagos_programados: {
        count: jest.fn(async () => paymentScheduleReferences),
      },
      estados_pago: {
        findUnique: jest.fn(async ({ where }: { where: { id: number } }) =>
          where.id === 3 ? { id: 3 } : null,
        ),
        delete: jest.fn(async ({ where }: { where: { id: number } }) => ({ id: where.id })),
      },
      pagos: { count: jest.fn(async () => 0) },
      historial_estados_pago: {
        count: jest.fn(async ({ where }: { where: Record<string, number> }) =>
          where.estado_nuevo_id === 3 ? paymentStateHistoryReferences : 0,
        ),
      },
    };

    prisma = {
      usuarios: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
          users.get(where.id) ?? null,
        ),
      },
      $transaction: jest.fn(async (callback: (transaction: Record<string, any>) => unknown) =>
        callback(transaction as any),
      ),
      servicios: {
        findMany: jest.fn(async (args: { where: { activo?: boolean }; skip: number; take: number }) =>
          services
            .filter((record) => args.where.activo === undefined || record.activo === args.where.activo)
            .slice(args.skip, args.skip + args.take),
        ),
        count: jest.fn(async (args: { where: { activo?: boolean } }) =>
          services.filter(
            (record) => args.where.activo === undefined || record.activo === args.where.activo,
          ).length,
        ),
      },
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: jwtSecret, signOptions: { expiresIn: '1h' } }),
      ],
      controllers: [CatalogosController],
      providers: [
        CatalogosService,
        JwtAuthGuard,
        JwtStrategy,
        RolesGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { getOrThrow: () => jwtSecret } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    jwt = app.get(JwtService);
  });

  beforeEach(() => {
    services = [{ id: 1, nombre: 'Servicio de prueba', descripcion: null, activo: true }];
    paymentScheduleReferences = 0;
    paymentStateHistoryReferences = 0;
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires authentication for DELETE', async () => {
    await request(app.getHttpServer())
      .delete('/api/finanzas/catalogos/servicios/1')
      .expect(401);
  });

  it('forbids advisors from deleting or deactivating catalogs', async () => {
    const token = await tokenFor(advisorId);
    await request(app.getHttpServer())
      .delete('/api/finanzas/catalogos/servicios/1')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('deactivates a catalog with activo and hides it from operational lists', async () => {
    const token = await tokenFor(financialAdminId);
    const deleted = await request(app.getHttpServer())
      .delete('/api/finanzas/catalogos/servicios/1')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(deleted.body).toMatchObject({
      catalogo: 'servicios',
      id: 1,
      accion: 'desactivado',
      activo: false,
    });

    const list = await request(app.getHttpServer())
      .get('/api/finanzas/catalogos/servicios')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.data).toHaveLength(0);
  });

  it('physically deletes an unreferenced status catalog row', async () => {
    const token = await tokenFor(adminId);
    const response = await request(app.getHttpServer())
      .delete('/api/finanzas/catalogos/estados-pago-programado/2')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toMatchObject({
      catalogo: 'estados-pago-programado',
      id: 2,
      accion: 'eliminado_fisicamente',
    });
  });

  it('returns 409 and preserves a status referenced by scheduled payments', async () => {
    paymentScheduleReferences = 2;
    const token = await tokenFor(adminId);

    await request(app.getHttpServer())
      .delete('/api/finanzas/catalogos/estados-pago-programado/2')
      .set('Authorization', `Bearer ${token}`)
      .expect(409);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.estados_pago_programado.delete).not.toHaveBeenCalled();
  });

  it('preserves a payment state referenced by payment history', async () => {
    paymentStateHistoryReferences = 1;
    const token = await tokenFor(financialAdminId);

    await request(app.getHttpServer())
      .delete('/api/finanzas/catalogos/estados-pago/3')
      .set('Authorization', `Bearer ${token}`)
      .expect(409);

    expect(transaction.estados_pago.delete).not.toHaveBeenCalled();
    expect(transaction.historial_estados_pago.count).toHaveBeenCalledTimes(2);
  });

  it('returns 404 for a missing record or an unsupported catalog', async () => {
    const token = await tokenFor(adminId);

    await request(app.getHttpServer())
      .delete('/api/finanzas/catalogos/servicios/99')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    await request(app.getHttpServer())
      .delete('/api/finanzas/catalogos/no-existe/1')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
