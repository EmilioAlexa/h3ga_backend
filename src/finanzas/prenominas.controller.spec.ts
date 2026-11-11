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
import { PrenominasController } from './prenominas.controller';
import { PrenominasService } from './prenominas.service';

const secret = 'finanzas-prenomina-test-secret-32-chars';
const ids = {
  admin: '75f88a9b-5680-4330-9fc8-474d6092ec1d',
  advisor: '0ffac71e-e568-450c-8578-d4656a520047',
  cut: 'caf2c963-4531-4998-80d8-655cb904d192',
};

describe('PrenominasController integration (HTTP, JWT, roles and DTO)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  const users = new Map([
    [ids.admin, { id: ids.admin, activo: true, roles: { nombre: 'administrador' } }],
    [ids.advisor, { id: ids.advisor, activo: true, roles: { nombre: 'asesor' } }],
  ]);
  const service = {
    findAll: jest.fn().mockResolvedValue({ data: [], page: 1, limit: 20, total: 0 }),
    preview: jest.fn().mockResolvedValue({ comisiones_elegibles: 0 }),
    generate: jest.fn().mockResolvedValue({ id: 'generated-prenomina' }),
    findOne: jest.fn().mockResolvedValue({ id: 'existing-prenomina' }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret, signOptions: { expiresIn: '1h' } }),
      ],
      controllers: [PrenominasController],
      providers: [
        JwtAuthGuard,
        JwtStrategy,
        RolesGuard,
        { provide: PrenominasService, useValue: service },
        {
          provide: PrismaService,
          useValue: {
            usuarios: {
              findUnique: jest.fn(async ({ where }: any) => users.get(where.id) ?? null),
            },
          },
        },
        { provide: ConfigService, useValue: { getOrThrow: () => secret } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    jwt = app.get(JwtService);
  });

  afterAll(async () => app.close());

  it('requires JWT and denies advisor access', async () => {
    await request(app.getHttpServer()).get('/api/finanzas/prenominas').expect(401);
    await request(app.getHttpServer())
      .get('/api/finanzas/prenominas')
      .set('Authorization', `Bearer ${await jwt.signAsync({ sub: ids.advisor })}`)
      .expect(403);
  });

  it('routes authorized preview and generation requests and validates the selected existing state ID shape', async () => {
    const auth = `Bearer ${await jwt.signAsync({ sub: ids.admin })}`;
    await request(app.getHttpServer())
      .get(`/api/finanzas/cortes/${ids.cut}/prenomina/preparacion`)
      .set('Authorization', auth)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/finanzas/cortes/${ids.cut}/prenomina/generar`)
      .set('Authorization', auth)
      .send({})
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/finanzas/cortes/${ids.cut}/prenomina/generar`)
      .set('Authorization', auth)
      .send({ estado_id: 8, observaciones: 'Preparación de referencia' })
      .expect(201);
    expect(service.preview).toHaveBeenCalledWith(ids.cut, expect.objectContaining({ id: ids.admin }));
    expect(service.generate).toHaveBeenCalledWith(
      ids.cut,
      { estado_id: 8, observaciones: 'Preparación de referencia' },
      expect.objectContaining({ id: ids.admin }),
    );
  });
});
