import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { PrismaService } from '../database/prisma.service';
import { UsuariosController } from './usuarios.controller';
import { UsuariosService } from './usuarios.service';

const jwtSecret = 'test-only-secret-with-at-least-32-characters';
const administradorId = 'b7598e4a-9925-4e40-9e81-581aee42a906';
const asesorId = 'a5dff4e6-f959-4c29-8516-b90aee13d0ea';
const inactivoId = '11e48479-d856-46ec-b4b5-eedcb8970190';

const usuarioSeguro = {
  id: administradorId,
  rol_id: 1,
  nombre: 'Ana',
  apellido_paterno: 'Prueba',
  apellido_materno: null,
  correo_electronico: 'ana@example.test',
  activo: true,
  fecha_creacion: new Date('2026-01-01T00:00:00.000Z'),
  roles: { id: 1, nombre: 'administrador', descripcion: null },
};

describe('UsuariosController (JWT and roles)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let usuariosService: {
    findAll: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    changeRole: jest.Mock;
    changeStatus: jest.Mock;
  };
  let findUserById: jest.Mock;

  async function tokenFor(sub: string): Promise<string> {
    return jwtService.signAsync({ sub });
  }

  beforeAll(async () => {
    usuariosService = {
      findAll: jest.fn().mockResolvedValue([usuarioSeguro]),
      findOne: jest.fn().mockResolvedValue(usuarioSeguro),
      create: jest.fn().mockResolvedValue(usuarioSeguro),
      update: jest.fn().mockResolvedValue(usuarioSeguro),
      changeRole: jest.fn().mockResolvedValue(usuarioSeguro),
      changeStatus: jest.fn().mockResolvedValue(usuarioSeguro),
    };

    const users = new Map([
      [administradorId, { ...usuarioSeguro }],
      [
        asesorId,
        {
          ...usuarioSeguro,
          id: asesorId,
          rol_id: 3,
          roles: { id: 3, nombre: 'asesor', descripcion: null },
        },
      ],
      [inactivoId, { ...usuarioSeguro, id: inactivoId, activo: false }],
    ]);
    findUserById = jest.fn(async ({ where }: { where: { id: string } }) =>
      users.get(where.id) ?? null,
    );

    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: jwtSecret, signOptions: { expiresIn: '1h' } }),
      ],
      controllers: [UsuariosController],
      providers: [
        JwtAuthGuard,
        JwtStrategy,
        { provide: UsuariosService, useValue: usuariosService },
        {
          provide: PrismaService,
          useValue: { usuarios: { findUnique: findUserById } },
        },
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => jwtSecret },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    jwtService = app.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    usuariosService.findAll.mockResolvedValue([usuarioSeguro]);
    usuariosService.create.mockResolvedValue(usuarioSeguro);
  });

  it('rejects requests without a JWT with 401', async () => {
    await request(app.getHttpServer()).get('/usuarios').expect(401);
  });

  it('allows an active administrator and never returns password_hash', async () => {
    const token = await tokenFor(administradorId);

    const response = await request(app.getHttpServer())
      .get('/usuarios')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body[0]).not.toHaveProperty('password_hash');
    expect(findUserById).toHaveBeenCalled();
    expect(usuariosService.findAll).toHaveBeenCalled();
  });

  it('rejects an authenticated asesor with 403', async () => {
    const token = await tokenFor(asesorId);

    await request(app.getHttpServer())
      .get('/usuarios')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    expect(usuariosService.findAll).not.toHaveBeenCalled();
  });

  it('rejects a valid JWT for a deactivated user with 401', async () => {
    const token = await tokenFor(inactivoId);

    await request(app.getHttpServer())
      .get('/usuarios')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);

    expect(usuariosService.findAll).not.toHaveBeenCalled();
  });

  it('rejects unsupported or sensitive fields in create requests', async () => {
    const token = await tokenFor(administradorId);

    await request(app.getHttpServer())
      .post('/usuarios')
      .set('Authorization', `Bearer ${token}`)
      .send({
        rol_id: 1,
        nombre: 'Ana',
        apellido_paterno: 'Prueba',
        correo_electronico: 'ana@example.test',
        contrasena: 'PruebaSegura123!',
        password_hash: 'no-permitido',
      })
      .expect(400);

    expect(usuariosService.create).not.toHaveBeenCalled();
  });
});
