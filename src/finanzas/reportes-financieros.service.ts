import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { QueryReportesFinancierosDto } from './dto/query-reportes-financieros.dto';

type AuthUser = { id: string; activo: boolean; roles: { nombre: string } };
type Granularity = 'semanal' | 'mensual' | 'anual';
type DateRange = { start: Date; endExclusive: Date; from: string; through: string };
type AggregateRow = Record<string, unknown>;
type ImssTotals = { total: Prisma.Decimal; dispersado: Prisma.Decimal; pendiente: Prisma.Decimal; otros_estados: Prisma.Decimal };
const TZ = 'America/Cancun';
const ROLE_ADMIN = ['administrador', 'administrador financiero'];
const STATE_VALIDATED = 'Validado';
const COMMISSION_DISPERSED = 'Dispersada';
const COMMISSION_PENDING = 'Pendiente de dispersión';

@Injectable()
export class ReportesFinancierosService {
  constructor(private readonly prisma: PrismaService) {}

  async ingresos(query: QueryReportesFinancierosDto, user: AuthUser) {
    this.ensureAdmin(user);
    const ranges = this.ranges(query);
    const current = await this.queryIngresos(ranges.current, query);
    const previous = query.comparar ? await this.queryIngresos(ranges.previous!, query) : null;
    return this.response(query, ranges, current, previous, (rows) => this.sumRows(rows, 'monto'));
  }

  async comisionesPorDestino(query: QueryReportesFinancierosDto, user: AuthUser) {
    this.ensureAdmin(user);
    const ranges = this.ranges(query);
    const current = await this.queryComisionesDestino(ranges.current, query);
    const previous = query.comparar ? await this.queryComisionesDestino(ranges.previous!, query) : null;
    const total = this.sumRows(current, 'monto_comision');
    const data = current.map((row) => ({
      ...row,
      porcentaje_del_total: this.percentage(row.monto_comision, total),
    }));
    const priorTotal = previous ? this.sumRows(previous, 'monto_comision') : null;
    return this.response(query, ranges, data, previous, (rows) => this.sumRows(rows, 'monto_comision'), total, priorTotal);
  }

  async comisionesPorTipoVenta(query: QueryReportesFinancierosDto, user: AuthUser) {
    this.ensureAdmin(user);
    const ranges = this.ranges(query);
    const current = await this.queryComisionesTipoVenta(ranges.current, query);
    const previous = query.comparar ? await this.queryComisionesTipoVenta(ranges.previous!, query) : null;
    const total = this.sumRows(current, 'monto_comision');
    const data = current.map((row) => ({
      ...row,
      porcentaje_del_total: this.percentage(row.monto_comision, total),
    }));
    const priorTotal = previous ? this.sumRows(previous, 'monto_comision') : null;
    return this.response(query, ranges, data, previous, (rows) => this.sumRows(rows, 'monto_comision'), total, priorTotal);
  }

  async pagosImss(query: QueryReportesFinancierosDto, user: AuthUser) {
    this.ensureAdmin(user);
    const ranges = this.ranges(query);
    const current = await this.queryImss(ranges.current, query);
    const previous = query.comparar ? await this.queryImss(ranges.previous!, query) : null;
    const currentTotals = this.imssTotals(current);
    const previousTotals = previous ? this.imssTotals(previous) : null;
    return this.response(
      query,
      ranges,
      current,
      previous,
      (rows) => this.imssTotals(rows).dispersado,
      currentTotals.dispersado,
      previousTotals?.dispersado,
      {
        total_comisionado: currentTotals.total.toFixed(2),
        pendiente_de_dispersion: currentTotals.pendiente.toFixed(2),
        otros_estados: currentTotals.otros_estados.toFixed(2),
      },
      previousTotals
        ? {
            total_comisionado: previousTotals.total.toFixed(2),
            pendiente_de_dispersion: previousTotals.pendiente.toFixed(2),
            otros_estados: previousTotals.otros_estados.toFixed(2),
          }
        : undefined,
    );
  }

