import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateContratoDto } from './dto/create-contrato.dto';
import { QueryContratosDto } from './dto/query-contratos.dto';
import { UpdateContratoDto } from './dto/update-contrato.dto';

type UsuarioAutenticado = {
  id: string;
  activo: boolean;
  roles: { nombre: string };
};

const ROLES_ADMINISTRATIVOS = ['administrador', 'administrador financiero'];

const contratoSelect = {
  id: true,
  cliente_id: true,
  servicio_id: true,
  asesor_id: true,
  folio: true,
  fecha_contrato: true,
  estado_contrato_id: true,
  cantidad_pagos: true,
  observaciones: true,
  creado_en: true,
  clientes: {
    select: {
      id: true,
      nombre: true,
      apellido_paterno: true,
      apellido_materno: true,
    },
  },
  servicios: { select: { id: true, nombre: true } },
  usuarios: {
    select: {
      id: true,
      nombre: true,
      apellido_paterno: true,
      apellido_materno: true,
    },
  },
  estados_contratos: { select: { id: true, nombre: true, orden: true } },
} as const;

@Injectable()
export class ContratosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryContratosDto, usuario: UsuarioAutenticado) {
    this.ensureCanRead(usuario);
    this.ensureValidDateRange(query.fecha_desde, query.fecha_hasta);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.contratosWhereInput = {};

    if (usuario.roles.nombre === 'asesor') {
      // La propiedad del contrato se determina por el vínculo directo contratos.asesor_id.
      where.asesor_id = usuario.id;
    } else if (query.asesor_id) {
      where.asesor_id = query.asesor_id;
    }

