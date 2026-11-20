import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreatePagoProgramadoDto } from './dto/create-pago-programado.dto';
import { ChangeEstadoPagoProgramadoDto } from './dto/change-estado-pago-programado.dto';
import { CancelPagoProgramadoDto } from './dto/cancel-pago-programado.dto';
import { QueryPagosProgramadosDto } from './dto/query-pagos-programados.dto';
import { UpdatePagoProgramadoDto } from './dto/update-pago-programado.dto';
import { scheduledPaymentBalance, ScheduledPaymentBalanceInput } from './scheduled-payment-balance';
import { cancunToday, operationalScheduledState } from './scheduled-payment-status';

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
  justificacion_duplicado: true,
  motivo_penalizacion: true,
  clasificacion_tope_apd: true,
  monto_recibido_beneficiario_apd: true,
  cancelado_por: true,
  cancelado_en: true,
  motivo_cancelacion: true,
  contratos: {
    select: {
      id: true,
      folio: true,
      cliente_id: true,
      asesor_id: true,
      servicios: { select: { id: true, nombre: true } },
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
      estados_pago: { select: { nombre: true } },
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
    if (query.fecha_desde || query.fecha_hasta) {
      where.fecha_esperada = {
        ...(query.fecha_desde ? { gte: query.fecha_desde } : {}),
        ...(query.fecha_hasta ? { lte: query.fecha_hasta } : {}),
      };
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    if (query.estado_id) {
      return this.findAllByOperationalState(query, usuario, page, limit);
    }
    const [data, total, stateIds] = await Promise.all([
      this.prisma.pagos_programados.findMany({
        where,
        select: programadoSelect,
        orderBy: [{ fecha_esperada: 'asc' }, { numero_pago: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.pagos_programados.count({ where }),
      this.findStateIds(),
    ]);

    return {
      data: data.map((row) => this.withBalance(row, stateIds)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, usuario: UsuarioAutenticado) {
    this.ensureRole(usuario);
    const where: Prisma.pagos_programadosWhereInput =
      usuario.roles.nombre === 'asesor'
        ? { id, contratos: { is: { asesor_id: usuario.id } } }
        : { id };
    const [programado, stateIds] = await Promise.all([this.prisma.pagos_programados.findFirst({
      where,
      select: programadoSelect,
    }), this.findStateIds()]);
    if (!programado) throw new NotFoundException('Pago programado no encontrado');
    return this.withBalance(programado, stateIds);
  }

  async create(dto: CreatePagoProgramadoDto, usuario: UsuarioAutenticado) {
    this.ensureRole(usuario);
    if (!usuario.activo) throw new ForbiddenException('La cuenta no está activa');
    this.validateAmount(dto.monto_esperado);
    this.validateBeneficiaryAmount(dto.monto_recibido_beneficiario_apd);
    if (!dto.fecha_vencimiento || Number.isNaN(dto.fecha_vencimiento.getTime())) {
      throw new BadRequestException('fecha_vencimiento es obligatoria');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
      const [contrato, tipo] = await Promise.all([
        tx.contratos.findUnique({
          where: { id: dto.contrato_id },
          select: { id: true, asesor_id: true, servicios: { select: { codigo_folio: true } } },
        }),
        dto.tipo_cobro_id
          ? tx.tipos_cobro.findUnique({
              where: { id: dto.tipo_cobro_id },
              select: { id: true, activo: true, nombre: true },
            })
          : Promise.resolve(null),
      ]);

      if (!contrato) throw new BadRequestException('El contrato no existe');
      this.ensureContractScope(contrato.asesor_id, usuario);
      if (dto.tipo_cobro_id && (!tipo || !tipo.activo)) {
        throw new BadRequestException('El tipo de cobro no existe o está inactivo');
      }
      this.ensurePenaltyRules(tipo?.nombre, contrato.servicios.codigo_folio, dto.monto_esperado, dto.fecha_esperada, dto.motivo_penalizacion);
      this.ensureApdFields(contrato.servicios.codigo_folio, dto.clasificacion_tope_apd, dto.monto_recibido_beneficiario_apd);
      await this.ensureDuplicateAllowed(tx, dto.contrato_id, dto.fecha_esperada, dto.monto_esperado, dto.tipo_cobro_id ?? null, dto.justificacion_duplicado);
      const created = await tx.pagos_programados.create({
        data: {
          contrato_id: contrato.id,
          tipo_cobro_id: dto.tipo_cobro_id ?? null,
          numero_pago: dto.numero_pago,
          fecha_esperada: dto.fecha_esperada ?? null,
          fecha_vencimiento: dto.fecha_vencimiento,
          monto_esperado: this.toDecimal(dto.monto_esperado),
          periodo: dto.periodo ?? null,
          justificacion_duplicado: dto.justificacion_duplicado?.trim() || null,
          motivo_penalizacion: dto.motivo_penalizacion?.trim() || null,
          clasificacion_tope_apd: dto.clasificacion_tope_apd ?? null,
          monto_recibido_beneficiario_apd: this.toDecimal(dto.monto_recibido_beneficiario_apd),
        },
        select: programadoSelect,
      });
      return this.withBalance(created, await this.findStateIds(tx));
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
    this.validateBeneficiaryAmount(dto.monto_recibido_beneficiario_apd);
    if (dto.fecha_vencimiento === null) {
      throw new BadRequestException('No se puede retirar fecha_vencimiento');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "pagos_programados" WHERE "id" = ${id}::uuid FOR UPDATE`,
        );
        const actual = await tx.pagos_programados.findUnique({
          where: { id },
          select: {
            id: true, contrato_id: true, tipo_cobro_id: true, monto_esperado: true, fecha_esperada: true,
            justificacion_duplicado: true, motivo_penalizacion: true,
            clasificacion_tope_apd: true, monto_recibido_beneficiario_apd: true,
            contratos: { select: { asesor_id: true, servicios: { select: { codigo_folio: true } } } },
          },
        });
        if (!actual) throw new NotFoundException('Pago programado no encontrado');
        this.ensureContractScope(actual.contratos.asesor_id, usuario);
        const validatedCount = await tx.pagos.count({
          where: { pago_programado_id: id, estados_pago: { is: { nombre: 'Validado' } } },
        });
        if (validatedCount > 0) {
          throw new ConflictException('No se puede editar una obligación con abonos validados');
        }
        if (dto.contrato_id && dto.contrato_id !== actual.contrato_id) {
          throw new BadRequestException('No se puede cambiar el contrato asociado');
        }

        if (dto.tipo_cobro_id) {
          const tipo = await tx.tipos_cobro.findUnique({
            where: { id: dto.tipo_cobro_id },
            select: { id: true, activo: true, nombre: true },
          });
          if (!tipo || !tipo.activo) {
            throw new BadRequestException('El tipo de cobro no existe o está inactivo');
          }
        }
        const nextTypeId = dto.tipo_cobro_id !== undefined ? dto.tipo_cobro_id : actual.tipo_cobro_id;
        const nextType = nextTypeId
          ? await tx.tipos_cobro.findUnique({ where: { id: nextTypeId }, select: { nombre: true } })
          : null;
        this.ensurePenaltyRules(
          nextType?.nombre,
          actual.contratos.servicios.codigo_folio,
          dto.monto_esperado !== undefined ? dto.monto_esperado : actual.monto_esperado,
          dto.fecha_esperada !== undefined ? dto.fecha_esperada : actual.fecha_esperada,
          dto.motivo_penalizacion !== undefined ? dto.motivo_penalizacion : actual.motivo_penalizacion,
        );
        this.ensureApdFields(
          actual.contratos.servicios.codigo_folio,
          dto.clasificacion_tope_apd !== undefined ? dto.clasificacion_tope_apd : actual.clasificacion_tope_apd,
          dto.monto_recibido_beneficiario_apd !== undefined ? dto.monto_recibido_beneficiario_apd : actual.monto_recibido_beneficiario_apd,
        );
        await this.ensureDuplicateAllowed(
          tx, actual.contrato_id,
          dto.fecha_esperada !== undefined ? dto.fecha_esperada : actual.fecha_esperada,
          dto.monto_esperado !== undefined ? dto.monto_esperado : actual.monto_esperado,
          nextTypeId,
          dto.justificacion_duplicado !== undefined ? dto.justificacion_duplicado : actual.justificacion_duplicado,
          id,
        );
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
        if (dto.justificacion_duplicado !== undefined) data.justificacion_duplicado = dto.justificacion_duplicado?.trim() || null;
        if (dto.motivo_penalizacion !== undefined) data.motivo_penalizacion = dto.motivo_penalizacion?.trim() || null;
        if (dto.clasificacion_tope_apd !== undefined) data.clasificacion_tope_apd = dto.clasificacion_tope_apd;
        if (dto.monto_recibido_beneficiario_apd !== undefined) data.monto_recibido_beneficiario_apd = this.toDecimal(dto.monto_recibido_beneficiario_apd);
        const updated = await tx.pagos_programados.update({
          where: { id },
          data,
          select: programadoSelect,
        });
        return this.withBalance(updated, await this.findStateIds(tx));
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async changeState(
    _id: string,
    _dto: ChangeEstadoPagoProgramadoDto,
    usuario: UsuarioAutenticado,
  ) {
    this.ensureRole(usuario);
    if (!['administrador', 'administrador financiero'].includes(usuario.roles.nombre)) {
      throw new ForbiddenException('Solo administración puede cambiar el estado');
    }
    if (!usuario.activo) throw new ForbiddenException('La cuenta no está activa');
    throw new ConflictException(
      'La asignación manual de estados está deshabilitada; los estados operativos se calculan y la cancelación requiere auditoría autorizada',
    );
  }

  async cancel(id: string, dto: CancelPagoProgramadoDto, usuario: UsuarioAutenticado) {
    this.ensureRole(usuario);
    if (!['administrador', 'administrador financiero'].includes(usuario.roles.nombre) || !usuario.activo) {
      throw new ForbiddenException('Solo administración activa puede cancelar obligaciones');
    }
    const motive = dto.motivo?.trim();
    if (!motive) throw new BadRequestException('La cancelación requiere un motivo');
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "pagos_programados" WHERE "id" = ${id}::uuid FOR UPDATE`);
        const actual = await tx.pagos_programados.findUnique({
          where: { id },
          select: { id: true, estado_id: true, estados_pago_programado: { select: { nombre: true } } },
        });
        if (!actual) throw new NotFoundException('Pago programado no encontrado');
        if (actual.estados_pago_programado?.nombre === 'Cancelado') {
          throw new ConflictException('La obligación ya está cancelada');
        }
        if (await tx.pagos.count({ where: { pago_programado_id: id } })) {
          throw new ConflictException('No se puede cancelar una obligación con pagos vinculados');
        }
        const state = await tx.estados_pago_programado.findUnique({
          where: { nombre: 'Cancelado' }, select: { id: true },
        });
        if (!state) throw new ConflictException('Falta configurar el estado Cancelado');
        const changed = await tx.pagos_programados.updateMany({
          where: { id, estado_id: actual.estado_id },
          data: {
            estado_id: state.id, cancelado_por: usuario.id,
            cancelado_en: new Date(), motivo_cancelacion: motive,
          },
        });
        if (changed.count !== 1) throw new ConflictException('La obligación cambió durante la cancelación');
        const updated = await tx.pagos_programados.findUniqueOrThrow({ where: { id }, select: programadoSelect });
        return this.withBalance(updated, await this.findStateIds(tx));
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

  private withBalance<T extends ScheduledPaymentBalanceInput & { fecha_vencimiento: Date | null }>(row: T, stateIds: Map<string, number>) {
    const balance = scheduledPaymentBalance(row);
    const name = operationalScheduledState(row.estados_pago_programado?.nombre ?? null, row.fecha_vencimiento, balance);
    return { ...row, ...balance, estado_operativo: name ? { id: stateIds.get(name) ?? null, nombre: name } : null };
  }

  private async findStateIds(db: PrismaService | Prisma.TransactionClient = this.prisma) {
    const rows = await db.estados_pago_programado.findMany({
      where: { nombre: { in: ['Pendiente', 'Cubierto', 'Vencido', 'Cancelado'] } },
      select: { id: true, nombre: true },
    });
    return new Map(rows.map((row) => [row.nombre, row.id]));
  }

  private async findAllByOperationalState(query: QueryPagosProgramadosDto, usuario: UsuarioAutenticado, page: number, limit: number) {
    const target = await this.prisma.estados_pago_programado.findUnique({
      where: { id: query.estado_id }, select: { nombre: true },
    });
    if (!target || !['Pendiente', 'Cubierto', 'Vencido', 'Cancelado'].includes(target.nombre)) {
      throw new BadRequestException('El estado operativo solicitado no existe');
    }
    const conditions: Prisma.Sql[] = [];
    if (usuario.roles.nombre === 'asesor') conditions.push(Prisma.sql`c."asesor_id" = ${usuario.id}::uuid`);
    if (query.contrato_id) conditions.push(Prisma.sql`p."contrato_id" = ${query.contrato_id}::uuid`);
    if (query.tipo_cobro_id) conditions.push(Prisma.sql`p."tipo_cobro_id" = ${query.tipo_cobro_id}`);
    if (query.fecha_desde) conditions.push(Prisma.sql`p."fecha_esperada" >= ${query.fecha_desde}::date`);
    if (query.fecha_hasta) conditions.push(Prisma.sql`p."fecha_esperada" <= ${query.fecha_hasta}::date`);
    if (query.q?.trim()) conditions.push(Prisma.sql`c."folio" ILIKE ${`%${query.q.trim()}%`}`);
    const filters = conditions.length ? Prisma.join(conditions, ' AND ') : Prisma.sql`TRUE`;
    const today = cancunToday();
    const status = Prisma.sql`CASE
      WHEN s."nombre" = 'Cancelado' THEN 'Cancelado'
      WHEN p."monto_esperado" IS NULL OR p."monto_esperado" < 0 OR p."fecha_vencimiento" IS NULL OR v."total" > p."monto_esperado" THEN NULL
      WHEN v."total" = p."monto_esperado" THEN 'Cubierto'
      WHEN p."fecha_vencimiento" < ${today}::date THEN 'Vencido'
      ELSE 'Pendiente' END`;
    const base = Prisma.sql`FROM "pagos_programados" p
      JOIN "contratos" c ON c."id" = p."contrato_id"
      LEFT JOIN "estados_pago_programado" s ON s."id" = p."estado_id"
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(pay."monto"), 0) AS "total"
        FROM "pagos" pay JOIN "estados_pago" ep ON ep."id" = pay."estado_pago_id"
        WHERE pay."pago_programado_id" = p."id" AND ep."nombre" = 'Validado'
      ) v ON TRUE
      WHERE ${filters} AND (${status}) = ${target.nombre}`;
    const offset = (page - 1) * limit;
    const [ids, count, stateIds] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT p."id" ${base} ORDER BY p."fecha_esperada" ASC NULLS FIRST, p."numero_pago" ASC, p."id" ASC LIMIT ${limit} OFFSET ${offset}`),
      this.prisma.$queryRaw<{ total: number }[]>(Prisma.sql`SELECT COUNT(*)::int AS "total" ${base}`),
      this.findStateIds(),
    ]);
    const rows = ids.length ? await this.prisma.pagos_programados.findMany({
      where: { id: { in: ids.map((row) => row.id) } }, select: programadoSelect,
    }) : [];
    const byId = new Map(rows.map((row) => [row.id, row]));
    const data = ids.map((row) => byId.get(row.id)).filter((row): row is NonNullable<typeof row> => !!row)
      .map((row) => this.withBalance(row, stateIds));
    const total = count[0]?.total ?? 0;
    return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
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

  private validateBeneficiaryAmount(value?: string | null) {
    if (value === undefined || value === null) return;
    const amount = new Prisma.Decimal(value);
    if (!amount.isFinite() || amount.lt(0) || amount.decimalPlaces() > 2 || amount.gt('9999999999.99')) {
      throw new BadRequestException('monto_recibido_beneficiario_apd no es válido');
    }
  }

  private ensureApdFields(serviceCode: string | null, classification: string | null | undefined, beneficiaryAmount: string | Prisma.Decimal | null | undefined) {
    if (serviceCode !== 'APD' && (classification != null || beneficiaryAmount != null)) {
      throw new BadRequestException('La clasificación y el monto del beneficiario solo corresponden a APD');
    }
  }

  private async ensureDuplicateAllowed(
    tx: Prisma.TransactionClient,
    contractId: string,
    expectedDate: Date | null | undefined,
    expectedAmount: string | Prisma.Decimal | null | undefined,
    collectionTypeId: number | null,
    justification: string | null | undefined,
    excludeId?: string,
  ) {
    if (!expectedDate || expectedAmount == null) return;
    const amount = new Prisma.Decimal(expectedAmount);
    const key = `${contractId}|${expectedDate.toISOString().slice(0, 10)}|${amount.toFixed(2)}`;
    await tx.$queryRaw(Prisma.sql`SELECT 1::int AS "locked" FROM (SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))) lock_result`);
    const matches = await tx.pagos_programados.findMany({
      where: {
        contrato_id: contractId,
        fecha_esperada: expectedDate,
        monto_esperado: amount,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { tipo_cobro_id: true },
    });
    const sameConceptOrUnknown = matches.some((match) =>
      match.tipo_cobro_id === null || collectionTypeId === null || match.tipo_cobro_id === collectionTypeId,
    );
    if (sameConceptOrUnknown && !justification?.trim()) {
      throw new ConflictException('La programación coincidente requiere justificación');
    }
  }

  private toDecimal(value?: string | null) {
    return value === undefined || value === null ? null : new Prisma.Decimal(value);
  }

  private ensurePenaltyRules(
    typeName: string | undefined,
    serviceCode: string | null,
    amount: string | Prisma.Decimal | null | undefined,
    expectedDate: Date | null | undefined,
    motive: string | null | undefined,
  ) {
    if (!typeName || this.normalize(typeName) !== 'penalizacion') {
      if (motive?.trim()) throw new BadRequestException('El motivo de penalización requiere tipo Penalización');
      return;
    }
    if (serviceCode !== 'APD') {
      throw new BadRequestException('Las penalizaciones solo corresponden a contratos APD');
    }
    if (!amount || !expectedDate || !motive?.trim()) {
      throw new BadRequestException('Una penalización requiere monto, fecha de cobro y motivo particular');
    }
  }

  private normalize(value: string) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es-MX');
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
