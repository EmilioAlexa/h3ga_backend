import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreatePagoProgramadoDto } from './dto/create-pago-programado.dto';
import { ChangeEstadoPagoProgramadoDto } from './dto/change-estado-pago-programado.dto';
import { QueryPagosProgramadosDto } from './dto/query-pagos-programados.dto';
import { UpdatePagoProgramadoDto } from './dto/update-pago-programado.dto';

type UsuarioAutenticado = {
  id: string;
  activo: boolean;
  roles: { nombre: string };
};

const ROLES = ['administrador', 'administrador financiero', 'asesor'];

const programadoSelect = {
  id: true,
  contrato_id: true,
  tipo_cobro_id: true,
  numero_pago: true,
  fecha_esperada: true,
  fecha_vencimiento: true,
  monto_esperado: true,
  periodo: true,
  estado_id: true,
  contratos: {
    select: {
      id: true,
      folio: true,
      cliente_id: true,
      asesor_id: true,
      clientes: {
        select: {
          id: true,
          nombre: true,
          apellido_paterno: true,
          apellido_materno: true,
        },
      },
    },
  },
  tipos_cobro: { select: { id: true, nombre: true } },
  estados_pago_programado: { select: { id: true, nombre: true } },
  pagos: {
    select: {
      id: true,
      monto: true,
      fecha_pago: true,
      estado_pago_id: true,
    },
    orderBy: { fecha_registro: 'desc' as const },
  },
} as const;

@Injectable()
export class PagosProgramadosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryPagosProgramadosDto, usuario: UsuarioAutenticado) {
    this.ensureRole(usuario);
    if (
      query.fecha_desde &&
      query.fecha_hasta &&
      query.fecha_desde > query.fecha_hasta
    ) {
      throw new BadRequestException('El rango de fechas está invertido');
    }

    const contratoWhere: Prisma.contratosWhereInput = {};
    if (usuario.roles.nombre === 'asesor') contratoWhere.asesor_id = usuario.id;
    if (query.contrato_id) contratoWhere.id = query.contrato_id;
    if (query.q?.trim()) {
      contratoWhere.folio = { contains: query.q.trim(), mode: 'insensitive' };
    }

