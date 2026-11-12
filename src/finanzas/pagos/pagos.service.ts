import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  AccionEstadoPago,
  ChangeEstadoPagoDto,
} from './dto/change-estado-pago.dto';
import { CreatePagoDto } from './dto/create-pago.dto';
import { QueryPagosDto } from './dto/query-pagos.dto';
import { ComisionesService } from '../comisiones/comisiones.service';

type UsuarioAutenticado = {
  id: string;
  activo: boolean;
  roles: { nombre: string };
};

const ROLES_ADMINISTRATIVOS = ['administrador', 'administrador financiero'];
const ESTADO_PENDIENTE_REVISION = 'Pendiente de revisión financiera';
const ESTADO_RECHAZADO = 'Rechazado';
const ESTADO_PENDIENTE_AUTORIZACION = 'Pendiente de autorización';
const ESTADO_VALIDADO = 'Validado';

const pagoSelect = {
  id: true,
  contrato_id: true,
  pago_programado_id: true,
  forma_pago_id: true,
  estado_pago_id: true,
  monto: true,
  fecha_pago: true,
  registrado_por: true,
  fecha_registro: true,
  observaciones: true,
  referencia_pago: true,
  folio_recibo: true,
  recibido_por: true,
  lugar_recepcion: true,
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
  formas_pago: { select: { id: true, nombre: true } },
  estados_pago: { select: { id: true, nombre: true, orden: true } },
  pagos_programados: {
    select: {
      id: true,
      numero_pago: true,
      fecha_esperada: true,
      fecha_vencimiento: true,
      monto_esperado: true,
    },
  },
  usuarios: {
    select: {
      id: true,
      nombre: true,
      apellido_paterno: true,
      apellido_materno: true,
    },
  },
  usuario_receptor: {
    select: {
      id: true,
      nombre: true,
      apellido_paterno: true,
      apellido_materno: true,
    },
  },
  evidencias_pago: {
    select: {
      id: true,
      nombre_original: true,
      tipo_archivo: true,
      tipo_evidencia_id: true,
      tipos_evidencia_pago: { select: { id: true, nombre: true } },
    },
  },
} as const;

const historialSelect = {
  id: true,
  pago_id: true,
  estado_anterior_id: true,
  estado_nuevo_id: true,
  cambiado_por: true,
  fecha_cambio: true,
  comentario: true,
  estados_pago_historial_estados_pago_estado_anterior_idToestados_pago: {
    select: { id: true, nombre: true },
  },
  estados_pago_historial_estados_pago_estado_nuevo_idToestados_pago: {
    select: { id: true, nombre: true },
  },
  usuarios: {
    select: {
      id: true,
      nombre: true,
      apellido_paterno: true,
      apellido_materno: true,
    },
  },
} as const;

type FormaNormalizada = 'efectivo' | 'bancaria' | 'cheque';

