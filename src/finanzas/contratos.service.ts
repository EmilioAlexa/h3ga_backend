import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateContratoDto } from './dto/create-contrato.dto';
import { QueryContratosDto } from './dto/query-contratos.dto';
import { UpdateContratoDto } from './dto/update-contrato.dto';

type UsuarioAutenticado = { id: string; roles: { nombre: string } };

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
    this.ensureCanManage(usuario);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const [cliente, servicio, asesor, estado] = await Promise.all([
          tx.clientes.findUnique({
            where: { id: dto.cliente_id },
            select: { id: true },
          }),
          tx.servicios.findUnique({
            where: { id: dto.servicio_id, activo: true },
            select: { id: true },
          }),
          tx.usuarios.findUnique({
            where: { id: dto.asesor_id },
            select: {
              id: true,
              activo: true,
              roles: { select: { nombre: true } },
            },
          }),
          tx.estados_contratos.findUnique({
            where: { id: dto.estado_contrato_id },
            select: { id: true },
          }),
        ]);

        if (!cliente)
          throw new BadRequestException('El cliente indicado no existe');
        if (!servicio) {
          throw new BadRequestException(
            'El servicio indicado no existe o está inactivo',
          );
        }
        if (!asesor || !asesor.activo || asesor.roles.nombre !== 'asesor') {
          throw new BadRequestException(
            'El usuario indicado no existe, está inactivo o no tiene el rol de asesor',
          );
        }
        if (!estado) {
          throw new BadRequestException(
            'El estado contractual indicado no existe',
          );
        }

        return tx.contratos.create({
          data: {
            cliente_id: dto.cliente_id,
            servicio_id: dto.servicio_id,
            asesor_id: dto.asesor_id,
            folio: dto.folio.trim(),
            fecha_contrato: dto.fecha_contrato,
            estado_contrato_id: dto.estado_contrato_id,
            cantidad_pagos: dto.cantidad_pagos,
            observaciones: dto.observaciones,
          },
          select: contratoSelect,
        });
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async update(
    id: string,
    dto: UpdateContratoDto,
    usuario: UsuarioAutenticado,
  ) {
    this.ensureCanManage(usuario);
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException(
        'Debe proporcionar observaciones para actualizar',
      );
    }

    try {
      return await this.prisma.contratos.update({
        where: { id },
        data: { observaciones: dto.observaciones },
        select: contratoSelect,
      });
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

  private ensureCanManage(usuario: UsuarioAutenticado): void {
    if (!ROLES_ADMINISTRATIVOS.includes(usuario?.roles?.nombre)) {
      throw new ForbiddenException(
        'Solo el administrador y el administrador financiero pueden administrar contratos',
      );
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
    throw error;
  }
}
