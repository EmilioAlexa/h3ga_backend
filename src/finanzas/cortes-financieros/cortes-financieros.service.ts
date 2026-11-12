import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ChangeEstadoCorteDto } from './dto/change-estado-corte.dto';
import { CreateCorteFinancieroDto } from './dto/create-corte-financiero.dto';
import { QueryCortesFinancierosDto } from './dto/query-cortes-financieros.dto';

type UsuarioAutenticado = {
  id: string;
  activo: boolean;
  roles: { nombre: string };
};
type Tx = Prisma.TransactionClient;

const TZ = 'America/Cancun';
const ROLE_ADMINISTRATIVO = ['administrador', 'administrador financiero'];
const ESTADO_PREPARACION = 'En preparación';
const ESTADO_ABIERTO = 'Abierto';
const ESTADO_CERRADO = 'Cerrado';
const ESTADO_CANCELADO = 'Cancelado';
const ESTADO_PAGO_VALIDADO = 'Validado';

const corteListSelect = {
  id: true,
  numero_corte: true,
  fecha_inicio: true,
  fecha_fin: true,
  estado_id: true,
  creado_en: true,
  cerrado_en: true,
  estados_corte: { select: { id: true, nombre: true, descripcion: true } },
  usuarios_cortes_financieros_creado_porTousuarios: {
    select: {
      id: true,
      nombre: true,
      apellido_paterno: true,
      apellido_materno: true,
    },
  },
  usuarios_cortes_financieros_cerrado_porTousuarios: {
    select: {
      id: true,
      nombre: true,
      apellido_paterno: true,
      apellido_materno: true,
    },
  },
  _count: { select: { detalle_corte: true, prenomina: true } },
} satisfies Prisma.cortes_financierosSelect;

const paymentSelect = {
  id: true,
  monto: true,
  fecha_pago: true,
  referencia_pago: true,
  folio_recibo: true,
  estado_pago_id: true,
  estados_pago: { select: { id: true, nombre: true } },
  formas_pago: { select: { id: true, nombre: true } },
  contratos: {
    select: {
      id: true,
      folio: true,
      asesor_id: true,
      usuarios: {
        select: {
          id: true,
          nombre: true,
          apellido_paterno: true,
          apellido_materno: true,
        },
      },
      clientes: {
        select: {
          id: true,
          nombre: true,
          apellido_paterno: true,
          apellido_materno: true,
        },
      },
      servicios: { select: { id: true, nombre: true } },
    },
  },
  comisiones: {
    select: {
      id: true,
      monto_base: true,
      monto_comision: true,
      valor_aplicado: true,
      receptor_nombre_snapshot: true,
      estado_id: true,
      concepto_id: true,
      conceptos_dispersion: {
        select: {
          id: true,
          nombre: true,
          incluye_en_prenomina: true,
          es_remanente: true,
        },
      },
      estados_comisiones: { select: { id: true, nombre: true } },
    },
  },
} satisfies Prisma.pagosSelect;

type CutPeriod = { start: Date; endExclusive: Date; localStart: string };

