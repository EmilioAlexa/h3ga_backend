import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateReceptorDispersionDto } from './dto/create-receptor-dispersion.dto';
import { SaveConfiguracionDispersionDto, QueryComisionesDto } from './dto/save-configuracion-dispersion.dto';

type UsuarioAutenticado = { id: string; activo: boolean; roles: { nombre: string } };
const ADMIN = ['administrador', 'administrador financiero'];
const ESTADO_PENDIENTE = 'Pendiente de dispersión';
const ESTADO_DISPERSADA = 'Dispersada';

@Injectable()
export class ComisionesService {
  constructor(private readonly prisma: PrismaService) {}

  async createReceptor(dto: CreateReceptorDispersionDto, user: UsuarioAutenticado) {
    this.ensureAdmin(user);
    const [concept, account] = await Promise.all([
      this.prisma.conceptos_dispersion.findUnique({ where: { id: dto.concepto_id } }),
      dto.usuario_id ? this.prisma.usuarios.findUnique({ where: { id: dto.usuario_id }, include: { roles: true } }) : null,
    ]);
    if (!concept?.activo || concept.es_remanente) throw new BadRequestException('El concepto no admite receptores configurables');
    if (concept.tipo_destino === 'usuario') {
      if (!account?.activo || account.roles.nombre !== 'asesor' || dto.nombre_externo) throw new BadRequestException('El concepto requiere un usuario activo con rol asesor');
    } else if (concept.tipo_destino === 'externo') {
      if (dto.usuario_id || !dto.nombre_externo?.trim()) throw new BadRequestException('El concepto requiere el nombre de un receptor externo');
    } else throw new BadRequestException('El concepto no permite receptores individuales');
    try {
      return await this.prisma.receptores_dispersion.create({
        data: { concepto_id: dto.concepto_id, usuario_id: dto.usuario_id ?? null, nombre_externo: dto.nombre_externo?.trim() ?? null, creado_por: user.id },
        include: { conceptos_dispersion: true, usuarios_receptor: { select: { id: true, nombre: true, apellido_paterno: true, apellido_materno: true } } },
      });
    } catch (error) { this.handlePrismaError(error); }
  }

  async listReceptores(conceptoId: number | undefined, user: UsuarioAutenticado) {
    this.ensureAdmin(user);
    return this.prisma.receptores_dispersion.findMany({ where: { activo: true, ...(conceptoId ? { concepto_id: conceptoId } : {}) }, include: { conceptos_dispersion: true, usuarios_receptor: { select: { id: true, nombre: true, apellido_paterno: true, apellido_materno: true } } }, orderBy: [{ concepto_id: 'asc' }, { nombre_externo: 'asc' }] });
  }

