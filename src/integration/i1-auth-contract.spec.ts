import { UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { MailService } from '../auth/mail.service';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { PrismaService } from '../database/prisma.service';
import { QueryClientesDto } from '../clientes/dto/query-clientes.dto';
import {
  ContratoRespuestaDto,
  PagoContratoRespuestaDto,
  PagoRelacionadoRespuestaDto,
  PagoRespuestaDto,
} from '../openapi/response-models.dto';

const userId = '75f88a9b-5680-4330-9fc8-474d6092ec1d';

describe('I1: contrato de sesión sin PostgreSQL ni SMTP', () => {
  it('confirma el código HTTP real de los POST de autenticación', async () => {
    const authMock = {
      login: jest
        .fn()
        .mockResolvedValue({ access_token: 'token-de-prueba', usuario: {} }),
      forgotPassword: jest
        .fn()
        .mockResolvedValue({ message: 'Solicitud procesada' }),
      resetPassword: jest
        .fn()
        .mockResolvedValue({ message: 'Contraseña actualizada' }),
    };
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authMock }],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    try {
      const openapi = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle('I1').setVersion('1').build(),
      );
      for (const route of ['login', 'forgot-password', 'reset-password']) {
        const responses = openapi.paths[`/api/auth/${route}`]?.post?.responses;
        expect(responses?.['201']).toBeDefined();
        expect(responses?.['200']).toBeUndefined();
      }
      for (const route of ['forgot-password', 'reset-password']) {
        expect(
          openapi.paths[`/api/auth/${route}`]?.post?.responses?.['429'],
        ).toBeDefined();
      }
      const schemaDocument = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle('I1 DTO').setVersion('1').build(),
        {
          extraModels: [
            QueryClientesDto,
            ContratoRespuestaDto,
            PagoContratoRespuestaDto,
            PagoRelacionadoRespuestaDto,
            PagoRespuestaDto,
          ],
        },
      );
      const schemas = schemaDocument.components?.schemas as Record<
        string,
        { properties?: Record<string, any> }
      >;
      expect(schemas.QueryClientesDto.properties?.q).toMatchObject({
        type: 'string',
        maxLength: 100,
      });
      expect(schemas.QueryClientesDto.properties?.limit).toMatchObject({
        type: 'number',
        maximum: 100,
      });
      expect(
        schemas.ContratoRespuestaDto.properties?.fecha_contrato,
      ).toMatchObject({ format: 'date-time' });
      expect(schemas.PagoRespuestaDto.properties?.monto).toMatchObject({
        type: 'string',
      });
      expect(schemas.PagoRespuestaDto.properties?.fecha_pago).toMatchObject({
        nullable: true,
      });
      expect(schemas.PagoContratoRespuestaDto.properties).toHaveProperty(
        'servicios',
      );
      expect(schemas.PagoContratoRespuestaDto.properties).toHaveProperty(
        'usuarios',
      );
      expect(schemas.PagoRelacionadoRespuestaDto.properties?.id).toMatchObject({
        type: 'number',
      });
      const server = app.getHttpServer();
      await request(server)
        .post('/api/auth/login')
        .send({
          correo_electronico: 'ana@example.test',
          contrasena: 'Clave1234',
        })
        .expect(201);
      await request(server)
        .post('/api/auth/forgot-password')
        .send({ correo_electronico: 'ana@example.test' })
        .expect(201);
      await request(server)
        .post('/api/auth/reset-password')
        .send({
          correo_electronico: 'ana@example.test',
          codigo: '123456',
          nueva_contrasena: 'NuevaClave123',
        })
        .expect(201);
    } finally {
      await app.close();
    }
  });

  it('login devuelve access_token y perfil sin hash; /me obtiene el rol vigente', async () => {
    const password_hash = await bcrypt.hash('Clave1234', 4);
    const usuario = {
      id: userId,
      nombre: 'Ana',
      apellido_paterno: 'Prueba',
      apellido_materno: null,
      correo_electronico: 'ana@example.test',
      rol_id: 2,
      activo: true,
      password_hash,
      roles: { nombre: 'asesor' },
    };
    const prisma = {
      usuarios: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(usuario)
          .mockResolvedValueOnce({
            id: usuario.id,
            rol_id: usuario.rol_id,
            nombre: usuario.nombre,
            apellido_paterno: usuario.apellido_paterno,
            apellido_materno: usuario.apellido_materno,
            correo_electronico: usuario.correo_electronico,
            activo: usuario.activo,
            roles: usuario.roles,
          }),
      },
    } as unknown as PrismaService;
    const jwt = {
      signAsync: jest.fn().mockResolvedValue('token-de-prueba'),
    } as unknown as JwtService;
    const config = {
      getOrThrow: jest
        .fn()
        .mockReturnValue('secreto-de-prueba-de-32-caracteres'),
    } as unknown as ConfigService;
    const auth = new AuthService(prisma, jwt, {} as MailService, config);
    const login = await auth.login({
      correo_electronico: 'ana@example.test',
      contrasena: 'Clave1234',
    });
    expect(login).toEqual({
      access_token: 'token-de-prueba',
      usuario: {
        id: userId,
        nombre: 'Ana',
        apellido_paterno: 'Prueba',
        apellido_materno: null,
        correo_electronico: 'ana@example.test',
        rol_id: 2,
      },
    });
    expect(JSON.stringify(login)).not.toContain('password_hash');
    expect((jwt.signAsync as jest.Mock).mock.calls[0][0]).toEqual({
      sub: userId,
      rol_id: 2,
    });

    const strategy = new JwtStrategy(config, prisma);
    const me = await strategy.validate({ sub: userId });
    expect(me.roles).toEqual({ nombre: 'asesor' });
    expect(me).not.toHaveProperty('password_hash');
  });

  it('rechaza una cuenta inactiva antes de firmar el token', async () => {
    const prisma = {
      usuarios: { findUnique: jest.fn().mockResolvedValue({ activo: false }) },
    } as unknown as PrismaService;
    const jwt = { signAsync: jest.fn() } as unknown as JwtService;
    const auth = new AuthService(
      prisma,
      jwt,
      {} as MailService,
      {} as ConfigService,
    );
    await expect(
      auth.login({
        correo_electronico: 'inactivo@example.test',
        contrasena: 'Clave1234',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it.each([
    ['dentro del minuto', new Date(Date.now() - 30_000)],
    ['con fecha futura', new Date(Date.now() + 30_000)],
  ])(
    'mantiene la respuesta genérica y no emite otro código %s',
    async (_caso, fecha_creacion) => {
      const prisma = {
        usuarios: {
          findUnique: jest.fn().mockResolvedValue({ id: userId, activo: true }),
        },
        password_reset_codes: {
          findFirst: jest.fn().mockResolvedValue({ fecha_creacion }),
        },
        $transaction: jest.fn(),
      } as unknown as PrismaService;
      const mail = { sendResetCode: jest.fn() } as unknown as MailService;
      const auth = new AuthService(
        prisma,
        {} as JwtService,
        mail,
        {} as ConfigService,
      );
      await expect(auth.forgotPassword('ana@example.test')).resolves.toEqual({
        message:
          'Si el correo está registrado, recibirás un código de recuperación.',
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(mail.sendResetCode).not.toHaveBeenCalled();
    },
  );
});