    const where: Prisma.pagos_programadosWhereInput = {};
    if (Object.keys(contratoWhere).length) where.contratos = { is: contratoWhere };
    if (query.tipo_cobro_id) where.tipo_cobro_id = query.tipo_cobro_id;
    if (query.estado_id) where.estado_id = query.estado_id;
    if (query.fecha_desde || query.fecha_hasta) {
      where.fecha_esperada = {
        ...(query.fecha_desde ? { gte: query.fecha_desde } : {}),
        ...(query.fecha_hasta ? { lte: query.fecha_hasta } : {}),
      };
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [data, total] = await Promise.all([
      this.prisma.pagos_programados.findMany({
        where,
        select: programadoSelect,
        orderBy: [{ fecha_esperada: 'asc' }, { numero_pago: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.pagos_programados.count({ where }),
    ]);

    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, usuario: UsuarioAutenticado) {
    this.ensureRole(usuario);
    const where: Prisma.pagos_programadosWhereInput =
      usuario.roles.nombre === 'asesor'
        ? { id, contratos: { is: { asesor_id: usuario.id } } }
        : { id };
    const programado = await this.prisma.pagos_programados.findFirst({
      where,
      select: programadoSelect,
    });
    if (!programado) throw new NotFoundException('Pago programado no encontrado');
    return programado;
  }

  async create(dto: CreatePagoProgramadoDto, usuario: UsuarioAutenticado) {
    this.ensureRole(usuario);
    if (!usuario.activo) throw new ForbiddenException('La cuenta no está activa');
    this.validateAmount(dto.monto_esperado);

    try {
      const [contrato, tipo] = await Promise.all([
        this.prisma.contratos.findUnique({
          where: { id: dto.contrato_id },
          select: { id: true, asesor_id: true },
        }),
        dto.tipo_cobro_id
          ? this.prisma.tipos_cobro.findUnique({
              where: { id: dto.tipo_cobro_id },
              select: { id: true, activo: true },
            })
          : Promise.resolve(null),
      ]);

      if (!contrato) throw new BadRequestException('El contrato no existe');
      this.ensureContractScope(contrato.asesor_id, usuario);
      if (dto.tipo_cobro_id && (!tipo || !tipo.activo)) {
        throw new BadRequestException('El tipo de cobro no existe o está inactivo');
      }
      return await this.prisma.pagos_programados.create({
        data: {
          contrato_id: contrato.id,
          tipo_cobro_id: dto.tipo_cobro_id ?? null,
          numero_pago: dto.numero_pago,
          fecha_esperada: dto.fecha_esperada ?? null,
          fecha_vencimiento: dto.fecha_vencimiento ?? null,
          monto_esperado: this.toDecimal(dto.monto_esperado),
          periodo: dto.periodo ?? null,
        },
        select: programadoSelect,
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async update(
    id: string,
    dto: UpdatePagoProgramadoDto,
    usuario: UsuarioAutenticado,
  ) {
    this.ensureRole(usuario);
    if (!usuario.activo) throw new ForbiddenException('La cuenta no está activa');
    if (!Object.keys(dto).length) {
      throw new BadRequestException('Envía al menos un campo para actualizar');
    }
    this.validateAmount(dto.monto_esperado);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const actual = await tx.pagos_programados.findUnique({
          where: { id },
          select: { id: true, contrato_id: true, contratos: { select: { asesor_id: true } } },
        });
        if (!actual) throw new NotFoundException('Pago programado no encontrado');
        this.ensureContractScope(actual.contratos.asesor_id, usuario);
        if (dto.contrato_id && dto.contrato_id !== actual.contrato_id) {
          throw new BadRequestException('No se puede cambiar el contrato asociado');
        }

        if (dto.tipo_cobro_id) {
          const tipo = await tx.tipos_cobro.findUnique({
            where: { id: dto.tipo_cobro_id },
            select: { id: true, activo: true },
          });
          if (!tipo || !tipo.activo) {
            throw new BadRequestException('El tipo de cobro no existe o está inactivo');
          }
        }
        const data: Prisma.pagos_programadosUpdateInput = {};
        if (dto.numero_pago !== undefined) data.numero_pago = dto.numero_pago;
        if (dto.tipo_cobro_id !== undefined) {
          data.tipos_cobro = dto.tipo_cobro_id
            ? { connect: { id: dto.tipo_cobro_id } }
            : { disconnect: true };
        }
        if (dto.fecha_esperada !== undefined) data.fecha_esperada = dto.fecha_esperada;
        if (dto.fecha_vencimiento !== undefined) data.fecha_vencimiento = dto.fecha_vencimiento;
        if (dto.monto_esperado !== undefined) data.monto_esperado = this.toDecimal(dto.monto_esperado);
        if (dto.periodo !== undefined) data.periodo = dto.periodo;
        return await tx.pagos_programados.update({
          where: { id },
          data,
          select: programadoSelect,
        });
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async changeState(
    id: string,
    dto: ChangeEstadoPagoProgramadoDto,
    usuario: UsuarioAutenticado,
  ) {
    this.ensureRole(usuario);
    if (!['administrador', 'administrador financiero'].includes(usuario.roles.nombre)) {
      throw new ForbiddenException('Solo administración puede cambiar el estado');
    }
    if (!usuario.activo) throw new ForbiddenException('La cuenta no está activa');
    const estado = await this.prisma.estados_pago_programado.findUnique({
      where: { id: dto.estado_id },
      select: { id: true },
    });
    if (!estado) throw new BadRequestException('El estado de pago programado no existe');
    try {
      return await this.prisma.pagos_programados.update({
        where: { id },
        data: { estado_id: estado.id },
        select: programadoSelect,
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  private ensureRole(usuario: UsuarioAutenticado) {
    if (!ROLES.includes(usuario?.roles?.nombre)) {
      throw new ForbiddenException('No tienes permiso para consultar pagos programados');
    }
  }

  private ensureContractScope(asesorId: string, usuario: UsuarioAutenticado) {
    if (usuario.roles.nombre === 'asesor' && asesorId !== usuario.id) {
      throw new NotFoundException('Contrato no encontrado');
    }
  }

  private validateAmount(value?: string | null) {
    if (value === undefined || value === null) return;
    if (new Prisma.Decimal(value).lte(0)) {
      throw new BadRequestException('monto_esperado debe ser mayor que cero');
    }
  }

  private toDecimal(value?: string | null) {
    return value === undefined || value === null ? null : new Prisma.Decimal(value);
  }

  private handlePrismaError(error: unknown): never {
    if (error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof ForbiddenException ||
        error instanceof NotFoundException) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2003') {
        throw new ConflictException('No se puede actualizar por una relación existente');
      }
      if (error.code === 'P2025') {
        throw new NotFoundException('Pago programado no encontrado');
      }
    }
    throw error;
  }
}