  async pagosPorMetodo(query: QueryReportesFinancierosDto, user: AuthUser) {
    this.ensureAdmin(user);
    const ranges = this.ranges(query);
    const current = await this.queryMetodos(ranges.current, query);
    const previous = query.comparar ? await this.queryMetodos(ranges.previous!, query) : null;
    const total = this.sumRows(current, 'monto');
    const data = current.map((row) => ({
      ...row,
      porcentaje_del_total: this.percentage(row.monto, total),
    }));
    const priorTotal = previous ? this.sumRows(previous, 'monto') : null;
    return this.response(query, ranges, data, previous, (rows) => this.sumRows(rows, 'monto'), total, priorTotal);
  }

  private async queryIngresos(range: DateRange, query: QueryReportesFinancierosDto) {
    const bucket = this.bucketSql(query.granularidad);
    const where = this.paymentWhere(range, query);
    const rows = await this.prisma.$queryRaw<AggregateRow[]>(Prisma.sql`
      SELECT to_char(${bucket}, 'YYYY-MM-DD') AS periodo,
             SUM(p."monto") AS monto,
             COUNT(DISTINCT p."id") AS cantidad_pagos
      FROM "pagos" p
      JOIN "estados_pago" ep ON ep."id" = p."estado_pago_id"
      LEFT JOIN "seguimiento_apd" sv ON sv."contrato_id" = p."contrato_id"
      WHERE ${where}
      GROUP BY ${bucket}
      ORDER BY ${bucket}
    `);
    return rows.map((row) => this.normalize(row, ['monto'], ['cantidad_pagos']));
  }

  private async queryMetodos(range: DateRange, query: QueryReportesFinancierosDto) {
    const bucket = this.bucketSql(query.granularidad);
    const where = this.paymentWhere(range, query);
    const rows = await this.prisma.$queryRaw<AggregateRow[]>(Prisma.sql`
      SELECT to_char(${bucket}, 'YYYY-MM-DD') AS periodo,
             COALESCE(fp."nombre", 'Sin método de pago') AS metodo_pago,
             SUM(p."monto") AS monto,
             COUNT(DISTINCT p."id") AS cantidad_pagos
      FROM "pagos" p
      JOIN "estados_pago" ep ON ep."id" = p."estado_pago_id"
      LEFT JOIN "formas_pago" fp ON fp."id" = p."forma_pago_id"
      LEFT JOIN "seguimiento_apd" sv ON sv."contrato_id" = p."contrato_id"
      WHERE ${where}
      GROUP BY ${bucket}, fp."nombre"
      ORDER BY ${bucket}, metodo_pago
    `);
    return rows.map((row) => this.normalize(row, ['monto'], ['cantidad_pagos']));
  }

  private async queryComisionesDestino(range: DateRange, query: QueryReportesFinancierosDto) {
    const bucket = this.bucketSql(query.granularidad);
    const where = this.paymentWhere(range, query, true);
    const rows = await this.prisma.$queryRaw<AggregateRow[]>(Prisma.sql`
      SELECT to_char(${bucket}, 'YYYY-MM-DD') AS periodo,
             cd."id" AS concepto_id,
             cd."nombre" AS destino,
             COALESCE(NULLIF(c."receptor_nombre_snapshot", ''), r."nombre_externo",
               NULLIF(concat_ws(' ', ru."nombre", ru."apellido_paterno", ru."apellido_materno"), ''),
               NULLIF(concat_ws(' ', bu."nombre", bu."apellido_paterno", bu."apellido_materno"), ''),
               cd."nombre") AS beneficiario,
             ec."nombre" AS estado_comision,
             SUM(c."monto_comision") AS monto_comision,
             COUNT(*) AS cantidad_comisiones,
             COUNT(DISTINCT p."id") AS cantidad_pagos
      FROM "comisiones" c
      JOIN "pagos" p ON p."id" = c."pago_id"
      JOIN "estados_pago" ep ON ep."id" = p."estado_pago_id"
      JOIN "conceptos_dispersion" cd ON cd."id" = c."concepto_id"
      JOIN "estados_comisiones" ec ON ec."id" = c."estado_id"
      LEFT JOIN "receptores_dispersion" r ON r."id" = c."receptor_dispersion_id"
      LEFT JOIN "usuarios" ru ON ru."id" = r."usuario_id"
      LEFT JOIN "usuarios" bu ON bu."id" = c."beneficiario_id"
      LEFT JOIN "seguimiento_apd" sv ON sv."contrato_id" = p."contrato_id"
      WHERE ${where}
      GROUP BY ${bucket}, cd."id", cd."nombre", beneficiario, ec."nombre"
      ORDER BY ${bucket}, destino, beneficiario, estado_comision
    `);
    return rows.map((row) => this.normalize(row, ['monto_comision'], ['concepto_id', 'cantidad_comisiones', 'cantidad_pagos']));
  }

