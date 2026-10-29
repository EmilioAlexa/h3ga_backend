import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';

const usuarioPublicoSelect = {
  id: true,
  rol_id: true,
  nombre: true,
  apellido_paterno: true,
  apellido_materno: true,
  correo_electronico: true,
  activo: true,
  fecha_creacion: true,
  roles: {
    select: {
      id: true,
      nombre: true,
      descripcion: true,
    },
  },
} as const;

@Injectable()
export class UsuariosService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.usuarios.findMany({
      select: usuarioPublicoSelect,
      orderBy: [{ apellido_paterno: 'asc' }, { nombre: 'asc' }],
    });
  }

  async findOne(id: string) {
    const usuario = await this.prisma.usuarios.findUnique({
      where: { id },
      select: usuarioPublicoSelect,
    });

    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return usuario;
  }

  async create(createUsuarioDto: CreateUsuarioDto) {
    await this.ensureRoleExists(createUsuarioDto.rol_id);

    const passwordHash = await bcrypt.hash(createUsuarioDto.contrasena, 10);

    try {
      return await this.prisma.usuarios.create({
        data: {
          rol_id: createUsuarioDto.rol_id,
          nombre: createUsuarioDto.nombre,
          apellido_paterno: createUsuarioDto.apellido_paterno,
          apellido_materno: createUsuarioDto.apellido_materno,
          correo_electronico: createUsuarioDto.correo_electronico,
          password_hash: passwordHash,
        },
        select: usuarioPublicoSelect,
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async update(id: string, updateUsuarioDto: UpdateUsuarioDto) {
    if (Object.keys(updateUsuarioDto).length === 0) {
      throw new BadRequestException('Debe proporcionar al menos un campo');
    }

    try {
      return await this.prisma.usuarios.update({
        where: { id },
        data: updateUsuarioDto,
        select: usuarioPublicoSelect,
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async changeRole(id: string, rolId: number, currentUserId: string) {
    this.ensureNotChangingOwnAccess(id, currentUserId);
    await this.ensureRoleExists(rolId);

    try {
      return await this.prisma.usuarios.update({
        where: { id },
        data: { rol_id: rolId },
        select: usuarioPublicoSelect,
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async changeStatus(id: string, activo: boolean, currentUserId: string) {
    this.ensureNotChangingOwnAccess(id, currentUserId);

    try {
      return await this.prisma.usuarios.update({
        where: { id },
        data: { activo },
        select: usuarioPublicoSelect,
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  private async ensureRoleExists(rolId: number): Promise<void> {
    const role = await this.prisma.roles.findUnique({
      where: { id: rolId },
      select: { id: true },
    });

    if (!role) {
      throw new BadRequestException('El rol indicado no existe');
    }
  }

  private ensureNotChangingOwnAccess(
    targetUserId: string,
    currentUserId: string,
  ): void {
    if (targetUserId === currentUserId) {
      throw new BadRequestException(
        'No puedes cambiar tu propio rol o estado',
      );
    }
  }

  private handlePrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException(
          'Ya existe un usuario con ese correo electrónico',
        );
      }

      if (error.code === 'P2003') {
        throw new BadRequestException('El rol indicado no existe');
      }

      if (error.code === 'P2025') {
        throw new NotFoundException('Usuario no encontrado');
      }
    }

    throw error;
  }
}
