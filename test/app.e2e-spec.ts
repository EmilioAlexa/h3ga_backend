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
    return request(app.getHttpServer())
      .get('/api/usuarios')
      .expect(401);
  });

  it('serves Swagger UI and a JSON document with the existing modules', async () => {
    await request(app.getHttpServer()).get('/api/docs').expect(200);

    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    const paths = Object.keys(response.body.paths as Record<string, unknown>);
    const findPath = (suffix: string) => paths.find((path) => path.endsWith(suffix));
    const loginPath = findPath('/auth/login');
    const currentUserPath = findPath('/auth/me');
    const clientsPath = findPath('/clientes');
    const usersPath = findPath('/usuarios');
    const rolesPath = findPath('/roles');
    const catalogDeletePath = findPath('/finanzas/catalogos/{catalogo}/{id}');

    expect(loginPath).toBeDefined();
    expect(currentUserPath).toBeDefined();
    expect(clientsPath).toBeDefined();
    expect(usersPath).toBeDefined();
    expect(rolesPath).toBeDefined();
    expect(catalogDeletePath).toBeDefined();
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
      response.body.components.schemas.UsuarioRespuestaDto.properties.password_hash,
    ).toBeUndefined();
    expect(
      response.body.paths[catalogDeletePath!].delete.responses['409'],
    ).toBeDefined();
  });

  afterEach(async () => {
    await app.close();
  });
});
