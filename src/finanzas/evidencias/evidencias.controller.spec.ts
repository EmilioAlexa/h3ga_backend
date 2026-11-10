import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MulterModule } from '@nestjs/platform-express';
import { Readable } from 'node:stream';
import request from 'supertest';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../roles/guards/roles.guard';
import { EvidenciasController } from './evidencias.controller';
import { EvidenciasService } from './evidencias.service';

describe('EvidenciasController HTTP upload boundary', () => {
  let app: INestApplication;
  const evidenceId = '9e13265b-977c-4e2b-b594-dc0e56d58f70';
  let user = {
    id: '75f88a9b-5680-4330-9fc8-474d6092ec1d',
    activo: true,
    roles: { nombre: 'administrador' },
  };
  const service = {
    upload: jest.fn().mockResolvedValue({ id: 'evidence-id' }),
    findForPayment: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue({ id: 'evidence-id' }),
    download: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [
        MulterModule.register({
          limits: { fileSize: 100, files: 1, fields: 0, parts: 1 },
        }),
      ],
      controllers: [EvidenciasController],
      providers: [RolesGuard, { provide: EvidenciasService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: Parameters<JwtAuthGuard['canActivate']>[0]) => {
          const req = context.switchToHttp().getRequest();
          if (!req.headers.authorization) throw new UnauthorizedException();
          req.user = user;
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires authentication and serves evidence metadata', async () => {
    await request(app.getHttpServer())
      .get(`/api/finanzas/evidencias/${evidenceId}`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/api/finanzas/evidencias/${evidenceId}`)
      .set('Authorization', 'Bearer test')
      .expect(200);
    expect(service.findOne).toHaveBeenCalledWith(evidenceId, user);
  });

  it('accepts one multipart file in the documented file field', async () => {
    const buffer = Buffer.from('%PDF-1.7 fixture');
    await request(app.getHttpServer())
      .post('/api/finanzas/pagos/39987e79-6ff9-40c7-b069-6aeb3d122cd8/evidencias')
      .set('Authorization', 'Bearer test')
      .attach('file', buffer, { filename: 'receipt.pdf', contentType: 'application/pdf' })
      .expect(201);

    expect(service.upload).toHaveBeenCalledWith(
      '39987e79-6ff9-40c7-b069-6aeb3d122cd8',
      expect.objectContaining({ originalname: 'receipt.pdf', buffer }),
      user,
    );
  });

  it('enforces the configured Multer size limit before the service', async () => {
    await request(app.getHttpServer())
      .post('/api/finanzas/pagos/39987e79-6ff9-40c7-b069-6aeb3d122cd8/evidencias')
      .set('Authorization', 'Bearer test')
      .attach('file', Buffer.alloc(101, 1), { filename: 'large.jpg', contentType: 'image/jpeg' })
      .expect(413);
    expect(service.upload).not.toHaveBeenCalled();
  });

  it('streams an authorized download with private attachment headers', async () => {
    service.download.mockResolvedValue({
      metadata: { nombre_original: 'receipt.pdf', tipo_archivo: 'application/pdf' },
      object: { stream: Readable.from([Buffer.from('%PDF-')]), size: 5 },
    });
    const response = await request(app.getHttpServer())
      .get(`/api/finanzas/evidencias/${evidenceId}/descargar`)
      .set('Authorization', 'Bearer test')
      .expect(200);

    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-disposition']).toContain('receipt.pdf');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('rejects a role outside the financial authorization matrix', async () => {
    user = { ...user, roles: { nombre: 'auxiliar' } };
    await request(app.getHttpServer())
      .get(`/api/finanzas/evidencias/${evidenceId}`)
      .set('Authorization', 'Bearer test')
      .expect(403);
    user = { ...user, roles: { nombre: 'administrador' } };
  });
});
