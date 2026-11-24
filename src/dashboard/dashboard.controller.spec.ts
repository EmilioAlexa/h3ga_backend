import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { PrismaService } from '../database/prisma.service';
import { RolesGuard } from '../roles/guards/roles.guard';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

const id = '11111111-1111-4111-8111-111111111111';
const secret = 'dashboard-test-secret';
describe('GET /api/dashboard', () => {
  let app: INestApplication;
  let jwt: JwtService;
  const dashboard = { obtener: jest.fn().mockResolvedValue({ fecha: '2026-11-24' }) };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PassportModule, JwtModule.register({ secret })], controllers: [DashboardController],
      providers: [JwtStrategy, RolesGuard,
        { provide: ConfigService, useValue: { getOrThrow: () => secret } },
        { provide: PrismaService, useValue: { usuarios: { findUnique: jest.fn(async ({ where }: { where: { id: string } }) => ({ id, activo: true, roles: { nombre: where.id } })) } } },
        { provide: DashboardService, useValue: dashboard }],
    }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    jwt = module.get(JwtService); await app.init();
  });
  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => app.close());
  const token = (role: string) => jwt.sign({ sub: role });
  it('requiere JWT', async () => { await request(app.getHttpServer()).get('/api/dashboard').expect(401); });
  it.each(['administrador', 'asesor', 'auxiliar administrativo'])('admite %s y usa 8 por omisión', async (role) => {
    await request(app.getHttpServer()).get('/api/dashboard').auth(token(role), { type: 'bearer' }).expect(200);
    expect(dashboard.obtener).toHaveBeenCalledWith(expect.objectContaining({ roles: { nombre: role } }), 8);
  });
  it.each(['administrador financiero', 'desconocido'])('rechaza %s', async (role) => {
    await request(app.getHttpServer()).get('/api/dashboard').auth(token(role), { type: 'bearer' }).expect(403);
    expect(dashboard.obtener).not.toHaveBeenCalled();
  });
  it.each(['0', '51', '1.5', 'abc'])('rechaza limite=%s', async (limite) => {
    await request(app.getHttpServer()).get(`/api/dashboard?limite=${limite}`).auth(token('asesor'), { type: 'bearer' }).expect(400);
    expect(dashboard.obtener).not.toHaveBeenCalled();
  });
  it('acepta limite=50', async () => {
    await request(app.getHttpServer()).get('/api/dashboard?limite=50').auth(token('asesor'), { type: 'bearer' }).expect(200);
    expect(dashboard.obtener).toHaveBeenCalledWith(expect.anything(), 50);
  });
});
