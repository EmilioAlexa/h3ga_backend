import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { UsuariosService } from './usuarios.service';

const usuarioId = 'b7598e4a-9925-4e40-9e81-581aee42a906';

const usuarioSeguro = {
  id: usuarioId,
  rol_id: 1,
  nombre: 'Ana',
  apellido_paterno: 'Prueba',
  apellido_materno: null,
  correo_electronico: 'ana@example.test',
  activo: true,
  fecha_creacion: new Date('2026-01-01T00:00:00.000Z'),
  roles: { id: 1, nombre: 'administrador', descripcion: null },
};

describe('UsuariosService', () => {
  let service: UsuariosService;
  let prisma: {
    usuarios: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    roles: { findUnique: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      usuarios: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      roles: { findUnique: jest.fn() },
    };
    service = new UsuariosService(prisma as unknown as PrismaService);
  });

  it('selects and returns user fields without password_hash', async () => {
    prisma.usuarios.findMany.mockResolvedValue([usuarioSeguro]);

    const result = await service.findAll();

    expect(result).toEqual([usuarioSeguro]);
    const query = prisma.usuarios.findMany.mock.calls[0][0];
    expect(query.select).not.toHaveProperty('password_hash');
    expect(result[0]).not.toHaveProperty('password_hash');
  });

  it('stores a bcrypt hash and returns only the safe user selection', async () => {
    prisma.roles.findUnique.mockResolvedValue({ id: 1 });
    prisma.usuarios.create.mockResolvedValue(usuarioSeguro);

    const result = await service.create({
      rol_id: 1,
      nombre: 'Ana',
      apellido_paterno: 'Prueba',
      correo_electronico: 'ana@example.test',
      contrasena: 'PruebaSegura123!',
    });

    const createArgs = prisma.usuarios.create.mock.calls[0][0];
    expect(createArgs.data.password_hash).not.toBe('PruebaSegura123!');
    await expect(
      bcrypt.compare('PruebaSegura123!', createArgs.data.password_hash),
    ).resolves.toBe(true);
    expect(createArgs.select).not.toHaveProperty('password_hash');
    expect(result).not.toHaveProperty('password_hash');
  });

  it('rejects creating a user with a role that does not exist', async () => {
    prisma.roles.findUnique.mockResolvedValue(null);

    await expect(
      service.create({
        rol_id: 99,
        nombre: 'Ana',
        apellido_paterno: 'Prueba',
        correo_electronico: 'ana@example.test',
        contrasena: 'PruebaSegura123!',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.usuarios.create).not.toHaveBeenCalled();
  });

  it('maps a duplicate email database error to HTTP 409', async () => {
    prisma.roles.findUnique.mockResolvedValue({ id: 1 });
    prisma.usuarios.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.create({
        rol_id: 1,
        nombre: 'Ana',
        apellido_paterno: 'Prueba',
        correo_electronico: 'ana@example.test',
        contrasena: 'PruebaSegura123!',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects role and status changes to the authenticated administrator account', async () => {
    await expect(
      service.changeRole(usuarioId, 2, usuarioId),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.changeStatus(usuarioId, false, usuarioId),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.roles.findUnique).not.toHaveBeenCalled();
    expect(prisma.usuarios.update).not.toHaveBeenCalled();
  });

  it('returns 404 for a missing user', async () => {
    prisma.usuarios.findUnique.mockResolvedValue(null);

    await expect(service.findOne(usuarioId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
