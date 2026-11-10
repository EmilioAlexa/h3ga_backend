import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { setupSwagger } from './../src/config/swagger.config';

describe('Application authentication (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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
  });

  it('/api/usuarios (GET) requires authentication', () => {
    return request(app.getHttpServer()).get('/api/usuarios').expect(401);
  });

  it('serves Swagger UI and a JSON document with the existing modules', async () => {
    await request(app.getHttpServer()).get('/api/docs').expect(200);

    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    const paths = Object.keys(response.body.paths as Record<string, unknown>);
    const findPath = (suffix: string) =>
      paths.find((path) => path.endsWith(suffix));
    const loginPath = findPath('/auth/login');
    const currentUserPath = findPath('/auth/me');
    const clientsPath = findPath('/clientes');
    const usersPath = findPath('/usuarios');
    const rolesPath = findPath('/roles');
    const catalogDeletePath = findPath('/finanzas/catalogos/{catalogo}/{id}');
    const contractsPath = findPath('/finanzas/contratos');
    const contractDetailPath = findPath('/finanzas/contratos/{id}');
    const paymentsPath = findPath('/finanzas/pagos');
    const paymentDetailPath = findPath('/finanzas/pagos/{id}');
    const paymentHistoryPath = findPath('/finanzas/pagos/{id}/historial');
    const paymentStatePath = findPath('/finanzas/pagos/{id}/estado');
    const evidenceUploadPath = findPath('/finanzas/pagos/{pagoId}/evidencias');
    const evidenceDetailPath = findPath('/finanzas/evidencias/{evidenciaId}');
    const evidenceDownloadPath = findPath('/finanzas/evidencias/{evidenciaId}/descargar');

    expect(loginPath).toBeDefined();
    expect(currentUserPath).toBeDefined();
    expect(clientsPath).toBeDefined();
    expect(usersPath).toBeDefined();
    expect(rolesPath).toBeDefined();
    expect(catalogDeletePath).toBeDefined();
    expect(contractsPath).toBeDefined();
    expect(contractDetailPath).toBeDefined();
    expect(paymentsPath).toBeDefined();
    expect(paymentDetailPath).toBeDefined();
    expect(paymentHistoryPath).toBeDefined();
    expect(paymentStatePath).toBeDefined();
    expect(evidenceUploadPath).toBeDefined();
    expect(evidenceDetailPath).toBeDefined();
    expect(evidenceDownloadPath).toBeDefined();
    expect(response.body.components.securitySchemes.jwt).toMatchObject({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });
    expect(response.body.paths[loginPath!].post.security).toBeUndefined();
    expect(response.body.paths[currentUserPath!].get.security).toEqual([
      { jwt: [] },
    ]);
    expect(response.body.paths[usersPath!].get.tags).toContain('Usuarios');
    expect(response.body.paths[rolesPath!].get.tags).toContain('Roles');
    expect(
      response.body.components.schemas.LoginDto.properties.contrasena.writeOnly,
    ).toBe(true);
    expect(
      response.body.components.schemas.UsuarioRespuestaDto.properties
        .password_hash,
    ).toBeUndefined();
    expect(
      response.body.paths[catalogDeletePath!].delete.responses['409'],
    ).toBeDefined();
    expect(response.body.paths[contractsPath!].post).toBeDefined();
    expect(
      response.body.paths[contractsPath!].post.responses['403'],
    ).toBeDefined();
    expect(
      response.body.paths[contractDetailPath!].patch.responses['404'],
    ).toBeDefined();
    expect(
      response.body.components.schemas.CreateContratoDto.properties.asesor_id,
    ).toMatchObject({
      format: 'uuid',
      description: expect.stringContaining(
        'se asignan automáticamente desde el JWT',
      ),
    });
    expect(
      response.body.paths[paymentsPath!].post.responses['201'],
    ).toBeDefined();
    expect(
      response.body.paths[paymentDetailPath!].get.responses['200'],
    ).toBeDefined();
    expect(
      response.body.paths[paymentHistoryPath!].get.responses['200'],
    ).toBeDefined();
    expect(
      response.body.paths[paymentStatePath!].patch.responses['403'],
    ).toBeDefined();
    expect(
      response.body.components.schemas.CreatePagoDto.properties.monto,
    ).toMatchObject({ type: 'string' });
    expect(response.body.paths[evidenceUploadPath!].post.requestBody.content['multipart/form-data']).toBeDefined();
    expect(response.body.paths[evidenceDetailPath!].get.responses['200']).toBeDefined();
    expect(response.body.paths[evidenceDownloadPath!].get.responses['200'].content['application/pdf']).toBeDefined();
  });

  it('/api/finanzas/evidencias/:id requires authentication', () => {
    return request(app.getHttpServer())
      .get('/api/finanzas/evidencias/39987e79-6ff9-40c7-b069-6aeb3d122cd8')
      .expect(401);
  });

  afterEach(async () => {
    await app.close();
  });
});