  async saveConfiguracion(contratoId: string, dto: SaveConfiguracionDispersionDto, user: UsuarioAutenticado) {
    this.ensureAdmin(user);
    const contract = await this.prisma.contratos.findUnique({ where: { id: contratoId }, select: { id: true, servicio_id: true, seguimiento_m10: { select: { contrato_id: true } }, seguimiento_m40: { select: { contrato_id: true } }, seguimiento_m40_retroactiva: { select: { contrato_id: true } } } });
    if (!contract) throw new NotFoundException('Contrato no encontrado');
    const total = dto.configuracion.reduce((sum, row) => sum + Number(row.valor), 0);
    if (dto.configuracion.some(row => !Number.isFinite(Number(row.valor)) || Number(row.valor) < 0 || Number(row.valor) > 100 || Math.round(Number(row.valor) * 2) !== Number(row.valor) * 2) || total > 100) throw new BadRequestException('Los porcentajes deben ser de 0 a 100, avanzar en pasos de 0.5 y sumar como máximo 100');
    const concepts = await this.prisma.conceptos_dispersion.findMany({ where: { id: { in: dto.configuracion.map(x => x.concepto_id) }, activo: true } });
    if (concepts.length !== new Set(dto.configuracion.map(x => x.concepto_id)).size || concepts.some(x => x.es_remanente || x.tipo_destino === 'empresa')) throw new BadRequestException('Incluye únicamente conceptos activos que admiten configuración');
    if (dto.configuracion.some(x => concepts.find(c => c.id === x.concepto_id)?.nombre === 'IMSS') && !(contract.seguimiento_m10 || contract.seguimiento_m40 || contract.seguimiento_m40_retroactiva)) throw new BadRequestException('IMSS solo se configura para Modalidad 10, Modalidad 40 o M40 Retroactiva');
    const receivers = await this.prisma.receptores_dispersion.findMany({ where: { id: { in: dto.configuracion.map(x => x.receptor_dispersion_id) }, activo: true }, include: { conceptos_dispersion: true } });
    if (receivers.length !== dto.configuracion.length || dto.configuracion.some(row => { const r = receivers.find(x => x.id === row.receptor_dispersion_id); return !r || r.concepto_id !== row.concepto_id || r.conceptos_dispersion.es_remanente; })) throw new BadRequestException('Cada receptor debe estar activo y corresponder al concepto seleccionado');
    const prior = await this.prisma.contrato_dispersion_detalle.findMany({ where: { contrato_id: contratoId, activo: true }, include: { conceptos_dispersion: true, receptores_dispersion: { include: { usuarios_receptor: true } } }, orderBy: { orden: 'asc' } });
    return this.prisma.$transaction(async tx => {
      for (const old of prior) {
        if (!dto.configuracion.some(row => row.concepto_id === old.concepto_id)) {
          await tx.contrato_dispersion_detalle.update({ where: { id: old.id }, data: { activo: false } });
        }
      }
      for (const [index, row] of dto.configuracion.entries()) {
        const receiver = receivers.find(r => r.id === row.receptor_dispersion_id)!;
        await tx.contrato_dispersion_detalle.upsert({ where: { contrato_id_concepto_id: { contrato_id: contratoId, concepto_id: row.concepto_id } }, create: { contrato_id: contratoId, concepto_id: row.concepto_id, beneficiario_id: receiver.usuario_id, receptor_dispersion_id: receiver.id, tipo_calculo: 'porcentaje', valor: new Prisma.Decimal(row.valor), base_calculo: 'monto_bruto', orden: index + 1, activo: true, creado_por: user.id }, update: { beneficiario_id: receiver.usuario_id, receptor_dispersion_id: receiver.id, tipo_calculo: 'porcentaje', valor: new Prisma.Decimal(row.valor), base_calculo: 'monto_bruto', orden: index + 1, activo: true } });
      }
      const auditBefore = prior.map(row => ({ concepto_id: row.concepto_id, concepto: row.conceptos_dispersion.nombre, receptor_dispersion_id: row.receptor_dispersion_id, porcentaje: row.valor.toString(), activo: row.activo }));
      await tx.historial_configuracion_dispersion.create({ data: { contrato_id: contratoId, cambiado_por: user.id, accion: 'actualizar', configuracion_anterior: auditBefore as unknown as Prisma.InputJsonValue, configuracion_nueva: dto.configuracion as unknown as Prisma.InputJsonValue } });
      return tx.contrato_dispersion_detalle.findMany({ where: { contrato_id: contratoId, activo: true }, include: { conceptos_dispersion: true, receptores_dispersion: { include: { usuarios_receptor: true } } }, orderBy: { orden: 'asc' } });
    });
  }

  async getConfiguracion(contratoId: string, user: UsuarioAutenticado) {
    this.ensureAdmin(user);
    if (!await this.prisma.contratos.findUnique({ where: { id: contratoId }, select: { id: true } })) throw new NotFoundException('Contrato no encontrado');
    return this.prisma.contrato_dispersion_detalle.findMany({ where: { contrato_id: contratoId, activo: true }, include: { conceptos_dispersion: true, receptores_dispersion: { include: { usuarios_receptor: true } } }, orderBy: { orden: 'asc' } });
  }