@Injectable()
export class CortesFinancierosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryCortesFinancierosDto, user: UsuarioAutenticado) {
    this.ensureAdmin(user);
    this.ensureValidRange(query.fecha_desde, query.fecha_hasta);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.cortes_financierosWhereInput = {};
    if (query.estado_id) where.estado_id = query.estado_id;
    if (query.fecha_desde || query.fecha_hasta) {
      // Los filtros representan un intervalo y seleccionan cortes que se cruzan con él.
      where.AND = [
        ...(query.fecha_hasta
          ? [{ fecha_inicio: { lte: new Date(query.fecha_hasta) } }]
          : []),
        ...(query.fecha_desde
          ? [{ fecha_fin: { gt: new Date(query.fecha_desde) } }]
          : []),
      ];
    }
    const [data, total] = await Promise.all([
      this.prisma.cortes_financieros.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ fecha_inicio: 'desc' }, { numero_corte: 'desc' }],
        select: corteListSelect,
      }),
      this.prisma.cortes_financieros.count({ where }),
    ]);
    return { data: data.map((cut) => this.withFolio(cut)), page, limit, total };
  }

  async findOne(id: string, user: UsuarioAutenticado) {
    this.ensureAdmin(user);
    const corte = await this.prisma.cortes_financieros.findUnique({
      where: { id },
      select: {
        ...corteListSelect,
        detalle_corte: {
          orderBy: { pagos: { fecha_pago: 'asc' } },
          select: {
            id: true,
            pago_id: true,
            monto: true,
            pagos: { select: paymentSelect },
          },
        },
      },
    });
    if (!corte) throw new NotFoundException('Corte financiero no encontrado');
    const totalIngresos = corte.detalle_corte.reduce(
      (sum, detail) => sum.plus(detail.monto),
      new Prisma.Decimal(0),
    );
    const commissions = corte.detalle_corte.flatMap(
      (detail) => detail.pagos.comisiones,
    );
    const totalComisiones = commissions.reduce(
      (sum, commission) => sum.plus(commission.monto_comision),
      new Prisma.Decimal(0),
    );
    const comisionesPorConcepto = this.groupCommissions(commissions);
    return {
      ...this.withFolio(corte),
      resumen: {
        cantidad_pagos: corte.detalle_corte.length,
        total_ingresos: totalIngresos.toFixed(2),
        cantidad_comisiones: commissions.length,
        total_comisiones: totalComisiones.toFixed(2),
        comisiones_por_concepto: comisionesPorConcepto,
      },
    };
  }

  async create(dto: CreateCorteFinancieroDto, user: UsuarioAutenticado) {
    this.ensureAdmin(user);
    const period = this.buildPeriod(dto.periodo_inicio);
    try {
      const cutId = await this.prisma.$transaction(async (tx) => {
        const initialState = await this.getState(tx, ESTADO_PREPARACION);
        const cut = await tx.cortes_financieros.create({
          data: {
            fecha_inicio: period.start,
            fecha_fin: period.endExclusive,
            estado_id: initialState.id,
            creado_por: user.id,
          },
          select: { id: true, estado_id: true },
        });
        await tx.cortes_periodos_reservados.create({
          data: {
            periodo_inicio: this.dateOnly(period.localStart),
            corte_id: cut.id,
          },
        });
        await tx.historial_estados_corte.create({
          data: {
            corte_id: cut.id,
            estado_anterior_id: null,
            estado_nuevo_id: initialState.id,
            cambiado_por: user.id,
            comentario: 'Corte creado para revisión de pagos del periodo.',
          },
        });
        return cut.id;
      });
      return this.findOne(cutId, user);
    } catch (error) {
      this.handleWriteError(
        error,
        'El periodo ya tiene un corte no cancelado.',
      );
    }
  }

  async preview(id: string, user: UsuarioAutenticado) {
    this.ensureAdmin(user);
    const cut = await this.getCut(id);
    if (cut.estados_corte.nombre !== ESTADO_PREPARACION) {
      throw new ConflictException(
        'La revisión de incluidos y excluidos solo está disponible durante la preparación.',
      );
    }
    const period = this.periodFromCut(cut);
    const payments = await this.prisma.pagos.findMany({
      where: { fecha_pago: { gte: period.start, lt: period.endExclusive } },
      orderBy: [{ fecha_pago: 'asc' }, { id: 'asc' }],
      select: paymentSelect,
    });
    const reservations = await this.prisma.cortes_pagos_reservados.findMany({
      where: { pago_id: { in: payments.map((payment) => payment.id) } },
      select: { pago_id: true, corte_id: true },
    });
    const reservedByPayment = new Map(
      reservations.map((reservation) => [
        reservation.pago_id,
        reservation.corte_id,
      ]),
    );
    const included: typeof payments = [];
    const excluded: Array<{ pago: (typeof payments)[number]; motivo: string }> =
      [];
    for (const payment of payments) {
      const reservation = reservedByPayment.get(payment.id);
      if (reservation && reservation !== id) {
        excluded.push({
          pago: payment,
          motivo: 'El pago está reservado por otro corte no cancelado.',
        });
      } else if (payment.estados_pago?.nombre !== ESTADO_PAGO_VALIDADO) {
        excluded.push({
          pago: payment,
          motivo: `Estado de pago no elegible: ${payment.estados_pago?.nombre ?? 'sin estado'}.`,
        });
      } else {
        included.push(payment);
      }
    }
    const amountIncluded = included.reduce(
      (sum, payment) => sum.plus(payment.monto),
      new Prisma.Decimal(0),
    );
    const amountExcluded = excluded.reduce(
      (sum, row) => sum.plus(row.pago.monto),
      new Prisma.Decimal(0),
    );
    const commissions = included.flatMap((payment) => payment.comisiones);
    return {
      corte: this.withFolio(cut),
      periodo: {
        fecha_inicio: cut.fecha_inicio,
        fecha_fin_exclusiva: cut.fecha_fin,
        zona_horaria: TZ,
      },
      incluidos: {
        cantidad: included.length,
        total_ingresos: amountIncluded.toFixed(2),
        pagos: included,
      },
      excluidos: {
        cantidad: excluded.length,
        total_referencial: amountExcluded.toFixed(2),
        pagos: excluded,
      },
      comisiones_relacionadas: {
        cantidad: commissions.length,
        total_comisiones: commissions
          .reduce(
            (sum, commission) => sum.plus(commission.monto_comision),
            new Prisma.Decimal(0),
          )
          .toFixed(2),
        por_concepto: this.groupCommissions(commissions),
        nota: 'Resumen separado; no se suma a ingresos ni calcula un neto.',
      },
    };
  }

  async generate(
    id: string,
    dto: ChangeEstadoCorteDto,
    user: UsuarioAutenticado,
  ) {
    this.ensureAdmin(user);
    try {
      await this.prisma.$transaction(async (tx) => {
        const cut = await this.getCut(id, tx);
        if (cut.estados_corte.nombre !== ESTADO_PREPARACION) {
          throw new ConflictException(
            'Solo se pueden generar detalles de un corte En preparación.',
          );
        }
        const period = this.periodFromCut(cut);
        const openState = await this.getState(tx, ESTADO_ABIERTO);
        const payments = await tx.pagos.findMany({
          where: {
            fecha_pago: { gte: period.start, lt: period.endExclusive },
            estados_pago: { is: { nombre: ESTADO_PAGO_VALIDADO } },
          },
          select: { id: true, monto: true },
          orderBy: { id: 'asc' },
        });
        const previousReservations = payments.length
          ? await tx.cortes_pagos_reservados.findMany({
              where: {
                pago_id: { in: payments.map((payment) => payment.id) },
                corte_id: { not: id },
              },
              select: { pago_id: true },
            })
          : [];
        if (previousReservations.length) {
          throw new ConflictException(
            'Uno o más pagos ya están reservados por un corte no cancelado. Vuelve a consultar la preparación.',
          );
        }
        if (payments.length) {
          await tx.cortes_pagos_reservados.createMany({
            data: payments.map((payment) => ({
              pago_id: payment.id,
              corte_id: id,
            })),
          });
          await tx.detalle_corte.createMany({
            data: payments.map((payment) => ({
              corte_id: id,
              pago_id: payment.id,
              monto: payment.monto,
            })),
          });
        }
        const changed = await tx.cortes_financieros.updateMany({
          where: { id, estado_id: cut.estado_id },
          data: { estado_id: openState.id },
        });
        if (changed.count !== 1)
          throw new ConflictException(
            'El corte cambió mientras se generaban sus detalles.',
          );
        await tx.historial_estados_corte.create({
          data: {
            corte_id: id,
            estado_anterior_id: cut.estado_id,
            estado_nuevo_id: openState.id,
            cambiado_por: user.id,
            comentario:
              dto.comentario?.trim() ||
              'Detalles generados con pagos validados del periodo.',
          },
        });
      });
      return this.findOne(id, user);
    } catch (error) {
      this.handleWriteError(
        error,
        'No fue posible generar los detalles porque el periodo o algún pago ya está reservado.',
      );
    }
  }

  async close(id: string, dto: ChangeEstadoCorteDto, user: UsuarioAutenticado) {
    this.ensureAdmin(user);
    await this.changeState(
      id,
      ESTADO_ABIERTO,
      ESTADO_CERRADO,
      dto.comentario,
      user,
      {
        cerrado_por: user.id,
        cerrado_en: new Date(),
      },
    );
    return this.findOne(id, user);
  }

  async cancel(
    id: string,
    dto: ChangeEstadoCorteDto,
    user: UsuarioAutenticado,
  ) {
    this.ensureAdmin(user);
    try {
      await this.prisma.$transaction(async (tx) => {
        const cut = await this.getCut(id, tx);
        if (
          ![ESTADO_PREPARACION, ESTADO_ABIERTO].includes(
            cut.estados_corte.nombre,
          )
        ) {
          throw new ConflictException(
            'Solo se pueden cancelar cortes En preparación o Abiertos.',
          );
        }
        const cancelledState = await this.getState(tx, ESTADO_CANCELADO);
        const changed = await tx.cortes_financieros.updateMany({
          where: { id, estado_id: cut.estado_id },
          data: { estado_id: cancelledState.id },
        });
        if (changed.count !== 1)
          throw new ConflictException(
            'El corte cambió durante la cancelación.',
          );
        await tx.historial_estados_corte.create({
          data: {
            corte_id: id,
            estado_anterior_id: cut.estado_id,
            estado_nuevo_id: cancelledState.id,
            cambiado_por: user.id,
            comentario: dto.comentario?.trim() || null,
          },
        });
        await tx.cortes_pagos_reservados.deleteMany({
          where: { corte_id: id },
        });
        await tx.cortes_periodos_reservados.deleteMany({
          where: { corte_id: id },
        });
      });
    } catch (error) {
      this.handleWriteError(error, 'No fue posible cancelar el corte.');
    }
    return this.findOne(id, user);
  }

  async history(id: string, user: UsuarioAutenticado) {
    this.ensureAdmin(user);
    if (
      !(await this.prisma.cortes_financieros.findUnique({
        where: { id },
        select: { id: true },
      }))
    ) {
      throw new NotFoundException('Corte financiero no encontrado');
    }
    return this.prisma.historial_estados_corte.findMany({
      where: { corte_id: id },
      orderBy: { fecha_cambio: 'asc' },
      include: {
        estado_anterior: { select: { id: true, nombre: true } },
        estado_nuevo: { select: { id: true, nombre: true } },
        usuarios: {
          select: {
            id: true,
            nombre: true,
            apellido_paterno: true,
            apellido_materno: true,
          },
        },
      },
    });
  }

  private async changeState(
    id: string,
    expectedName: string,
    nextName: string,
    comment: string | undefined,
    user: UsuarioAutenticado,
    extra: Prisma.cortes_financierosUncheckedUpdateManyInput = {},
  ) {
    await this.prisma.$transaction(async (tx) => {
      const cut = await this.getCut(id, tx);
      if (cut.estados_corte.nombre !== expectedName) {
        throw new ConflictException(
          `El corte debe estar en estado ${expectedName}.`,
        );
      }
      const next = await this.getState(tx, nextName);
      const changed = await tx.cortes_financieros.updateMany({
        where: { id, estado_id: cut.estado_id },
        data: { estado_id: next.id, ...extra },
      });
      if (changed.count !== 1)
        throw new ConflictException('El corte cambió durante la operación.');
      await tx.historial_estados_corte.create({
        data: {
          corte_id: id,
          estado_anterior_id: cut.estado_id,
          estado_nuevo_id: next.id,
          cambiado_por: user.id,
          comentario: comment?.trim() || null,
        },
      });
    });
  }

  private async getCut(id: string, tx: Tx | PrismaService = this.prisma) {
    const cut = await tx.cortes_financieros.findUnique({
      where: { id },
      select: {
        id: true,
        numero_corte: true,
        fecha_inicio: true,
        fecha_fin: true,
        estado_id: true,
        estados_corte: { select: { id: true, nombre: true } },
      },
    });
    if (!cut) throw new NotFoundException('Corte financiero no encontrado');
    return cut;
  }

  private async getState(tx: Tx, name: string) {
    const state = await tx.estados_corte.findUnique({
      where: { nombre: name },
      select: { id: true, nombre: true },
    });
    if (!state)
      throw new ConflictException(
        `No está configurado el estado de corte requerido: ${name}.`,
      );
    return state;
  }

  private buildPeriod(input: string): CutPeriod {
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
    if (!dateMatch)
      throw new BadRequestException(
        'periodo_inicio debe usar el formato YYYY-MM-DD.',
      );
    const [, y, m, d] = dateMatch;
    const utcDate = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    if (utcDate.toISOString().slice(0, 10) !== input)
      throw new BadRequestException('periodo_inicio no es una fecha válida.');
    if (utcDate.getUTCDay() !== 5)
      throw new BadRequestException('El periodo debe comenzar en viernes.');
    const endDay = new Date(utcDate.getTime() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    return {
      start: this.cancunMidnight(input),
      endExclusive: this.cancunMidnight(endDay),
      localStart: input,
    };
  }

  private periodFromCut(cut: {
    fecha_inicio: Date;
    fecha_fin: Date;
  }): CutPeriod {
    const localStart = this.localDate(cut.fecha_inicio);
    const validated = this.buildPeriod(localStart);
    if (
      validated.start.getTime() !== cut.fecha_inicio.getTime() ||
      validated.endExclusive.getTime() !== cut.fecha_fin.getTime()
    ) {
      throw new ConflictException(
        'El corte tiene fechas incompatibles con su periodo semanal America/Cancun.',
      );
    }
    return validated;
  }

  private cancunMidnight(date: string): Date {
    const [year, month, day] = date.split('-').map(Number);
    const nominalUtc = Date.UTC(year, month - 1, day);
    const localParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(nominalUtc));
    const part = (name: string) =>
      Number(localParts.find((value) => value.type === name)?.value);
    const representedLocalUtc = Date.UTC(
      part('year'),
      part('month') - 1,
      part('day'),
      part('hour'),
      part('minute'),
      part('second'),
    );
    const offsetMs = representedLocalUtc - nominalUtc;
    return new Date(nominalUtc - offsetMs);
  }

  private localDate(date: Date): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const part = (name: string) =>
      parts.find((value) => value.type === name)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }

  private dateOnly(date: string): Date {
    return new Date(`${date}T00:00:00.000Z`);
  }

  private groupCommissions(
    commissions: Array<{
      monto_comision: Prisma.Decimal;
      conceptos_dispersion: { id: number; nombre: string };
      receptor_nombre_snapshot: string | null;
    }>,
  ) {
    const groups = new Map<
      string,
      {
        concepto_id: number;
        concepto: string;
        receptor: string;
        cantidad: number;
        total: Prisma.Decimal;
      }
    >();
    for (const commission of commissions) {
      const receptor =
        commission.receptor_nombre_snapshot ??
        commission.conceptos_dispersion.nombre;
      const key = `${commission.conceptos_dispersion.id}:${receptor}`;
      const group = groups.get(key) ?? {
        concepto_id: commission.conceptos_dispersion.id,
        concepto: commission.conceptos_dispersion.nombre,
        receptor,
        cantidad: 0,
        total: new Prisma.Decimal(0),
      };
      group.cantidad += 1;
      group.total = group.total.plus(commission.monto_comision);
      groups.set(key, group);
    }
    return [...groups.values()].map((group) => ({
      concepto_id: group.concepto_id,
      concepto: group.concepto,
      receptor: group.receptor,
      cantidad: group.cantidad,
      total: group.total.toFixed(2),
    }));
  }

  private withFolio<T extends { numero_corte: number; fecha_inicio: Date }>(
    cut: T,
  ) {
    const year = this.localDate(cut.fecha_inicio).slice(0, 4);
    return {
      ...cut,
      folio: `CF-${year}-${String(cut.numero_corte).padStart(3, '0')}`,
    };
  }

  private ensureAdmin(user: UsuarioAutenticado) {
    if (!user.activo || !ROLE_ADMINISTRATIVO.includes(user.roles.nombre)) {
      throw new ForbiddenException(
        'Solo administración puede consultar y administrar cortes financieros.',
      );
    }
  }

  private ensureValidRange(from?: string, to?: string) {
    if (from && to && new Date(from).getTime() > new Date(to).getTime()) {
      throw new BadRequestException(
        'fecha_desde no puede ser posterior a fecha_hasta.',
      );
    }
  }

  private handleWriteError(error: unknown, uniqueMessage: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') throw new ConflictException(uniqueMessage);
      if (error.code === 'P2025')
        throw new NotFoundException('Registro relacionado no encontrado.');
    }
    throw error;
  }
}
