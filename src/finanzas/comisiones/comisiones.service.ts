import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { StorageService } from '../evidencias/storage/storage.service';
import { UploadedEvidenceFile, validateEvidenceFile } from '../evidencias/evidence-file.validator';
import { ConfirmarDispersionDto } from './dto/confirmar-dispersion.dto';
import { CreateReceptorDispersionDto } from './dto/create-receptor-dispersion.dto';
import { SaveConfiguracionDispersionDto, QueryComisionesDto } from './dto/save-configuracion-dispersion.dto';

type UsuarioAutenticado = { id: string; activo: boolean; roles: { nombre: string } };
const ADMIN = ['administrador', 'administrador financiero'];
const ESTADO_PENDIENTE = 'Pendiente de dispersión';
const ESTADO_DISPERSADA = 'Dispersada';

@Injectable()
export class ComisionesService {
  private readonly logger = new Logger(ComisionesService.name);
  private readonly maxSizeBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    config: ConfigService,
  ) {
    this.maxSizeBytes = config.getOrThrow<number>('storage.maxFileSizeMb') * 1024 * 1024;
  }

  async createReceptor(dto: CreateReceptorDispersionDto, user: UsuarioAutenticado) {
    this.ensureAdmin(user);
    const [concept, account] = await Promise.all([
      this.prisma.conceptos_dispersion.findUnique({ where: { id: dto.concepto_id } }),
      dto.usuario_id ? this.prisma.usuarios.findUnique({ where: { id: dto.usuario_id }, include: { roles: true } }) : null,
    ]);
    if (!concept?.activo || concept.es_remanente) throw new BadRequestException('El concepto no admite receptores configurables');
    if (concept.nombre === 'Asesor') {
      if (!account?.activo || account.roles.nombre !== 'asesor' || dto.nombre_externo) throw new BadRequestException('El concepto requiere un usuario activo con rol asesor');
    } else if (['Director', 'Gerente', 'Bróker', 'Otro'].includes(concept.nombre)) {
      if (dto.usuario_id || !dto.nombre_externo?.trim()) throw new BadRequestException('El receptor manual requiere un nombre no vacío; omita el receptor en la configuración cuando sea opcional');
    } else if (concept.nombre === 'Referidor') {
      throw new ConflictException('Referidor requiere una relación identificable entre clientes; no se admite asignación manual');
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
    const contract = await this.prisma.contratos.findUnique({ where: { id: contratoId }, select: { id: true, asesor_id: true, cliente_id: true, servicios: { select: { codigo_folio: true } } } });
    if (!contract) throw new NotFoundException('Contrato no encontrado');
    const percentages = dto.configuracion.map(row => new Prisma.Decimal(row.valor));
    const total = percentages.reduce((sum, value) => sum.plus(value), new Prisma.Decimal(0));
    if (percentages.some(value => !value.isFinite() || value.lt(0) || value.gt(100) || !value.mul(2).isInteger()) || total.gt(100)) throw new BadRequestException('Los porcentajes deben ser de 0 a 100, avanzar en pasos de 0.5 y sumar como máximo 100');
    const concepts = await this.prisma.conceptos_dispersion.findMany({ where: { id: { in: dto.configuracion.map(x => x.concepto_id) }, activo: true } });
    if (concepts.length !== new Set(dto.configuracion.map(x => x.concepto_id)).size || concepts.some(x => x.es_remanente || x.tipo_destino === 'empresa')) throw new BadRequestException('Incluye únicamente conceptos activos que admiten configuración');
    const imssRow = dto.configuracion.find(x => concepts.find(c => c.id === x.concepto_id)?.nombre === 'IMSS');
    const imssRequired = ['M10', 'M40', 'M40R'].includes(contract.servicios.codigo_folio ?? '');
    if (imssRow && !imssRequired) throw new BadRequestException('IMSS solo se configura para Modalidad 10, Modalidad 40 o M40 Retroactiva');
    if (imssRequired && (!imssRow || new Prisma.Decimal(imssRow.valor).lte(0))) throw new BadRequestException('La modalidad requiere un porcentaje IMSS explícito mayor que cero');
    if (imssRow?.receptor_dispersion_id) throw new BadRequestException('IMSS no requiere receptor individual');
    for (const row of dto.configuracion) {
      const name = concepts.find(c => c.id === row.concepto_id)?.nombre;
      if (name === 'Referidor' && row.receptor_dispersion_id) throw new BadRequestException('Referidor se obtiene del cliente titular; no admite receptor arbitrario');
      if (name === 'Asesor' && !row.receptor_dispersion_id) throw new BadRequestException('Asesor requiere el receptor asignado al contrato');
      if (name === 'Otro' && !row.receptor_dispersion_id) throw new BadRequestException('Otro requiere una descripción o nombre del receptor');
      if (!['Asesor', 'Director', 'Gerente', 'Bróker', 'IMSS', 'Referidor', 'Otro'].includes(name ?? '')) throw new BadRequestException('El concepto no tiene una política de distribución autorizada');
    }
    if (dto.configuracion.some(row => concepts.find(c => c.id === row.concepto_id)?.nombre === 'Referidor')) {
      await this.ensureReferralFeatureReady(this.prisma);
    }
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "contratos" WHERE "id" = ${contratoId}::uuid FOR UPDATE`);
      if (dto.configuracion.some(row => concepts.find(c => c.id === row.concepto_id)?.nombre === 'Referidor')) {
        const titular = await tx.$queryRaw<Array<{ referido_por_cliente_id: string | null }>>(
          Prisma.sql`SELECT "referido_por_cliente_id" FROM "clientes" WHERE "id" = ${contract.cliente_id}::uuid FOR SHARE`,
        );
        if (!titular[0]?.referido_por_cliente_id) throw new ConflictException('El cliente titular no tiene un referidor identificado por UUID');
      }
      const receiverIds = [...new Set(dto.configuracion.map(row => row.receptor_dispersion_id).filter((id): id is string => !!id))].sort();
      for (const receiverId of receiverIds) {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "receptores_dispersion" WHERE "id" = ${receiverId}::uuid FOR UPDATE`);
      }
      const receivers = await tx.receptores_dispersion.findMany({ where: { id: { in: receiverIds }, activo: true }, include: { conceptos_dispersion: true, usuarios_receptor: { select: { activo: true, roles: { select: { nombre: true } } } } } });
      if (receivers.length !== receiverIds.length || dto.configuracion.some(row => { if (!row.receptor_dispersion_id) return false; const r = receivers.find(x => x.id === row.receptor_dispersion_id); return !r || r.concepto_id !== row.concepto_id || r.conceptos_dispersion.es_remanente; })) throw new BadRequestException('Cada receptor indicado debe estar activo y corresponder al concepto seleccionado');
      if (receivers.some(receiver => receiver.conceptos_dispersion.nombre !== 'Asesor' && (receiver.usuario_id || !receiver.nombre_externo?.trim()))) throw new BadRequestException('Los destinos manuales solo admiten nombre, no usuario');
      if (receivers.some(receiver => receiver.conceptos_dispersion.nombre === 'Asesor' && (receiver.usuario_id !== contract.asesor_id || !receiver.usuarios_receptor?.activo || receiver.usuarios_receptor.roles.nombre !== 'asesor'))) throw new BadRequestException('El receptor Asesor debe ser el asesor activo asignado al contrato');
      const prior = await tx.contrato_dispersion_detalle.findMany({ where: { contrato_id: contratoId, activo: true }, include: { conceptos_dispersion: true, receptores_dispersion: { include: { usuarios_receptor: true } } }, orderBy: { orden: 'asc' } });
      for (const old of prior) {
        if (!dto.configuracion.some(row => row.concepto_id === old.concepto_id)) {
          await tx.contrato_dispersion_detalle.update({ where: { id: old.id }, data: { activo: false } });
        }
      }
      for (const [index, row] of dto.configuracion.entries()) {
        const receiver = receivers.find(r => r.id === row.receptor_dispersion_id);
        await tx.contrato_dispersion_detalle.upsert({ where: { contrato_id_concepto_id: { contrato_id: contratoId, concepto_id: row.concepto_id } }, create: { contrato_id: contratoId, concepto_id: row.concepto_id, beneficiario_id: receiver?.usuario_id ?? null, receptor_dispersion_id: receiver?.id ?? null, tipo_calculo: 'porcentaje', valor: new Prisma.Decimal(row.valor), base_calculo: 'monto_bruto', orden: index + 1, activo: true, creado_por: user.id }, update: { beneficiario_id: receiver?.usuario_id ?? null, receptor_dispersion_id: receiver?.id ?? null, tipo_calculo: 'porcentaje', valor: new Prisma.Decimal(row.valor), base_calculo: 'monto_bruto', orden: index + 1, activo: true } });
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
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "receptores_dispersion" WHERE "id" = ${id}::uuid FOR UPDATE`);
      const receiver = await tx.receptores_dispersion.findUnique({ where: { id } });
      if (!receiver) throw new NotFoundException('Receptor no encontrado');
      if (await tx.contrato_dispersion_detalle.count({ where: { receptor_dispersion_id: id, activo: true } })) throw new ConflictException('El receptor está asignado a una configuración activa');
      return tx.receptores_dispersion.update({ where: { id }, data: { activo: false } });
    });
  }

  async findComisiones(query: QueryComisionesDto, user: UsuarioAutenticado) {
    if (!user.activo || !['asesor', ...ADMIN].includes(user.roles.nombre)) throw new ForbiddenException();
    const where: Prisma.comisionesWhereInput = { ...(query.pago_id ? { pago_id: query.pago_id } : {}), ...(query.estado_id ? { estado_id: query.estado_id } : {}), ...(query.contrato_id ? { pagos: { contrato_id: query.contrato_id } } : {}) };
    if (user.roles.nombre === 'asesor') {
      where.beneficiario_id = user.id;
      where.conceptos_dispersion = { nombre: 'Asesor' };
      where.AND = [{ pagos: { contratos: { asesor_id: user.id } } }];
    }
    const referralReady = await this.referralFeatureReady(this.prisma);
    const [data, total] = await Promise.all([this.prisma.comisiones.findMany({ where, skip: (query.page - 1) * query.limit, take: query.limit, orderBy: { fecha_calculo: 'desc' }, select: {
      id: true, pago_id: true, monto_base: true, monto_comision: true, estado_id: true, fecha_calculo: true,
      observaciones: true, beneficiario_id: true, concepto_id: true, contrato_dispersion_detalle_id: true,
      detalle_prenomina_id: true, receptor_dispersion_id: true, receptor_nombre_snapshot: true,
      ...(referralReady ? { receptor_cliente_id: true as const } : {}),
      tipo_calculo: true, valor_aplicado: true,
      conceptos_dispersion: true, estados_comisiones: true,
      historial_estados_comisiones: { orderBy: { fecha_cambio: 'asc' }, select: { cambiado_por: true, fecha_cambio: true, comentario: true } },
      pagos: { select: { id: true, fecha_pago: true, contratos: { select: { id: true, folio: true, asesor_id: true } } } },
    } }), this.prisma.comisiones.count({ where })]);
    return { data, page: query.page, limit: query.limit, total };
  }

  async disperse(id: string, dto: ConfirmarDispersionDto, file: UploadedEvidenceFile | undefined, user: UsuarioAutenticado) {
    this.ensureAdmin(user);
    const validated = validateEvidenceFile(file, this.maxSizeBytes);
    const reference = dto.referencia_transferencia.trim();
    const hash = createHash('sha256').update(validated.buffer).digest('hex');
    const previous = await this.prisma.dispersiones_comision.findUnique({
      where: { idempotency_key: dto.idempotency_key },
      include: { comisiones: { select: { monto_comision: true } } },
    });
    if (previous) return this.sameDispersion(previous, id, reference, hash);

    const storedKey = await this.storage.save(validated.buffer, validated.contentType);
    let keepFile = false;
    try {
      const result = await this.prisma.$transaction(async tx => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "comisiones" WHERE "id" = ${id}::uuid FOR UPDATE`);
        const existing = await tx.dispersiones_comision.findUnique({
          where: { idempotency_key: dto.idempotency_key },
          include: { comisiones: { select: { monto_comision: true } } },
        });
        if (existing) {
          return { row: this.sameDispersion(existing, id, reference, hash), created: false };
        }
        const commission = await tx.comisiones.findUnique({
          where: { id },
          select: {
            id: true, estado_id: true,
            estados_comisiones: { select: { nombre: true } },
            conceptos_dispersion: { select: { nombre: true } },
            receptores_dispersion: { select: { activo: true, usuario_id: true, usuarios_receptor: { select: { activo: true } } } },
            pagos: { select: { estados_pago: { select: { nombre: true } }, contratos: { select: { asesor_id: true } } } },
          },
        });
        if (!commission) throw new NotFoundException('Comisión no encontrada');
        if (commission.estados_comisiones.nombre !== ESTADO_PENDIENTE) throw new ConflictException('Solo se dispersan comisiones pendientes');
        if (commission.conceptos_dispersion.nombre !== 'Asesor') throw new ConflictException('El destino todavía no tiene una política de dispersión autorizada');
        if (commission.pagos.estados_pago?.nombre !== 'Validado') throw new ConflictException('El pago de origen no está Validado');
        if (!commission.receptores_dispersion?.activo || !commission.receptores_dispersion.usuarios_receptor?.activo || commission.receptores_dispersion.usuario_id !== commission.pagos.contratos.asesor_id) {
          throw new ConflictException('El receptor no es el asesor activo del contrato');
        }
        const next = await tx.estados_comisiones.findUnique({ where: { nombre: ESTADO_DISPERSADA }, select: { id: true } });
        if (!next) throw new ConflictException('Falta el estado Dispersada');
        const row = await tx.dispersiones_comision.create({
          data: {
            comision_id: id,
            idempotency_key: dto.idempotency_key,
            referencia_transferencia: reference,
            confirmado_por: user.id,
            comprobante_path: storedKey,
            comprobante_sha256: hash,
            comprobante_tamano_bytes: validated.size,
          },
          include: { comisiones: { select: { monto_comision: true } } },
        });
        const changed = await tx.comisiones.updateMany({ where: { id, estado_id: commission.estado_id }, data: { estado_id: next.id } });
        if (changed.count !== 1) throw new ConflictException('La comisión cambió durante la confirmación');
        await tx.historial_estados_comisiones.create({
          data: { comision_id: id, estado_anterior_id: commission.estado_id, estado_nuevo_id: next.id, cambiado_por: user.id, comentario: 'Dispersión total confirmada con referencia y comprobante privado' },
        });
        return { row: this.dispersionResponse(row), created: true };
      });
      keepFile = result.created;
      return result.row;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const winner = await this.prisma.dispersiones_comision.findUnique({
          where: { idempotency_key: dto.idempotency_key },
          include: { comisiones: { select: { monto_comision: true } } },
        });
        if (winner) return this.sameDispersion(winner, id, reference, hash);
        throw new ConflictException('La comisión ya tiene otra dispersión confirmada');
      }
      throw error;
    } finally {
      if (!keepFile) {
        try { await this.storage.delete(storedKey); }
        catch { this.logger.error('No se pudo compensar el comprobante de una dispersión no registrada'); }
      }
    }
  }

  async administrativeDistribution(paymentId: string, user: UsuarioAutenticado, selected?: string[], general = false) {
    this.ensureAdmin(user);
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "pagos" WHERE "id" = ${paymentId}::uuid FOR UPDATE`);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "comisiones" WHERE "pago_id" = ${paymentId}::uuid ORDER BY "id" FOR UPDATE`);
      const payment = await tx.pagos.findUnique({ where: { id: paymentId }, select: { estados_pago: { select: { nombre: true } } } });
      if (!payment) throw new NotFoundException('Pago no encontrado');
      const rows = await tx.comisiones.findMany({ where: { pago_id: paymentId }, orderBy: { id: 'asc' },
        include: { estados_comisiones: true, conceptos_dispersion: true, dispersiones_comision: true } });
      const reserved = await tx.cortes_pagos_reservados.count({ where: { pago_id: paymentId } });
      const preview = rows.map(row => ({ id: row.id, concepto: row.conceptos_dispersion.nombre,
        receptor: row.conceptos_dispersion.nombre === 'Referidor' ? 'Referidor' : row.receptor_nombre_snapshot,
        porcentaje: row.valor_aplicado.toString(), importe: row.monto_comision.toFixed(2), estado: row.estados_comisiones.nombre,
        bloqueo: row.estados_comisiones.nombre === ESTADO_DISPERSADA ? 'Ya dispersada' :
          row.estados_comisiones.nombre !== ESTADO_PENDIENTE ? 'Estado no elegible' :
          payment.estados_pago?.nombre !== 'Validado' ? 'Pago no validado' :
          reserved ? 'Pago reservado en un corte' : row.detalle_prenomina_id ? 'Incluida en prenomina' :
          row.dispersiones_comision ? 'Tiene transferencia confirmada' : null }));
      if (!selected) return { pago_id: paymentId, conceptos: preview };
      const eligibleIds = preview.filter(r => r.estado !== ESTADO_DISPERSADA).map(r => r.id);
      if (!general && selected.length !== 1) throw new ConflictException('Selecciona un concepto para confirmacion individual');
      if (general && (selected.length !== eligibleIds.length || eligibleIds.some(id => !selected.includes(id)))) {
        throw new ConflictException('La distribucion cambio; consulta nuevamente la vista previa');
      }
      const targets = selected.map(id => preview.find(r => r.id === id));
      if (targets.some(r => !r || r.bloqueo)) throw new ConflictException({ message: 'No se confirmo ningun concepto', conceptos: targets });
      const next = await tx.estados_comisiones.findUnique({ where: { nombre: ESTADO_DISPERSADA } });
      if (!next) throw new ConflictException('Falta el estado Dispersada');
      for (const target of targets) {
        const row = rows.find(r => r.id === target!.id)!;
        const changed = await tx.comisiones.updateMany({ where: { id: row.id, estado_id: row.estado_id }, data: { estado_id: next.id } });
        if (changed.count !== 1) throw new ConflictException('La comision cambio durante la confirmacion');
        await tx.historial_estados_comisiones.create({ data: { comision_id: row.id,
          estado_anterior_id: row.estado_id, estado_nuevo_id: next.id, cambiado_por: user.id,
          comentario: JSON.stringify({ operacion: 'confirmacion_administrativa', pago_id: paymentId,
            importe: target!.importe, porcentaje: target!.porcentaje, concepto: target!.concepto,
            receptor: target!.receptor, alcance: general ? 'general' : 'individual' }) } });
      }
      return { pago_id: paymentId, confirmadas: selected, operacion: 'confirmacion_administrativa' };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async downloadDisbursementProof(id: string, user: UsuarioAutenticado) {
    this.ensureAdmin(user);
    const row = await this.prisma.dispersiones_comision.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Dispersión no encontrada');
    const object = await this.storage.get(row.comprobante_path);
    const contentType = row.comprobante_path.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
    return { object, contentType, fileName: `comprobante-dispersion-${row.id}${contentType === 'application/pdf' ? '.pdf' : '.jpg'}` };
  }

  private sameDispersion(row: Prisma.dispersiones_comisionGetPayload<{ include: { comisiones: { select: { monto_comision: true } } } }>, commissionId: string, reference: string, hash: string) {
    if (row.comision_id !== commissionId || row.referencia_transferencia !== reference || row.comprobante_sha256 !== hash) {
      throw new ConflictException('La clave de idempotencia pertenece a una operación diferente');
    }
    return this.dispersionResponse(row);
  }

  private dispersionResponse(row: Prisma.dispersiones_comisionGetPayload<{ include: { comisiones: { select: { monto_comision: true } } } }>) {
    return {
      id: row.id,
      comision_id: row.comision_id,
      idempotency_key: row.idempotency_key,
      referencia_transferencia: row.referencia_transferencia,
      confirmado_por: row.confirmado_por,
      confirmado_en: row.confirmado_en,
      comprobante_sha256: row.comprobante_sha256,
      comprobante_tamano_bytes: row.comprobante_tamano_bytes,
      monto_confirmado: row.comisiones.monto_comision.toFixed(2),
    };
  }

  async generateForValidatedPayment(tx: Prisma.TransactionClient, paymentId: string, actorId: string) {
    const payment = await tx.pagos.findUnique({
      where: { id: paymentId },
      include: {
        estados_pago: { select: { nombre: true } },
        contratos: { select: { id: true, asesor_id: true, cliente_id: true, servicios: { select: { codigo_folio: true } } } },
      },
    });
    if (!payment) throw new NotFoundException('Pago no encontrado');
    if (payment.estados_pago?.nombre !== 'Validado') throw new ConflictException('Solo un pago Validado puede generar comisiones');
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "contratos" WHERE "id" = ${payment.contratos.id}::uuid FOR UPDATE`);
    const configs = await tx.contrato_dispersion_detalle.findMany({ where: { contrato_id: payment.contratos.id, activo: true }, include: { conceptos_dispersion: true, receptores_dispersion: { include: { usuarios_receptor: true } } }, orderBy: { orden: 'asc' } });
    let referidor: { id: string; nombre: string } | null = null;
    if (configs.some(c => c.conceptos_dispersion.nombre === 'Referidor')) {
      await this.ensureReferralFeatureReady(tx);
      const titular = await tx.$queryRaw<Array<{ referido_por_cliente_id: string | null }>>(
        Prisma.sql`SELECT "referido_por_cliente_id" FROM "clientes" WHERE "id" = ${payment.contratos.cliente_id}::uuid FOR SHARE`,
      );
      const referidorId = titular[0]?.referido_por_cliente_id;
      if (!referidorId) throw new ConflictException('El cliente titular no tiene un referidor identificado por UUID');
      const rows = await tx.$queryRaw<Array<{ id: string; nombre: string; apellido_paterno: string; apellido_materno: string | null }>>(
        Prisma.sql`SELECT "id", "nombre", "apellido_paterno", "apellido_materno" FROM "clientes" WHERE "id" = ${referidorId}::uuid FOR SHARE`,
      );
      if (!rows.length) throw new ConflictException('El cliente referidor ya no existe');
      referidor = { id: rows[0].id, nombre: [rows[0].nombre, rows[0].apellido_paterno, rows[0].apellido_materno].filter(Boolean).join(' ') };
    }
    const imss = configs.find(c => c.conceptos_dispersion.nombre === 'IMSS');
    const imssRequired = ['M10', 'M40', 'M40R'].includes(payment.contratos.servicios.codigo_folio ?? '');
    if (imss && !imssRequired) throw new ConflictException('IMSS no aplica a este contrato');
    if (imssRequired && (!imss || new Prisma.Decimal(imss.valor).lte(0))) throw new ConflictException('El pago no puede validarse sin un porcentaje IMSS configurado explícitamente');
    const pending = await tx.estados_comisiones.findUnique({ where: { nombre: ESTADO_PENDIENTE } });
    const company = await tx.conceptos_dispersion.findFirst({ where: { es_remanente: true, activo: true } });
    if (!pending || !company) throw new ConflictException('Falta aplicar la migración de comisiones y conceptos de dispersión');
    let configuredTotal = new Prisma.Decimal(0); let assigned = new Prisma.Decimal(0);
    for (const config of configs) {
      if (config.tipo_calculo !== 'porcentaje' || config.base_calculo !== 'monto_bruto') throw new ConflictException('Configuración incompatible: solo se admite porcentaje sobre monto bruto');
      const pct = new Prisma.Decimal(config.valor); configuredTotal = configuredTotal.plus(pct);
      const amount = new Prisma.Decimal(payment.monto).mul(pct).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      assigned = assigned.plus(amount);
      const receiver = config.receptores_dispersion;
      const nameOfConcept = config.conceptos_dispersion.nombre;
      if (nameOfConcept === 'Referidor' && (receiver || !referidor)) throw new ConflictException('Referidor debe proceder de la relación del cliente titular');
      if (receiver && !receiver.activo) throw new ConflictException('La configuración usa un receptor inactivo');
      if (nameOfConcept === 'Asesor' && !receiver) throw new ConflictException('La configuración Asesor no tiene receptor');
      if (nameOfConcept === 'Otro' && !receiver?.nombre_externo?.trim()) throw new ConflictException('Otro requiere descripción del receptor');
      if (nameOfConcept === 'IMSS' && receiver) throw new ConflictException('IMSS no admite receptor individual');
      if (!['Asesor', 'Director', 'Gerente', 'Bróker', 'IMSS', 'Referidor', 'Otro'].includes(nameOfConcept)) throw new ConflictException('Concepto sin política de distribución autorizada');
      if (nameOfConcept !== 'Asesor' && receiver?.usuario_id) throw new ConflictException('El receptor manual no puede ser un usuario');
      if (nameOfConcept === 'Asesor' && (receiver?.usuario_id !== payment.contratos.asesor_id || !receiver?.usuarios_receptor?.activo)) throw new ConflictException('El receptor Asesor no coincide con el asesor activo del contrato');
      if (amount.isZero()) continue;
      const name = nameOfConcept === 'Referidor' ? referidor!.nombre : receiver?.nombre_externo ?? [receiver?.usuarios_receptor?.nombre, receiver?.usuarios_receptor?.apellido_paterno, receiver?.usuarios_receptor?.apellido_materno].filter(Boolean).join(' ');
      const created = await tx.comisiones.create({ data: { pago_id: payment.id, monto_base: payment.monto, monto_comision: amount, estado_id: pending.id, concepto_id: config.concepto_id, contrato_dispersion_detalle_id: config.id, beneficiario_id: receiver?.usuario_id ?? null, receptor_dispersion_id: receiver?.id ?? null, ...(nameOfConcept === 'Referidor' ? { receptor_cliente_id: referidor!.id } : {}), receptor_nombre_snapshot: name || null, tipo_calculo: 'porcentaje', valor_aplicado: pct }, select: { id: true } });
      await tx.historial_estados_comisiones.create({ data: { comision_id: created.id, estado_anterior_id: null, estado_nuevo_id: pending.id, cambiado_por: actorId, comentario: 'Comisión generada al validar el pago' } });
    }
    if (configuredTotal.greaterThan(100)) throw new ConflictException('La configuración supera el 100%');
    const residual = new Prisma.Decimal(payment.monto).minus(assigned).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const remainderPct = new Prisma.Decimal(100).minus(configuredTotal);
    if (residual.lessThan(0)) throw new ConflictException('La configuración genera una distribución superior al pago');
    if (residual.greaterThan(0) || remainderPct.greaterThan(0)) {
      const created = await tx.comisiones.create({ data: { pago_id: payment.id, monto_base: payment.monto, monto_comision: residual, estado_id: pending.id, concepto_id: company.id, tipo_calculo: 'porcentaje', valor_aplicado: remainderPct }, select: { id: true } });
      await tx.historial_estados_comisiones.create({ data: { comision_id: created.id, estado_anterior_id: null, estado_nuevo_id: pending.id, cambiado_por: actorId, comentario: 'Remanente de empresa generado al validar el pago' } });
    }
  }

  private ensureAdmin(user: UsuarioAutenticado) { if (!user.activo || !ADMIN.includes(user.roles.nombre)) throw new ForbiddenException('Solo administración puede gestionar comisiones y dispersión'); }
  private async referralFeatureReady(db: PrismaService | Prisma.TransactionClient): Promise<boolean> {
    const rows = await db.$queryRaw<Array<{ ready: boolean }>>(
      Prisma.sql`SELECT to_regclass('public.historial_referidor_cliente') IS NOT NULL AS ready`,
    );
    return rows[0]?.ready === true;
  }
  private async ensureReferralFeatureReady(db: PrismaService | Prisma.TransactionClient) {
    if (!await this.referralFeatureReady(db)) throw new ConflictException('La relación de referidores requiere la migración pendiente');
  }
  private handlePrismaError(error: unknown): never { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Ya existe un receptor o comisión con esa clave'); if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new NotFoundException('Registro relacionado no encontrado'); throw error; }
}
