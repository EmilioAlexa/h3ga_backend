import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';
import request from 'supertest';
import { JwtStrategy } from '../../auth/strategies/jwt.strategy';
import { PrismaService } from '../../database/prisma.service';
import { RolesGuard } from '../../roles/guards/roles.guard';
import { FormatosInstitucionalesController } from './formatos-institucionales.controller';
import { FormatosInstitucionalesService } from './formatos-institucionales.service';
const secret = 'formatos-test-secret';
describe('API formatos', () => {
  let app: INestApplication; let jwt: JwtService;
  const service = { cargar: jest.fn().mockResolvedValue({ id: 1 }), findAll: jest.fn().mockResolvedValue([]), descargar: jest.fn().mockImplementation(() => ({ file: { stream: Readable.from('pdf') }, filename: 'formato-1.pdf', contentType: 'application/pdf' })) };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [PassportModule, JwtModule.register({ secret })], controllers: [FormatosInstitucionalesController], providers: [JwtStrategy, RolesGuard,
      { provide: ConfigService, useValue: { getOrThrow: () => secret } },
      { provide: PrismaService, useValue: { usuarios: { findUnique: jest.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id, activo: true, roles: { nombre: where.id } })) } } },
      { provide: FormatosInstitucionalesService, useValue: service }] }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); jwt = module.get(JwtService); await app.init();
  });
  afterAll(async () => app.close());
  const token = (role: string) => jwt.sign({ sub: role });
  const upload = (role?: string) => { const req = request(app.getHttpServer()).post('/api/gestion/formatos/archivo'); return role ? req.auth(token(role), { type: 'bearer' }) : req; };
  it('requiere JWT', async () => { await upload().expect(401); });
  it.each(['asesor', 'auxiliar administrativo'])('rechaza creación para %s', async role => { await upload(role).expect(403); });
  it('acepta administrador y transforma multipart', async () => {
    await upload('administrador').field('nombre', 'Prueba').field('dependencia_id', '1').field('tipo_formato', 'pdf').attach('archivo', Buffer.from('archivo'), 'a.pdf').expect(201);
    expect(service.cargar).toHaveBeenCalledWith(expect.objectContaining({ dependencia_id: 1 }), expect.objectContaining({ originalname: 'a.pdf' }), 'administrador');
  });
  it('rechaza campos faltantes y clave proporcionada por cliente', async () => {
    await upload('administrador').field('nombre', 'Prueba').expect(400);
    await upload('administrador').field('nombre', 'Prueba').field('dependencia_id', '1').field('tipo_formato', 'pdf').field('archivo_path', 'ruta').expect(400);
  });
  it.each(['administrador', 'asesor', 'auxiliar administrativo'])('permite lectura y descarga a %s', async role => {
    await request(app.getHttpServer()).get('/api/gestion/formatos').auth(token(role), { type: 'bearer' }).expect(200);
    await request(app.getHttpServer()).get('/api/gestion/formatos/1/descargar').auth(token(role), { type: 'bearer' }).expect('Content-Type', /application\/pdf/).expect(200);
  });
});