  async historyConfiguracion(contratoId: string, user: UsuarioAutenticado) {
    this.ensureAdmin(user);
    return this.prisma.historial_configuracion_dispersion.findMany({ where: { contrato_id: contratoId }, orderBy: { fecha_cambio: 'desc' }, include: { usuarios: { select: { id: true, nombre: true, apellido_paterno: true } } } });
  }

  async deactivateReceptor(id: string, user: UsuarioAutenticado) {
    this.ensureAdmin(user);
    const receiver = await this.prisma.receptores_dispersion.findUnique({ where: { id } });
    if (!receiver) throw new NotFoundException('Receptor no encontrado');
    if (await this.prisma.contrato_dispersion_detalle.count({ where: { receptor_dispersion_id: id, activo: true } })) throw new ConflictException('El receptor está asignado a una configuración activa');
    return this.prisma.receptores_dispersion.update({ where: { id }, data: { activo: false } });
  }

  async findComisiones(query: QueryComisionesDto, user: UsuarioAutenticado) {
    if (!user.activo || !['asesor', ...ADMIN].includes(user.roles.nombre)) throw new ForbiddenException();
    const where: Prisma.comisionesWhereInput = { ...(query.pago_id ? { pago_id: query.pago_id } : {}), ...(query.estado_id ? { estado_id: query.estado_id } : {}), ...(query.contrato_id ? { pagos: { contrato_id: query.contrato_id } } : {}) };
    if (user.roles.nombre === 'asesor') Object.assign(where, { beneficiario_id: user.id, conceptos_dispersion: { nombre: 'Asesor' }, pagos: { contratos: { asesor_id: user.id } } });
    const [data, total] = await Promise.all([this.prisma.comisiones.findMany({ where, skip: (query.page - 1) * query.limit, take: query.limit, orderBy: { fecha_calculo: 'desc' }, include: { conceptos_dispersion: true, estados_comisiones: true, pagos: { select: { id: true, fecha_pago: true, contratos: { select: { id: true, folio: true, asesor_id: true } } } } } }), this.prisma.comisiones.count({ where })]);
    return { data, page: query.page, limit: query.limit, total };
  }

  async disperse(id: string, dto: { comentario?: string }, user: UsuarioAutenticado) {
    this.ensureAdmin(user);
    return this.prisma.$transaction(async tx => {
      const commission = await tx.comisiones.findUnique({ where: { id }, include: { estados_comisiones: true } });
      if (!commission) throw new NotFoundException('Comisión no encontrada');
      if (commission.estados_comisiones.nombre !== ESTADO_PENDIENTE) throw new ConflictException('Solo se pueden dispersar comisiones pendientes');
      const next = await tx.estados_comisiones.findUnique({ where: { nombre: ESTADO_DISPERSADA } });
      if (!next) throw new ConflictException('Falta la migración de estados de comisiones');
      const updated = await tx.comisiones.updateMany({ where: { id, estado_id: commission.estado_id }, data: { estado_id: next.id } });
      if (updated.count !== 1) throw new ConflictException('El estado de la comisión cambió durante la operación');
      await tx.historial_estados_comisiones.create({ data: { comision_id: id, estado_anterior_id: commission.estado_id, estado_nuevo_id: next.id, cambiado_por: user.id, comentario: dto.comentario?.trim() || null } });
      return tx.comisiones.findUnique({ where: { id }, include: { conceptos_dispersion: true, estados_comisiones: true } });
    });
  }