  private async queryComisionesTipoVenta(range: DateRange, query: QueryReportesFinancierosDto) {
    const bucket = this.bucketSql(query.granularidad);
    const where = this.paymentWhere(range, query, true);
    const rows = await this.prisma.$queryRaw<AggregateRow[]>(Prisma.sql`
      SELECT to_char(${bucket}, 'YYYY-MM-DD') AS periodo,
             COALESCE(tv."nombre", 'Sin tipo de venta registrado') AS tipo_venta,
             ec."nombre" AS estado_comision,
             SUM(c."monto_comision") AS monto_comision,
             COUNT(*) AS cantidad_comisiones,
             COUNT(DISTINCT p."id") AS cantidad_pagos,
             AVG(c."valor_aplicado") AS porcentaje_aplicado_promedio
      FROM "comisiones" c
      JOIN "pagos" p ON p."id" = c."pago_id"
      JOIN "estados_pago" ep ON ep."id" = p."estado_pago_id"
      JOIN "estados_comisiones" ec ON ec."id" = c."estado_id"
      LEFT JOIN "seguimiento_apd" sv ON sv."contrato_id" = p."contrato_id"
      LEFT JOIN "tipos_venta" tv ON tv."id" = sv."tipo_venta_id"
      WHERE ${where}
      GROUP BY ${bucket}, tipo_venta, ec."nombre"
      ORDER BY ${bucket}, tipo_venta, estado_comision
    `);
    return rows.map((row) => this.normalize(row, ['monto_comision', 'porcentaje_aplicado_promedio'], ['cantidad_comisiones', 'cantidad_pagos']));
  }

  private async queryImss(range: DateRange, query: QueryReportesFinancierosDto) {
    const bucket = this.bucketSql(query.granularidad);
    const where = this.paymentWhere(range, query, true);
    const rows = await this.prisma.$queryRaw<AggregateRow[]>(Prisma.sql`
      SELECT to_char(${bucket}, 'YYYY-MM-DD') AS periodo,
             ct."id" AS contrato_id,
             ct."folio" AS contrato,
             COALESCE((
               SELECT s."nombre" FROM "servicios" s
               WHERE s."id" = ct."servicio_id"
                 AND (EXISTS (SELECT 1 FROM "seguimiento_m10" sm WHERE sm."contrato_id" = ct."id")
                   OR EXISTS (SELECT 1 FROM "seguimiento_m40" sm WHERE sm."contrato_id" = ct."id")
                   OR EXISTS (SELECT 1 FROM "seguimiento_m40_retroactiva" sm WHERE sm."contrato_id" = ct."id"))
               LIMIT 1
             ), 'Servicio no identificado') AS servicio,
             ec."nombre" AS estado_comision,
             SUM(c."monto_comision") AS monto,
             COUNT(DISTINCT p."id") AS cantidad_pagos
      FROM "comisiones" c
      JOIN "pagos" p ON p."id" = c."pago_id"
      JOIN "estados_pago" ep ON ep."id" = p."estado_pago_id"
      JOIN "conceptos_dispersion" cd ON cd."id" = c."concepto_id" AND cd."nombre" = 'IMSS'
      JOIN "estados_comisiones" ec ON ec."id" = c."estado_id"
      JOIN "contratos" ct ON ct."id" = p."contrato_id"
      LEFT JOIN "seguimiento_apd" sv ON sv."contrato_id" = ct."id"
      WHERE ${where}
        AND (EXISTS (SELECT 1 FROM "seguimiento_m10" sm WHERE sm."contrato_id" = ct."id")
          OR EXISTS (SELECT 1 FROM "seguimiento_m40" sm WHERE sm."contrato_id" = ct."id")
          OR EXISTS (SELECT 1 FROM "seguimiento_m40_retroactiva" sm WHERE sm."contrato_id" = ct."id"))
      GROUP BY ${bucket}, ct."id", ct."folio", servicio, ec."nombre"
      ORDER BY ${bucket}, contrato, estado_comision
    `);
    return rows.map((row) => this.normalize(row, ['monto'], ['cantidad_pagos']));
  }