    if (query.cliente_id) where.cliente_id = query.cliente_id;
    if (query.servicio_id) where.servicio_id = query.servicio_id;
    if (query.estado_contrato_id) {
      where.estado_contrato_id = query.estado_contrato_id;
    }
    if (query.fecha_desde || query.fecha_hasta) {
      where.fecha_contrato = {
        ...(query.fecha_desde ? { gte: query.fecha_desde } : {}),
        ...(query.fecha_hasta ? { lte: query.fecha_hasta } : {}),
      };
    }
    const search = query.q?.trim();
    if (search) {
      where.folio = { contains: search, mode: 'insensitive' };
    }

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.contratos.findMany({
        where,
        select: contratoSelect,
        orderBy: [{ fecha_contrato: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.contratos.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, usuario: UsuarioAutenticado) {
    this.ensureCanRead(usuario);
    const where: Prisma.contratosWhereInput =
      usuario.roles.nombre === 'asesor'
        ? { id, asesor_id: usuario.id }
        : { id };
    const contrato = await this.prisma.contratos.findFirst({
      where,
      select: contratoSelect,
    });

    if (!contrato) throw new NotFoundException('Contrato no encontrado');
    return contrato;
  }

  async create(dto: CreateContratoDto, usuario: UsuarioAutenticado) {
    const esAsesor = usuario?.roles?.nombre === 'asesor';
    if (!esAsesor && !ROLES_ADMINISTRATIVOS.includes(usuario?.roles?.nombre)) {
      throw new ForbiddenException(
        'No tienes permiso para registrar contratos',
      );
    }
    if (!usuario.activo) {
      throw new ForbiddenException('La cuenta del usuario no está activa');
    }
    if (esAsesor && dto.asesor_id !== undefined) {
      throw new BadRequestException(
        'El asesor_id no se acepta para asesores; se asigna desde la sesión autenticada',
      );
    }
    if (!esAsesor && !dto.asesor_id) {
      throw new BadRequestException(
        'asesor_id es obligatorio cuando un administrador registra el contrato',
      );
    }
    const asesorId = esAsesor ? usuario.id : dto.asesor_id!;

    try {
      return await this.prisma.$transaction(async (tx) => {
        // La pausa y el alta bloquean la misma fila hasta terminar su transacción.
        const clientes = await tx.$queryRaw<
          Array<{ id: string; pausado: boolean }>
        >(
          Prisma.sql`SELECT "id", "pausado" FROM "clientes" WHERE "id" = ${dto.cliente_id}::uuid FOR UPDATE`,
        );
        const cliente = clientes[0];
        const servicio = await tx.servicios.findUnique({
          where: { id: dto.servicio_id, activo: true },
          select: { id: true, codigo_folio: true },
        });
        const estado = await tx.estados_contratos.findUnique({
          where: { id: dto.estado_contrato_id },
          select: { id: true },
        });

        if (!cliente)
          throw new BadRequestException('El cliente indicado no existe');
        if (cliente.pausado) {
          throw new ConflictException('El cliente está pausado');
        }
        if (!servicio) {
          throw new BadRequestException(
            'El servicio indicado no existe o está inactivo',
          );
        }
        if (!servicio.codigo_folio || !['APD', 'M10', 'M40', 'M40R'].includes(servicio.codigo_folio)) {
          throw new ConflictException('El servicio no tiene un codigo de folio aprobado');
        }
        if (!estado) {
          throw new BadRequestException(
            'El estado contractual indicado no existe',
          );
        }

        // El JWT procede de JwtStrategy, que ya consulta rol y cuenta activa.
        // Para administradores, el asesor indicado se valida aquí contra Prisma.
        if (!esAsesor) {
          const asesor = await tx.usuarios.findUnique({
            where: { id: asesorId },
            select: {
              id: true,
              activo: true,
              roles: { select: { nombre: true } },
            },
          });
          if (!asesor || !asesor.activo || asesor.roles.nombre !== 'asesor') {
            throw new BadRequestException(
              'El usuario indicado no existe, está inactivo o no tiene el rol de asesor',
            );
          }
        }

        const [momento] = await tx.$queryRaw<Array<{ instante: Date; anio: number }>>(
          Prisma.sql`SELECT instante, EXTRACT(YEAR FROM instante AT TIME ZONE 'America/Cancun')::int AS anio
                     FROM (SELECT clock_timestamp() AS instante) AS reloj`,
        );
        const [reserva] = await tx.$queryRaw<Array<{ ultimo: bigint }>>(
          Prisma.sql`INSERT INTO "folios_contrato_contadores" ("servicio_id", "anio", "ultimo")
                     VALUES (${servicio.id}, ${momento.anio}, 1)
                     ON CONFLICT ("servicio_id", "anio")
                     DO UPDATE SET "ultimo" = "folios_contrato_contadores"."ultimo" + 1
                     RETURNING "ultimo"`,
        );
        if (reserva.ultimo === 1n) {
          const historicos = await tx.$queryRaw<Array<{ existe: number }>>(
            Prisma.sql`SELECT 1 AS existe FROM "contratos"
                       WHERE "servicio_id" = ${servicio.id}
                         AND EXTRACT(YEAR FROM "creado_en" AT TIME ZONE 'America/Cancun')::int = ${momento.anio}
                       LIMIT 1`,
          );
          if (historicos.length) {
            throw new ConflictException('El contador del servicio y anio requiere inicializacion historica');
          }
        }
        const prefijo = servicio.codigo_folio === 'APD' ? '' : servicio.codigo_folio;
        const folio = `${prefijo}${momento.anio}${reserva.ultimo.toString().padStart(5, '0')}`;
        if (folio.length > 50) {
          throw new ConflictException('El consecutivo supera la longitud del folio contractual');
        }

        return tx.contratos.create({
          data: {
            cliente_id: dto.cliente_id,
            servicio_id: dto.servicio_id,
            asesor_id: asesorId,
            folio,
            fecha_contrato: dto.fecha_contrato,
            estado_contrato_id: dto.estado_contrato_id,
            cantidad_pagos: dto.cantidad_pagos,
            observaciones: dto.observaciones,
            creado_en: momento.instante,
          },
          select: contratoSelect,
        });
      }, { maxWait: 10_000, timeout: 20_000 });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async update(
    id: string,
    dto: UpdateContratoDto,
    usuario: UsuarioAutenticado,
  ) {
    this.ensureCanUpdate(usuario);
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException(
        'Debe proporcionar observaciones para actualizar',
      );
    }

    try {
      const result = await this.prisma.contratos.updateMany({
        where:
          usuario.roles.nombre === 'asesor'
            ? { id, asesor_id: usuario.id }
            : { id },
        data: { observaciones: dto.observaciones },
      });
      if (result.count === 0) {
        throw new NotFoundException('Contrato no encontrado');
      }
      return this.findOne(id, usuario);
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  private ensureCanRead(usuario: UsuarioAutenticado): void {
    if (
      !['administrador', 'administrador financiero', 'asesor'].includes(
        usuario?.roles?.nombre,
      )
    ) {
      throw new ForbiddenException('No tienes acceso a contratos');
    }
  }

  private ensureCanUpdate(usuario: UsuarioAutenticado): void {
    if (
      !['administrador', 'administrador financiero', 'asesor'].includes(
        usuario?.roles?.nombre,
      )
    ) {
      throw new ForbiddenException(
        'No tienes permiso para actualizar contratos',
      );
    }
    if (!usuario.activo) {
      throw new ForbiddenException('La cuenta del usuario no está activa');
    }
  }

  private ensureValidDateRange(fechaDesde?: Date, fechaHasta?: Date): void {
    if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) {
      throw new BadRequestException(
        'fecha_desde no puede ser posterior a fecha_hasta',
      );
    }
  }

  private handlePrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException(
          'El contrato entra en conflicto con una restricción única de la base de datos',
        );
      }
      if (error.code === 'P2010' && error.meta?.code === '23505') {
        throw new ConflictException('El folio contractual ya existe');
      }
      if (error.code === 'P2003') {
        throw new BadRequestException(
          'Una relación indicada para el contrato no existe',
        );
      }
      if (error.code === 'P2025') {
        throw new NotFoundException('Contrato no encontrado');
      }
      if (error.code === 'P2000') {
        throw new BadRequestException(
          'Uno o más campos exceden la longitud permitida',
        );
      }
    }
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      throw new ConflictException('El folio contractual ya existe');
    }
    throw error;
  }
}
