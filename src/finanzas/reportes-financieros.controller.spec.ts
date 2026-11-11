import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import { setupSwagger } from '../config/swagger.config';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { PrismaService } from '../database/prisma.service';
import { RolesGuard } from '../roles/guards/roles.guard';
import { ReportesFinancierosController } from './reportes-financieros.controller';
import { ReportesFinancierosService } from './reportes-financieros.service';

const secret = 'finanzas-reportes-test-secret-32chars';
const adminId = '75f88a9b-5680-4330-9fc8-474d6092ec1d';
const advisorId = '0ffac71e-e568-450c-8578-d4656a520047';

describe('ReportesFinancierosController integration (HTTP, JWT, roles and query DTO)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  const users = new Map([
    [adminId, { id: adminId, activo: true, roles: { nombre: 'administrador' } }],
    [advisorId, { id: advisorId, activo: true, roles: { nombre: 'asesor' } }],
  ]);
  const service = {
    ingresos: jest.fn().mockResolvedValue({ datos: [], resumen: { total: '0.00' } }),
    comisionesPorDestino: jest.fn(),
    comisionesPorTipoVenta: jest.fn(),
    pagosImss: jest.fn(),
    pagosPorMetodo: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret, signOptions: { expiresIn: '1h' } }),
      ],
      controllers: [ReportesFinancierosController],
      providers: [
        JwtAuthGuard,
        JwtStrategy,
        RolesGuard,
        { provide: ReportesFinancierosService, useValue: service },
        {
          provide: PrismaService,
          useValue: { usuarios: { findUnique: jest.fn(async ({ where }: any) => users.get(where.id) ?? null) } },
        },
        { provide: ConfigService, useValue: { getOrThrow: () => secret } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    setupSwagger(app);
    await app.init();
    jwt = app.get(JwtService);
  });

  afterAll(async () => app.close());

  it('requires JWT and denies advisor report access', async () => {
    await request(app.getHttpServer()).get('/api/finanzas/reportes/ingresos').expect(401);
    await request(app.getHttpServer())
      .get('/api/finanzas/reportes/ingresos?fecha_desde=2026-01-01&fecha_hasta=2026-01-31')
      .set('Authorization', `Bearer ${await jwt.signAsync({ sub: advisorId })}`)
      .expect(403);
  });

  it('validates report range query fields and serves an authorized report', async () => {
    const auth = `Bearer ${await jwt.signAsync({ sub: adminId })}`;
    await request(app.getHttpServer())
      .get('/api/finanzas/reportes/ingresos?fecha_desde=2026-01-01')
      .set('Authorization', auth)
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/finanzas/reportes/ingresos?fecha_desde=2026-01-01&fecha_hasta=2026-01-31&granularidad=semanal&comparar=true')
      .set('Authorization', auth)
      .expect(200);
    expect(service.ingresos).toHaveBeenCalledWith(
      expect.objectContaining({ fecha_desde: '2026-01-01', fecha_hasta: '2026-01-31', granularidad: 'semanal', comparar: true }),
      expect.objectContaining({ id: adminId }),
    );
  });

  it('publishes report routes in OpenAPI with Bearer JWT security', async () => {
    const document = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(document.body.paths['/api/finanzas/reportes/ingresos'].get.security).toContainEqual({ jwt: [] });
    expect(document.body.paths['/api/finanzas/reportes/imss'].get.security).toContainEqual({ jwt: [] });
  });
});