@Injectable()
export class PagosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly comisionesService: ComisionesService,
  ) {}

  async findAll(query: QueryPagosDto, usuario: UsuarioAutenticado) {
    this.ensureCanRead(usuario);
    this.ensureValidDateRange(query.fecha_desde, query.fecha_hasta);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.pagosWhereInput = {};
    const contratoWhere: Prisma.contratosWhereInput = {};

    if (usuario.roles.nombre === 'asesor') {
      contratoWhere.asesor_id = usuario.id;
    } else if (query.asesor_id) {
      contratoWhere.asesor_id = query.asesor_id;
    }
    if (query.contrato_id) contratoWhere.id = query.contrato_id;
    if (query.cliente_id) contratoWhere.cliente_id = query.cliente_id;
    if (Object.keys(contratoWhere).length) {
      where.contratos = { is: contratoWhere };
    }
    if (query.estado_pago_id) where.estado_pago_id = query.estado_pago_id;
    if (query.forma_pago_id) where.forma_pago_id = query.forma_pago_id;
    if (query.fecha_desde || query.fecha_hasta) {
      where.fecha_pago = {
        ...(query.fecha_desde ? { gte: query.fecha_desde } : {}),
        ...(query.fecha_hasta ? { lte: query.fecha_hasta } : {}),
      };
    }
    const search = query.q?.trim();
    if (search) {
      where.OR = [
        { referencia_pago: { contains: search, mode: 'insensitive' } },
        { folio_recibo: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.pagos.findMany({
        where,
        select: pagoSelect,
        orderBy: [{ fecha_registro: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.pagos.count({ where }),
    ]);

    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, usuario: UsuarioAutenticado) {
    this.ensureCanRead(usuario);
    const where: Prisma.pagosWhereInput = {
      id,
      ...(usuario.roles.nombre === 'asesor'
        ? { contratos: { is: { asesor_id: usuario.id } } }
        : {}),
    };
    const pago = await this.prisma.pagos.findFirst({
      where,
      select: pagoSelect,
    });
    if (!pago) throw new NotFoundException('Pago no encontrado');
    return pago;
  }

  async findHistory(id: string, usuario: UsuarioAutenticado) {
    await this.findOne(id, usuario);
    return this.prisma.historial_estados_pago.findMany({
      where: { pago_id: id },
      select: historialSelect,
      orderBy: { fecha_cambio: 'asc' },
    });
  }

  async create(dto: CreatePagoDto, usuario: UsuarioAutenticado) {
    this.ensureCanCreate(usuario);
    const monto = this.parseMonto(dto.monto);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const [contrato, forma, estadoInicial] = await Promise.all([
          tx.contratos.findUnique({
            where: { id: dto.contrato_id },
            select: { id: true, asesor_id: true },
          }),
          tx.formas_pago.findUnique({
            where: { id: dto.forma_pago_id, activo: true },
            select: { id: true, nombre: true },
          }),
          tx.estados_pago.findUnique({
            where: { nombre: ESTADO_PENDIENTE_REVISION },
            select: { id: true },
          }),
        ]);

        if (!contrato) throw new BadRequestException('El contrato no existe');
        if (!forma) {
          throw new BadRequestException(
            'La forma de pago no existe o está inactiva',
          );
        }
        if (
          usuario.roles.nombre === 'asesor' &&
          contrato.asesor_id !== usuario.id
        ) {
          throw new NotFoundException('Contrato no encontrado');
        }
        if (!estadoInicial) {
          throw new ConflictException(
            `No está configurado el estado inicial: ${ESTADO_PENDIENTE_REVISION}`,
          );
        }

        const grupoForma = this.getFormaNormalizada(forma.nombre);
        if (grupoForma === 'efectivo') {
          if (!dto.folio_recibo?.trim()) {
            throw new BadRequestException(
              'folio_recibo es obligatorio para pagos en efectivo',
            );
          }
          if (!dto.recibido_por) {
            throw new BadRequestException(
              'recibido_por es obligatorio para pagos en efectivo',
            );
          }
        }

        if (dto.recibido_por) {
          const receptor = await tx.usuarios.findUnique({
            where: { id: dto.recibido_por },
            select: { id: true, activo: true },
          });
          if (!receptor || !receptor.activo) {
            throw new BadRequestException(
              'El usuario receptor no existe o está inactivo',
            );
          }
        }

        if (dto.pago_programado_id) {
          const programado = await tx.pagos_programados.findUnique({
            where: { id: dto.pago_programado_id },
            select: { id: true, contrato_id: true },
          });
          if (!programado) {
            throw new BadRequestException('El pago programado no existe');
          }
          if (programado.contrato_id !== contrato.id) {
            throw new BadRequestException(
              'El pago programado no pertenece al contrato indicado',
            );
          }
        }

        const pago = await tx.pagos.create({
          data: {
            contrato_id: contrato.id,
            pago_programado_id: dto.pago_programado_id,
            forma_pago_id: forma.id,
            estado_pago_id: estadoInicial.id,
            monto,
            fecha_pago: dto.fecha_pago,
            registrado_por: usuario.id,
            observaciones: dto.observaciones?.trim() || null,
            referencia_pago: dto.referencia_pago?.trim() || null,
            folio_recibo: dto.folio_recibo?.trim() || null,
            recibido_por: dto.recibido_por,
            lugar_recepcion: dto.lugar_recepcion?.trim() || null,
          },
          select: pagoSelect,
        });

        await tx.historial_estados_pago.create({
          data: {
            pago_id: pago.id,
            estado_anterior_id: null,
            estado_nuevo_id: estadoInicial.id,
            cambiado_por: usuario.id,
            comentario: 'Pago registrado y enviado a revisión financiera',
          },
        });
        return pago;
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async changeState(
    id: string,
    dto: ChangeEstadoPagoDto,
    usuario: UsuarioAutenticado,
  ) {
    this.ensureCanReview(usuario);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const pago = await tx.pagos.findFirst({
          where: { id },
          select: {
            id: true,
            estado_pago_id: true,
            forma_pago_id: true,
            estados_pago: { select: { id: true, nombre: true } },
            formas_pago: { select: { id: true, nombre: true } },
          },
        });
        if (!pago) throw new NotFoundException('Pago no encontrado');
        if (!pago.estados_pago || !pago.formas_pago) {
          throw new ConflictException(
            'El pago no tiene estado o forma de pago válidos',
          );
        }

        const siguienteNombre = this.resolveNextState(
          pago.estados_pago.nombre,
          dto.accion,
          usuario.roles.nombre,
        );
        const siguiente = await tx.estados_pago.findUnique({
          where: { nombre: siguienteNombre },
          select: { id: true, nombre: true },
        });
        if (!siguiente) {
          throw new ConflictException(
            `No está configurado el estado requerido: ${siguienteNombre}`,
          );
        }

        if (
          siguienteNombre === ESTADO_PENDIENTE_AUTORIZACION ||
          siguienteNombre === ESTADO_VALIDADO
        ) {
          await this.ensureEvidenceForMethod(
            tx,
            pago.id,
            pago.formas_pago.nombre,
          );
        }

        const changed = await tx.pagos.updateMany({
          where: { id: pago.id, estado_pago_id: pago.estado_pago_id },
          data: { estado_pago_id: siguiente.id },
        });
        if (changed.count !== 1) {
          throw new ConflictException(
            'El estado del pago cambió mientras se procesaba la revisión',
          );
        }

        await tx.historial_estados_pago.create({
          data: {
            pago_id: pago.id,
            estado_anterior_id: pago.estado_pago_id,
            estado_nuevo_id: siguiente.id,
            cambiado_por: usuario.id,
            comentario: dto.comentario?.trim() || null,
          },
        });

        if (siguienteNombre === ESTADO_VALIDADO) {
          await this.comisionesService.generateForValidatedPayment(
            tx,
            pago.id,
            usuario.id,
          );
        }

        return tx.pagos.findUnique({
          where: { id: pago.id },
          select: pagoSelect,
        });
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  private resolveNextState(
    actual: string,
    accion: AccionEstadoPago,
    rol: string,
  ): string {
    if (actual === ESTADO_PENDIENTE_REVISION) {
      if (rol === 'administrador financiero') {
        if (accion === AccionEstadoPago.RECHAZAR) return ESTADO_RECHAZADO;
        if (accion === AccionEstadoPago.ENVIAR_A_AUTORIZACION) {
          return ESTADO_PENDIENTE_AUTORIZACION;
        }
      }
      if (rol === 'administrador') {
        if (accion === AccionEstadoPago.RECHAZAR) return ESTADO_RECHAZADO;
        if (accion === AccionEstadoPago.VALIDAR) return ESTADO_VALIDADO;
      }
    }

    if (actual === ESTADO_PENDIENTE_AUTORIZACION) {
      if (rol !== 'administrador') {
        throw new ForbiddenException(
          'Solo el administrador puede resolver pagos pendientes de autorización',
        );
      }
      if (accion === AccionEstadoPago.RECHAZAR) return ESTADO_RECHAZADO;
      if (accion === AccionEstadoPago.VALIDAR) return ESTADO_VALIDADO;
    }

    if (
      actual === ESTADO_RECHAZADO ||
      actual === ESTADO_VALIDADO ||
      actual === 'Cancelado'
    ) {
      throw new ConflictException(`El estado ${actual} no admite transiciones`);
    }

    throw new ForbiddenException(
      `La acción ${accion} no está permitida para el rol y estado actuales (${actual})`,
    );
  }

  private async ensureEvidenceForMethod(
    tx: Prisma.TransactionClient,
    pagoId: string,
    formaNombre: string,
  ): Promise<void> {
    const grupo = this.getFormaNormalizada(formaNombre);
    const tipoNombre =
      grupo === 'efectivo'
        ? 'Comprobante de efectivo'
        : grupo === 'bancaria'
          ? 'Comprobante bancario'
          : 'Comprobante de cheque';
    const tipo = await tx.tipos_evidencia_pago.findUnique({
      where: { nombre: tipoNombre },
      select: { id: true },
    });
    if (!tipo) {
      throw new ConflictException(
        `No está configurado el tipo de evidencia requerido: ${tipoNombre}`,
      );
    }
    const evidencias = await tx.evidencias_pago.count({
      where: { pago_id: pagoId, tipo_evidencia_id: tipo.id },
    });
    if (evidencias === 0) {
      throw new BadRequestException(
        `El pago requiere una evidencia de tipo "${tipoNombre}" antes de aprobar la revisión`,
      );
    }
  }

  private getFormaNormalizada(nombre: string): FormaNormalizada {
    const normalized = nombre
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es-MX');
    if (normalized.includes('efectivo')) return 'efectivo';
    if (
      normalized.includes('transferencia') ||
      normalized.includes('deposito')
    ) {
      return 'bancaria';
    }
    if (normalized.includes('cheque')) return 'cheque';
    throw new BadRequestException(
      'La forma de pago no corresponde a efectivo, transferencia, depósito o cheque',
    );
  }

  private parseMonto(value: string): Prisma.Decimal {
    const monto = new Prisma.Decimal(value);
    if (!monto.isFinite() || monto.lte(0)) {
      throw new BadRequestException('monto debe ser mayor que cero');
    }
    if (monto.decimalPlaces() > 2 || monto.greaterThan('9999999999.99')) {
      throw new BadRequestException(
        'monto excede la precisión Decimal(12,2) permitida',
      );
    }
    return monto;
  }

  private ensureCanRead(usuario: UsuarioAutenticado): void {
    if (
      !['administrador', 'administrador financiero', 'asesor'].includes(
        usuario?.roles?.nombre,
      )
    ) {
      throw new ForbiddenException('No tienes acceso a pagos');
    }
  }

  private ensureCanCreate(usuario: UsuarioAutenticado): void {
    this.ensureCanRead(usuario);
    if (!usuario.activo) {
      throw new ForbiddenException('La cuenta del usuario no está activa');
    }
  }

  private ensureCanReview(usuario: UsuarioAutenticado): void {
    if (!ROLES_ADMINISTRATIVOS.includes(usuario?.roles?.nombre)) {
      throw new ForbiddenException(
        'Solo administración puede revisar y cambiar el estado de pagos',
      );
    }
    if (!usuario.activo) {
      throw new ForbiddenException('La cuenta del usuario no está activa');
    }
  }

  private ensureValidDateRange(desde?: Date, hasta?: Date): void {
    if (desde && hasta && desde > hasta) {
      throw new BadRequestException(
        'fecha_desde no puede ser posterior a fecha_hasta',
      );
    }
  }

  private handlePrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException(
          'El pago entra en conflicto con un dato único',
        );
      }
      if (error.code === 'P2003') {
        throw new BadRequestException(
          'Una relación indicada para el pago no existe',
        );
      }
      if (error.code === 'P2025') {
        throw new NotFoundException('Pago no encontrado');
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
