import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { QueryClientesDto } from './dto/query-clientes.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';

type AuthenticatedUser = {
  id: string;
  roles: { nombre: string };
};

const clienteListadoSelect = {
  id: true,
  pausado: true,
  nombre: true,
  apellido_paterno: true,
  apellido_materno: true,
  telefono: true,
  correo_electronico: true,
} as const;

const clienteDetalleAdministrativoSelect = {
  ...clienteListadoSelect,
  curp: true,
  rfc: true,
} as const;

const clienteDetalleAdministradorSelect = {
  ...clienteDetalleAdministrativoSelect,
  asesor_id: true,
} as const;

@Injectable()
export class ClientesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryClientesDto, currentUser: AuthenticatedUser) {
    this.ensureCanRead(currentUser);
    const where = this.buildWhere(query, currentUser);
    const skip = (query.page - 1) * query.limit;

    const [data, total] = await Promise.all([
      this.prisma.clientes.findMany({
        where,
        select: clienteListadoSelect,
        skip,
        take: query.limit,
        orderBy: [
          { apellido_paterno: 'asc' },
          { nombre: 'asc' },
          { id: 'asc' },
        ],
      }),
      this.prisma.clientes.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string, currentUser: AuthenticatedUser) {
    this.ensureCanRead(currentUser);
    const where: Prisma.clientesWhereUniqueInput =
      currentUser.roles.nombre === 'asesor'
        ? { id, asesor_id: currentUser.id }
        : { id };

    const select =
      currentUser.roles.nombre === 'administrador'
        ? clienteDetalleAdministradorSelect
        : currentUser.roles.nombre === 'asesor'
          ? clienteDetalleAdministrativoSelect
          : clienteListadoSelect;

    const cliente = await this.prisma.clientes.findUnique({ where, select });

    if (!cliente) {
      throw new NotFoundException('Cliente no encontrado');
    }

    return cliente;
  }

  async create(
    createClienteDto: CreateClienteDto,
    currentUser: AuthenticatedUser,
  ) {
    await this.ensureActiveAdvisor(currentUser);

    try {
      const data = {
          nombre: createClienteDto.nombre,
          apellido_paterno: createClienteDto.apellido_paterno,
          apellido_materno: createClienteDto.apellido_materno,
          telefono: createClienteDto.telefono,
          correo_electronico: createClienteDto.correo_electronico,
          curp: createClienteDto.curp,
          rfc: createClienteDto.rfc,
          asesor_id: currentUser.id,
      };
      if (!createClienteDto.referido_por_cliente_id) {
        return await this.prisma.clientes.create({ data, select: clienteDetalleAdministrativoSelect });
      }
      await this.ensureReferralFeatureReady();
      return await this.prisma.$transaction(async (tx) => {
        const referidor = await tx.clientes.findUnique({
          where: { id: createClienteDto.referido_por_cliente_id! },
          select: { id: true, asesor_id: true },
        });
        if (!referidor || referidor.asesor_id !== currentUser.id) {
          throw new NotFoundException('Cliente referidor no disponible para el asesor');
        }
        const created = await tx.clientes.create({
          data: { ...data, referido_por_cliente_id: referidor.id },
          select: clienteDetalleAdministrativoSelect,
        });
        await tx.historial_referidor_cliente.create({
          data: { cliente_id: created.id, referidor_anterior_id: null, referidor_nuevo_id: referidor.id,
            actor_id: currentUser.id, motivo: 'Asignación inicial al registrar cliente' },
        });
        return created;
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async update(
    id: string,
    updateClienteDto: UpdateClienteDto,
    currentUser: AuthenticatedUser,
  ) {
    this.ensureCanUpdate(currentUser);

    if (Object.keys(updateClienteDto).length === 0) {
      throw new BadRequestException('Debe proporcionar al menos un campo');
    }

    const where: Prisma.clientesWhereInput =
      currentUser.roles.nombre === 'asesor'
        ? { id, asesor_id: currentUser.id }
        : { id };

    try {
      const result = await this.prisma.clientes.updateMany({
        where,
        data: updateClienteDto,
      });

      if (result.count === 0) {
        throw new NotFoundException('Cliente no encontrado');
      }

      return await this.findOne(id, currentUser);
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async setPaused(
    id: string,
    pausado: boolean,
    currentUser: AuthenticatedUser,
  ) {
    if (
      !['administrador', 'administrador financiero'].includes(
        currentUser?.roles?.nombre,
      )
    ) {
      throw new ForbiddenException(
        'No tienes permiso para cambiar el estado operativo',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "clientes" WHERE "id" = ${id}::uuid FOR UPDATE`,
      );
      if (rows.length === 0)
        throw new NotFoundException('Cliente no encontrado');

      return tx.clientes.update({
        where: { id },
        data: { pausado },
        select:
          currentUser.roles.nombre === 'administrador'
            ? clienteDetalleAdministradorSelect
            : clienteListadoSelect,
      });
    });
  }

  async setReferidor(id: string, referidorId: string | null | undefined, motivo: string, currentUser: AuthenticatedUser) {
    if (!['administrador', 'administrador financiero'].includes(currentUser.roles.nombre)) {
      throw new ForbiddenException('Solo administración puede cambiar el referidor');
    }
    if (referidorId === undefined) throw new BadRequestException('Debe indicar referidor_cliente_id o null');
    if (referidorId === id) throw new BadRequestException('Un cliente no puede referirse a sí mismo');
    await this.ensureReferralFeatureReady();
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "clientes" WHERE "id" = ${id}::uuid FOR UPDATE`,
      );
      if (!locked.length) throw new NotFoundException('Cliente no encontrado');
      const current = await tx.clientes.findUniqueOrThrow({ where: { id }, select: { referido_por_cliente_id: true } });
      if (current.referido_por_cliente_id === referidorId) throw new ConflictException('El referidor ya tiene ese valor');
      if (referidorId && !await tx.clientes.findUnique({ where: { id: referidorId }, select: { id: true } })) {
        throw new NotFoundException('Cliente referidor no encontrado');
      }
      const updated = await tx.clientes.update({
        where: { id }, data: { referido_por_cliente_id: referidorId },
        select: { ...clienteDetalleAdministrativoSelect, referido_por_cliente_id: true },
      });
      await tx.historial_referidor_cliente.create({
        data: { cliente_id: id, referidor_anterior_id: current.referido_por_cliente_id,
          referidor_nuevo_id: referidorId, actor_id: currentUser.id, motivo },
      });
      return updated;
    });
  }

  async historialReferidor(id: string, currentUser: AuthenticatedUser) {
    if (!['administrador', 'administrador financiero'].includes(currentUser.roles.nombre)) {
      throw new ForbiddenException('Solo administración puede consultar este historial');
    }
    await this.ensureReferralFeatureReady();
    if (!await this.prisma.clientes.findUnique({ where: { id }, select: { id: true } })) {
      throw new NotFoundException('Cliente no encontrado');
    }
    return this.prisma.historial_referidor_cliente.findMany({
      where: { cliente_id: id }, orderBy: [{ fecha_cambio: 'desc' }, { id: 'desc' }],
      select: { id: true, referidor_anterior_id: true, referidor_nuevo_id: true,
        actor_id: true, motivo: true, fecha_cambio: true },
    });
  }

  private ensureCanRead(currentUser: AuthenticatedUser): void {
    if (
      !['administrador', 'administrador financiero', 'asesor'].includes(
        currentUser.roles.nombre,
      )
    ) {
      throw new ForbiddenException('No tienes acceso a clientes');
    }
  }

  private async ensureReferralFeatureReady(): Promise<void> {
    const rows = await this.prisma.$queryRaw<Array<{ ready: boolean }>>(
      Prisma.sql`SELECT to_regclass('public.historial_referidor_cliente') IS NOT NULL AS ready`,
    );
    if (!rows[0]?.ready) throw new ConflictException('La relación de referidores requiere la migración pendiente');
  }

  private ensureCanUpdate(currentUser: AuthenticatedUser): void {
    if (!['administrador', 'asesor'].includes(currentUser.roles.nombre)) {
      throw new ForbiddenException('No tienes acceso para modificar clientes');
    }
  }

  private async ensureActiveAdvisor(
    currentUser: AuthenticatedUser,
  ): Promise<void> {
    if (currentUser.roles.nombre !== 'asesor') {
      throw new ForbiddenException('Solo un asesor puede registrar clientes');
    }

    const user = await this.prisma.usuarios.findUnique({
      where: { id: currentUser.id },
      select: {
        activo: true,
        roles: { select: { nombre: true } },
      },
    });

    if (!user || !user.activo) {
      throw new UnauthorizedException('La sesión del usuario no es válida');
    }

    if (user.roles.nombre !== 'asesor') {
      throw new ForbiddenException('Solo un asesor puede registrar clientes');
    }
  }

  private buildWhere(
    query: QueryClientesDto,
    currentUser: AuthenticatedUser,
  ): Prisma.clientesWhereInput {
    const where: Prisma.clientesWhereInput = {};

    if (currentUser.roles.nombre === 'asesor') {
      where.asesor_id = currentUser.id;
    }

    const search = query.q?.trim();
    if (search) {
      where.OR = [
        { nombre: { contains: search, mode: 'insensitive' } },
        { apellido_paterno: { contains: search, mode: 'insensitive' } },
        { apellido_materno: { contains: search, mode: 'insensitive' } },
        { correo_electronico: { contains: search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private handlePrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2000') {
        throw new BadRequestException(
          'Uno o más campos exceden la longitud permitida',
        );
      }

      if (error.code === 'P2003') {
        throw new BadRequestException('Una referencia proporcionada no existe');
      }

      if (error.code === 'P2025') {
        throw new NotFoundException('Cliente no encontrado');
      }
    }

    throw error;
  }
}