  async generateForValidatedPayment(tx: Prisma.TransactionClient, paymentId: string, actorId: string) {
    const payment = await tx.pagos.findUnique({ where: { id: paymentId }, include: { contratos: { select: { id: true, asesor_id: true, seguimiento_m10: { select: { contrato_id: true } }, seguimiento_m40: { select: { contrato_id: true } }, seguimiento_m40_retroactiva: { select: { contrato_id: true } } } } } });
    if (!payment) throw new NotFoundException('Pago no encontrado');
    const configs = await tx.contrato_dispersion_detalle.findMany({ where: { contrato_id: payment.contratos.id, activo: true }, include: { conceptos_dispersion: true, receptores_dispersion: { include: { usuarios_receptor: true } } }, orderBy: { orden: 'asc' } });
    const imss = configs.some(c => c.conceptos_dispersion.nombre === 'IMSS');
    if (imss && !(payment.contratos.seguimiento_m10 || payment.contratos.seguimiento_m40 || payment.contratos.seguimiento_m40_retroactiva)) throw new ConflictException('IMSS no aplica a este contrato');
    const pending = await tx.estados_comisiones.findUnique({ where: { nombre: ESTADO_PENDIENTE } });
    const company = await tx.conceptos_dispersion.findFirst({ where: { es_remanente: true, activo: true } });
    if (!pending || !company) throw new ConflictException('Falta aplicar la migración de comisiones y conceptos de dispersión');
    let configuredTotal = new Prisma.Decimal(0); let assigned = new Prisma.Decimal(0);
    for (const config of configs) {
      if (config.tipo_calculo !== 'porcentaje' || config.base_calculo !== 'monto_bruto') throw new ConflictException('Configuración incompatible: solo se admite porcentaje sobre monto bruto');
      const pct = new Prisma.Decimal(config.valor); configuredTotal = configuredTotal.plus(pct);
      const amount = new Prisma.Decimal(payment.monto).mul(pct).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      assigned = assigned.plus(amount);
      if (amount.isZero()) continue;
      const receiver = config.receptores_dispersion;
      const name = receiver?.nombre_externo ?? [receiver?.usuarios_receptor?.nombre, receiver?.usuarios_receptor?.apellido_paterno, receiver?.usuarios_receptor?.apellido_materno].filter(Boolean).join(' ');
      const created = await tx.comisiones.create({ data: { pago_id: payment.id, monto_base: payment.monto, monto_comision: amount, estado_id: pending.id, concepto_id: config.concepto_id, contrato_dispersion_detalle_id: config.id, beneficiario_id: receiver?.usuario_id ?? null, receptor_dispersion_id: receiver?.id ?? null, receptor_nombre_snapshot: name || null, tipo_calculo: 'porcentaje', valor_aplicado: pct } });
      await tx.historial_estados_comisiones.create({ data: { comision_id: created.id, estado_anterior_id: null, estado_nuevo_id: pending.id, cambiado_por: actorId, comentario: 'Comisión generada al validar el pago' } });
    }
    if (configuredTotal.greaterThan(100)) throw new ConflictException('La configuración supera el 100%');
    const residual = new Prisma.Decimal(payment.monto).minus(assigned).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const remainderPct = new Prisma.Decimal(100).minus(configuredTotal);
    if (residual.lessThan(0)) throw new ConflictException('La configuración genera una distribución superior al pago');
    if (residual.greaterThan(0) || remainderPct.greaterThan(0)) {
      const created = await tx.comisiones.create({ data: { pago_id: payment.id, monto_base: payment.monto, monto_comision: residual, estado_id: pending.id, concepto_id: company.id, tipo_calculo: 'porcentaje', valor_aplicado: remainderPct } });
      await tx.historial_estados_comisiones.create({ data: { comision_id: created.id, estado_anterior_id: null, estado_nuevo_id: pending.id, cambiado_por: actorId, comentario: 'Remanente de empresa generado al validar el pago' } });
    }
  }

  private ensureAdmin(user: UsuarioAutenticado) { if (!user.activo || !ADMIN.includes(user.roles.nombre)) throw new ForbiddenException('Solo administración puede gestionar comisiones y dispersión'); }
  private handlePrismaError(error: unknown): never { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Ya existe un receptor o comisión con esa clave'); if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new NotFoundException('Registro relacionado no encontrado'); throw error; }
}