  private paymentWhere(range: DateRange, query: QueryReportesFinancierosDto, commission = false) {
    const clauses: Prisma.Sql[] = [
      Prisma.sql`p."fecha_pago" >= ${range.start}`,
      Prisma.sql`p."fecha_pago" < ${range.endExclusive}`,
      Prisma.sql`ep."nombre" = ${STATE_VALIDATED}`,
    ];
    if (query.forma_pago_id) clauses.push(Prisma.sql`p."forma_pago_id" = ${query.forma_pago_id}`);
    if (query.tipo_venta_id) clauses.push(Prisma.sql`sv."tipo_venta_id" = ${query.tipo_venta_id}`);
    if (commission) clauses.push(Prisma.sql`c."id" IS NOT NULL`);
    return Prisma.join(clauses, ' AND ');
  }

  private bucketSql(granularity: Granularity = 'mensual') {
    const localDate = Prisma.sql`(p."fecha_pago" AT TIME ZONE ${TZ})`;
    switch (granularity) {
      case 'semanal':
        // Weeks follow the financial cut calendar: Friday 00:00 through Thursday.
        return Prisma.sql`(date_trunc('week', ${localDate} + interval '3 days') - interval '3 days')`;
      case 'anual':
        return Prisma.sql`date_trunc('year', ${localDate})`;
      default:
        return Prisma.sql`date_trunc('month', ${localDate})`;
    }
  }

  private ranges(query: QueryReportesFinancierosDto) {
    const from = this.validateLocalDate(query.fecha_desde, 'fecha_desde');
    const through = this.validateLocalDate(query.fecha_hasta, 'fecha_hasta');
    if (through < from) throw new BadRequestException('fecha_hasta debe ser igual o posterior a fecha_desde');
    const endDate = this.addLocalDays(through, 1);
    const start = this.cancunMidnight(from);
    const endExclusive = this.cancunMidnight(endDate);
    const length = endExclusive.getTime() - start.getTime();
    const previousStart = new Date(start.getTime() - length);
    const previousEnd = start;
    return {
      current: { start, endExclusive, from, through },
      previous: query.comparar
        ? { start: previousStart, endExclusive: previousEnd, from: this.localDate(previousStart), through: this.addLocalDays(this.localDate(previousEnd), -1) }
        : null,
    };
  }

