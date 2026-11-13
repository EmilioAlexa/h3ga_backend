import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreatePrenominaDto } from './dto/create-prenomina.dto';
import { QueryPrenominasDto } from './dto/query-prenominas.dto';

type AuthUser = { id: string; activo: boolean; roles: { nombre: string } };
const ADMIN = ['administrador', 'administrador financiero'];
const commissionSelect = {
  id: true,
  pago_id: true,
  monto_base: true,
  monto_comision: true,
  valor_aplicado: true,
  tipo_calculo: true,
  fecha_calculo: true,
  receptor_nombre_snapshot: true,
  beneficiario_id: true,
  receptor_dispersion_id: true,
  detalle_prenomina_id: true,
  usuarios: {
    select: { id: true, nombre: true, apellido_paterno: true, apellido_materno: true },
  },
  receptores_dispersion: {
    select: {
      id: true,
      nombre_externo: true,
      usuarios_receptor: {
        select: { id: true, nombre: true, apellido_paterno: true, apellido_materno: true },
      },
    },
  },
  conceptos_dispersion: {
    select: {
      id: true,
      nombre: true,
      tipo_destino: true,
      incluye_en_prenomina: true,
      es_remanente: true,
    },
  },
  pagos: {
    select: {
      id: true,
      fecha_pago: true,
      monto: true,
      folio_recibo: true,
      referencia_pago: true,
      formas_pago: { select: { id: true, nombre: true } },
      contratos: {
        select: {
          id: true,
          folio: true,
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
        },
      },
    },
  },
} satisfies Prisma.comisionesSelect;

type Commission = Prisma.comisionesGetPayload<{ select: typeof commissionSelect }>;
type RecipientGroup = {
  conceptId: number;
  conceptName: string;
  beneficiaryId: string | null;
  receiverId: string | null;
  receiverName: string;
  commissionIds: string[];
  amount: Prisma.Decimal;
};