  private response<T>(
    query: QueryReportesFinancierosDto,
    ranges: ReturnType<ReportesFinancierosService['ranges']>,
    actual: T,
    previous: T | null,
    sum: (rows: T) => Prisma.Decimal,
    actualTotal?: Prisma.Decimal,
    priorTotal?: Prisma.Decimal | null,
    extraSummary: Record<string, unknown> = {},
    previousExtraSummary?: Record<string, unknown>,
  ) {
    const currentAmount = actualTotal ?? sum(actual);
    const previousAmount = previous === null ? null : priorTotal ?? sum(previous);
    return {
      periodo: {
        desde: ranges.current.from,
        hasta: ranges.current.through,
        granularidad: query.granularidad ?? 'mensual',
        zona_horaria: TZ,
      },
      datos: actual,
      resumen: { total: currentAmount.toFixed(2), ...extraSummary },
      comparacion: query.comparar
        ? {
            periodo_anterior: { desde: ranges.previous!.from, hasta: ranges.previous!.through },
            datos: previous,
            total_anterior: previousAmount!.toFixed(2),
            resumen_anterior: previousExtraSummary,
            variacion_porcentual: this.variation(currentAmount, previousAmount!),
            variacion_definida: !previousAmount!.isZero(),
          }
        : null,
    };
  }

  private imssTotals(rows: AggregateRow[]): ImssTotals {
    return rows.reduce<ImssTotals>(
      (total, row) => {
        const amount = this.decimal(row.monto);
        total.total = total.total.plus(amount);
        if (row.estado_comision === COMMISSION_DISPERSED) total.dispersado = total.dispersado.plus(amount);
        else if (row.estado_comision === COMMISSION_PENDING) total.pendiente = total.pendiente.plus(amount);
        else total.otros_estados = total.otros_estados.plus(amount);
        return total;
      },
      { total: new Prisma.Decimal(0), dispersado: new Prisma.Decimal(0), pendiente: new Prisma.Decimal(0), otros_estados: new Prisma.Decimal(0) },
    );
  }

  private normalize(row: AggregateRow, decimals: string[], integers: string[]) {
    const normalized: AggregateRow = { ...row };
    for (const field of decimals) normalized[field] = this.decimal(row[field]).toFixed(2);
    for (const field of integers) {
      if (typeof row[field] === 'bigint') normalized[field] = Number(row[field]);
      else if (row[field] !== null && row[field] !== undefined) normalized[field] = Number(row[field]);
    }
    return normalized;
  }

  private sumRows(rows: AggregateRow[], key: string) {
    return rows.reduce((sum, row) => sum.plus(this.decimal(row[key])), new Prisma.Decimal(0));
  }

  private percentage(part: unknown, total: Prisma.Decimal) {
    if (total.isZero()) return null;
    return this.decimal(part).mul(100).div(total).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2);
  }

  private variation(current: Prisma.Decimal, previous: Prisma.Decimal) {
    if (previous.isZero()) return null;
    return current.minus(previous).mul(100).div(previous).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2);
  }

  private decimal(value: unknown) {
    if (value instanceof Prisma.Decimal) return value;
    return new Prisma.Decimal(value === null || value === undefined ? 0 : String(value));
  }

  private validateLocalDate(value: string, field: string) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      throw new BadRequestException(`${field} debe ser una fecha válida YYYY-MM-DD`);
    }
    return value;
  }

  private addLocalDays(date: string, count: number) {
    const utc = new Date(`${date}T00:00:00.000Z`);
    utc.setUTCDate(utc.getUTCDate() + count);
    return utc.toISOString().slice(0, 10);
  }

  private cancunMidnight(date: string) {
    const [year, month, day] = date.split('-').map(Number);
    const nominalUtc = Date.UTC(year, month - 1, day);
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(nominalUtc));
    const part = (name: string) => Number(parts.find((item) => item.type === name)?.value);
    const representedLocalUtc = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
    return new Date(nominalUtc - (representedLocalUtc - nominalUtc));
  }

  private localDate(date: Date) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const part = (name: string) => parts.find((item) => item.type === name)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }

  private ensureAdmin(user: AuthUser) {
    if (!user.activo || !ROLE_ADMIN.includes(user.roles.nombre)) {
      throw new ForbiddenException('Solo administración puede consultar reportes financieros');
    }
  }
}