@Injectable()
export class PrenominasService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryPrenominasDto, user: AuthUser) {
    this.ensureAdmin(user);
    const detailWhere: Prisma.detalle_prenominaWhereInput = {
      ...(query.beneficiario_id ? { beneficiario_id: query.beneficiario_id } : {}),
      ...(query.receptor_dispersion_id
        ? { receptor_dispersion_id: query.receptor_dispersion_id }
        : {}),
      ...(query.concepto_id ? { concepto_id: query.concepto_id } : {}),
    };
    const where: Prisma.prenominaWhereInput = {
      ...(query.corte_id ? { corte_id: query.corte_id } : {}),
      ...(query.estado_id ? { estado_id: query.estado_id } : {}),
      ...(Object.keys(detailWhere).length ? { detalle_prenomina: { some: detailWhere } } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.prenomina.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { creado_en: 'desc' },
        include: {
          estados_prenomina: true,
          cortes_financieros: {
            select: { id: true, numero_corte: true, fecha_inicio: true, fecha_fin: true, estados_corte: { select: { nombre: true } } },
          },
          detalle_prenomina: {
            orderBy: [{ concepto_id: 'asc' }, { receptor_nombre_snapshot: 'asc' }],
            include: {
              conceptos_dispersion: true,
              usuarios: { select: { id: true, nombre: true, apellido_paterno: true, apellido_materno: true } },
              receptores_dispersion: true,
              _count: { select: { comisiones: true } },
            },
          },
        },
      }),
      this.prisma.prenomina.count({ where }),
    ]);
    return { data, page: query.page, limit: query.limit, total };
  }

  async findOne(id: string, user: AuthUser) {
    this.ensureAdmin(user);
    const record = await this.prisma.prenomina.findUnique({
      where: { id },
      include: {
        estados_prenomina: true,
        cortes_financieros: {
          select: { id: true, numero_corte: true, fecha_inicio: true, fecha_fin: true, estados_corte: { select: { nombre: true } } },
        },
        detalle_prenomina: {
          orderBy: [{ concepto_id: 'asc' }, { receptor_nombre_snapshot: 'asc' }],
          include: {
            conceptos_dispersion: true,
            usuarios: { select: { id: true, nombre: true, apellido_paterno: true, apellido_materno: true } },
            receptores_dispersion: true,
            comisiones: { select: commissionSelect, orderBy: { fecha_calculo: 'asc' } },
          },
        },
      },
    });
    if (!record) throw new NotFoundException('Prenómina no encontrada');
    return record;
  }

  async preview(corteId: string, user: AuthUser) {
    this.ensureAdmin(user);
    const cut = await this.prisma.cortes_financieros.findUnique({
      where: { id: corteId },
      include: { estados_corte: true },
    });
    if (!cut) throw new NotFoundException('Corte financiero no encontrado');
    const existing = await this.prisma.prenomina.findUnique({ where: { corte_id: corteId }, select: { id: true } });
    if (existing) throw new ConflictException('El corte ya tiene una prenómina generada');

    const cutDetails = await this.prisma.detalle_corte.findMany({
      where: { corte_id: corteId },
      select: { pago_id: true },
    });
    const paymentIds = cutDetails.map((detail) => detail.pago_id);
    const commissions = paymentIds.length
      ? await this.prisma.comisiones.findMany({
          where: {
            pago_id: { in: paymentIds },
            detalle_prenomina_id: null,
            conceptos_dispersion: {
              incluye_en_prenomina: true,
              es_remanente: false,
              tipo_destino: { in: ['usuario', 'externo'] },
              nombre: { not: 'IMSS' },
            },
          },
          select: commissionSelect,
          orderBy: [{ fecha_calculo: 'asc' }, { id: 'asc' }],
        })
      : [];
    return {
      corte: {
        id: cut.id,
        numero_corte: cut.numero_corte,
        fecha_inicio: cut.fecha_inicio,
        fecha_fin: cut.fecha_fin,
        estado: cut.estados_corte.nombre,
      },
      comisiones_elegibles: commissions.length,
      total_referencial: this.sum(commissions.map((commission) => commission.monto_comision)).toFixed(2),
      movimientos: commissions.map((commission) => this.asMovement(commission)),
      por_receptor: this.serializeGroups(this.group(commissions)),
      exclusiones: {
        imss_y_empresa: 'No se incluyen en prenómina.',
        ya_incluidas: 'Se excluyen comisiones asociadas a una prenómina anterior.',
        no_marcadas: 'Solo se incluyen conceptos con incluye_en_prenomina=true y destino de persona.',
      },
    };
  }

  async generate(corteId: string, dto: CreatePrenominaDto, user: AuthUser) {
    this.ensureAdmin(user);
    try {
      const prenominaId = await this.prisma.$transaction(async (tx) => {
        const [cut, state, existing] = await Promise.all([
          tx.cortes_financieros.findUnique({ where: { id: corteId }, include: { estados_corte: true } }),
          tx.estados_prenomina.findUnique({ where: { id: dto.estado_id } }),
          tx.prenomina.findUnique({ where: { corte_id: corteId }, select: { id: true } }),
        ]);
        if (!cut) throw new NotFoundException('Corte financiero no encontrado');
        if (!state) throw new BadRequestException('El estado de prenómina seleccionado no existe');
        if (existing) throw new ConflictException('El corte ya tiene una prenómina generada');
        if (cut.estados_corte.nombre === 'Cancelado') throw new ConflictException('No se puede generar prenómina para un corte cancelado');

        const cutDetails = await tx.detalle_corte.findMany({ where: { corte_id: corteId }, select: { pago_id: true } });
        const paymentIds = cutDetails.map((detail) => detail.pago_id);
        const commissions = paymentIds.length
          ? await tx.comisiones.findMany({
              where: {
                pago_id: { in: paymentIds },
                detalle_prenomina_id: null,
                conceptos_dispersion: {
                  incluye_en_prenomina: true,
                  es_remanente: false,
                  tipo_destino: { in: ['usuario', 'externo'] },
                  nombre: { not: 'IMSS' },
                },
              },
              select: commissionSelect,
              orderBy: [{ fecha_calculo: 'asc' }, { id: 'asc' }],
            })
          : [];
        const groups = this.group(commissions);
        const total = this.sum(groups.map((group) => group.amount));
        const prenomina = await tx.prenomina.create({
          data: {
            corte_id: corteId,
            estado_id: state.id,
            creado_por: user.id,
            total_referencial: total,
            observaciones: dto.observaciones?.trim() || null,
          },
          select: { id: true },
        });
        for (const group of groups) {
          const detail = await tx.detalle_prenomina.create({
            data: {
              prenomina_id: prenomina.id,
              monto_referencial: group.amount,
              concepto_id: group.conceptId,
              beneficiario_id: group.beneficiaryId,
              receptor_dispersion_id: group.receiverId,
              receptor_nombre_snapshot: group.receiverName,
            },
            select: { id: true },
          });
          const linked = await tx.comisiones.updateMany({
            where: { id: { in: group.commissionIds }, detalle_prenomina_id: null },
            data: { detalle_prenomina_id: detail.id },
          });
          if (linked.count !== group.commissionIds.length) {
            throw new ConflictException('Una o más comisiones se incluyeron en otra prenómina durante la generación');
          }
        }
        return prenomina.id;
      });
      return this.findOne(prenominaId, user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('El corte ya tiene una prenómina generada');
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new BadRequestException('El estado, corte o receptor relacionado no existe');
      }
      throw error;
    }
  }

  private group(commissions: Commission[]): RecipientGroup[] {
    const groups = new Map<string, RecipientGroup>();
    for (const commission of commissions) {
      const concept = commission.conceptos_dispersion;
      if (!commission.beneficiario_id && !commission.receptor_dispersion_id) {
        throw new ConflictException(`La comisión ${commission.id} no tiene un receptor identificable`);
      }
      const receiverName = commission.receptor_nombre_snapshot?.trim() || this.receiverName(commission);
      const key = `${concept.id}:${commission.beneficiario_id ?? ''}:${commission.receptor_dispersion_id ?? ''}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          conceptId: concept.id,
          conceptName: concept.nombre,
          beneficiaryId: commission.beneficiario_id,
          receiverId: commission.receptor_dispersion_id,
          receiverName,
          commissionIds: [],
          amount: new Prisma.Decimal(0),
        };
        groups.set(key, group);
      }
      group.commissionIds.push(commission.id);
      group.amount = group.amount.plus(commission.monto_comision);
    }
    return [...groups.values()].sort((a, b) => a.conceptName.localeCompare(b.conceptName) || a.receiverName.localeCompare(b.receiverName));
  }

  private serializeGroups(groups: RecipientGroup[]) {
    return groups.map((group) => ({
      concepto_id: group.conceptId,
      destino: group.conceptName,
      beneficiario_id: group.beneficiaryId,
      receptor_dispersion_id: group.receiverId,
      receptor: group.receiverName,
      movimientos: group.commissionIds.length,
      monto_referencial: group.amount.toFixed(2),
    }));
  }

  private asMovement(commission: Commission) {
    return {
      comision_id: commission.id,
      concepto: commission.conceptos_dispersion.nombre,
      receptor: commission.receptor_nombre_snapshot || this.receiverName(commission),
      monto_base: commission.monto_base.toFixed(2),
      porcentaje_aplicado: commission.valor_aplicado.toFixed(2),
      monto_referencial: commission.monto_comision.toFixed(2),
      pago: commission.pagos,
    };
  }

  private receiverName(commission: Commission) {
    const user = commission.usuarios ?? commission.receptores_dispersion?.usuarios_receptor;
    const external = commission.receptores_dispersion?.nombre_externo;
    if (!user && external) return external;
    if (!user) return 'Receptor sin nombre histórico';
    return [user.nombre, user.apellido_paterno, user.apellido_materno].filter(Boolean).join(' ');
  }

  private sum(values: Prisma.Decimal[]) {
    return values.reduce((total, value) => total.plus(value), new Prisma.Decimal(0));
  }

  private ensureAdmin(user: AuthUser) {
    if (!user.activo || !ADMIN.includes(user.roles.nombre)) {
      throw new ForbiddenException('Solo administración puede consultar y generar prenóminas');
    }
  }
}
