import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { cancunToday } from '../pagos-programados/scheduled-payment-status';
import { QueryFinancialDashboardDto } from './dto/query-financial-dashboard.dto';

type AuthUser = { id: string; activo: boolean; roles: { nombre: string } };
type Row = Record<string, unknown>;
const ZONE = 'America/Cancun';
const VALIDATED = 'Validado';
const REVIEW = 'Pendiente de revisión financiera';
const AUTHORIZATION = 'Pendiente de autorización';
const REJECTED = 'Rechazado';

@Injectable()
export class FinancialDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async get(query: QueryFinancialDashboardDto, user: AuthUser) {
    if (!user?.activo || !['administrador', 'administrador financiero', 'asesor'].includes(user.roles?.nombre)) {
      throw new ForbiddenException('No tienes permiso para consultar Finanzas');
    }
    const advisor = user.roles.nombre === 'asesor' ? user.id : null;
    const today = cancunToday();
    const startLocal = query.semana ?? this.weekStart(today);
    this.validateWeek(startLocal);
    const endLocal = this.addDays(startLocal, 7);
    const previousLocal = this.addDays(startLocal, -7);
    const start = this.midnight(startLocal);
    const end = this.midnight(endLocal);
    const previous = this.midnight(previousLocal);
    const now = new Date();
    const limit = query.limite ?? 5;
    const collectionCursor = this.parseCursor(query.cursor_cobros, 'cursor_cobros', false);
    const activityCursor = this.parseCursor(query.cursor_actividad, 'cursor_actividad', true);
    const scope = advisor ? Prisma.sql`AND ct."asesor_id" = ${advisor}::uuid` : Prisma.empty;
    const visibleCommissions = advisor
      ? Prisma.sql`AND cd."nombre" = 'Asesor' AND c."beneficiario_id" = ${advisor}::uuid`
      : Prisma.empty;

    return this.prisma.$transaction(async (tx) => {
      const queries: Array<() => Promise<Row[]>> = [
        () => tx.$queryRaw<Row[]>(Prisma.sql`
          SELECT (p."fecha_pago" AT TIME ZONE ${ZONE})::date::text AS fecha,
                 s."id" AS servicio_id, s."nombre" AS servicio,
                 SUM(p."monto") AS monto, COUNT(*)::int AS cantidad
          FROM "pagos" p JOIN "estados_pago" ep ON ep."id"=p."estado_pago_id"
          JOIN "contratos" ct ON ct."id"=p."contrato_id"
          JOIN "servicios" s ON s."id"=ct."servicio_id"
          WHERE ep."nombre"=${VALIDATED} AND p."fecha_pago">=${start} AND p."fecha_pago"<${end} ${scope}
          GROUP BY fecha, s."id", s."nombre" ORDER BY fecha, s."id"
        `),
        () => tx.$queryRaw<Row[]>(Prisma.sql`
          SELECT COALESCE(SUM(p."monto"),0) AS monto FROM "pagos" p
          JOIN "estados_pago" ep ON ep."id"=p."estado_pago_id"
          JOIN "contratos" ct ON ct."id"=p."contrato_id"
          WHERE ep."nombre"=${VALIDATED} AND p."fecha_pago">=${previous} AND p."fecha_pago"<${start} ${scope}
        `),
        () => tx.$queryRaw<Row[]>(Prisma.sql`
          SELECT ep."nombre" AS estado, COUNT(*)::int AS cantidad, SUM(p."monto") AS monto,
                 COUNT(*) FILTER (WHERE p."fecha_registro">=${start} AND p."fecha_registro"<${end})::int AS del_periodo,
                 COALESCE(SUM(p."monto") FILTER (WHERE p."fecha_registro">=${start} AND p."fecha_registro"<${end}),0) AS monto_del_periodo,
                 COUNT(*) FILTER (WHERE ep."nombre"=${REVIEW} AND p."fecha_registro"<${new Date(now.getTime()-86400000)})::int AS mas_24h
          FROM "pagos" p JOIN "estados_pago" ep ON ep."id"=p."estado_pago_id"
          JOIN "contratos" ct ON ct."id"=p."contrato_id"
          WHERE ep."nombre" IN (${REVIEW},${AUTHORIZATION},${REJECTED}) ${scope}
          GROUP BY ep."nombre"
        `),
        () => tx.$queryRaw<Row[]>(Prisma.sql`
          SELECT s."id" AS servicio_id, s."nombre" AS servicio, COUNT(*)::int AS cantidad
          FROM "contratos" ct JOIN "estados_contratos" ec ON ec."id"=ct."estado_contrato_id"
          JOIN "servicios" s ON s."id"=ct."servicio_id"
          WHERE ec."nombre"='Activo' ${scope}
          GROUP BY s."id",s."nombre" ORDER BY s."id"
        `),
        () => tx.$queryRaw<Row[]>(Prisma.sql`
          SELECT cd."id" AS concepto_id, cd."nombre" AS concepto, cd."es_remanente" AS es_remanente,
                 ec."nombre" AS estado, SUM(c."monto_comision") AS monto, COUNT(*)::int AS cantidad,
                 COALESCE(SUM(c."monto_comision") FILTER (WHERE d."id" IS NOT NULL),0) AS dispersado_confirmado
          FROM "comisiones" c JOIN "conceptos_dispersion" cd ON cd."id"=c."concepto_id"
          JOIN "estados_comisiones" ec ON ec."id"=c."estado_id"
          JOIN "pagos" p ON p."id"=c."pago_id" JOIN "contratos" ct ON ct."id"=p."contrato_id"
          LEFT JOIN "dispersiones_comision" d ON d."comision_id"=c."id"
          WHERE c."fecha_calculo">=${start} AND c."fecha_calculo"<${end} ${scope} ${visibleCommissions}
          GROUP BY cd."id",cd."nombre",cd."es_remanente",ec."nombre" ORDER BY cd."id",ec."nombre"
        `),
        () => tx.$queryRaw<Row[]>(Prisma.sql`
          WITH saldos AS (${this.balanceSql(scope,today)})
          SELECT COUNT(*) FILTER (WHERE estado='Pendiente')::int AS pendientes,
                 COUNT(*) FILTER (WHERE estado='Vencido')::int AS vencidas,
                 COUNT(*) FILTER (WHERE estado='Cubierto')::int AS cubiertas,
                 COUNT(*) FILTER (WHERE estado='Cancelado')::int AS canceladas,
                 COUNT(*) FILTER (WHERE motivo IS NOT NULL AND motivo<>'CANCELADO')::int AS no_disponibles,
                 COUNT(*) FILTER (WHERE motivo='SOBREPAGO' OR motivo='IMPORTE_INVALIDO')::int AS anomalias,
                 COALESCE(SUM(saldo) FILTER (WHERE saldo>0),0) AS saldo_conocido,
                 COALESCE(SUM(saldo) FILTER (WHERE estado='Vencido'),0) AS saldo_vencido
          FROM saldos
        `),
        () => tx.$queryRaw<Row[]>(Prisma.sql`
          WITH saldos AS (${this.balanceSql(scope,today)})
          SELECT id, contrato_id, folio, servicio_id, servicio,cliente_id,cliente_nombre,
                 tipo_cobro_id,tipo_cobro,cantidad_pagos,fecha_esperada::text AS fecha_esperada,
                 saldo AS importe_pendiente, numero_pago
          FROM saldos WHERE saldo>0 AND fecha_esperada>=${today}::date
            AND fecha_esperada<${this.addDays(today,7)}::date
            ${collectionCursor ? Prisma.sql`AND (fecha_esperada,id)>(${collectionCursor[0]}::date,${collectionCursor[1]}::uuid)` : Prisma.empty}
          ORDER BY fecha_esperada,id LIMIT ${limit+1}
        `),
        () => tx.$queryRaw<Row[]>(Prisma.sql`
          SELECT tipo,id_origen,ocurrido_en,contrato_id,folio,actor_id,
                 to_char(ocurrido_en AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_ocurrido_en
          FROM (
            SELECT 'contrato_creado' AS tipo,ct."id" AS id_origen,ct."creado_en" AS ocurrido_en,
                   ct."id" AS contrato_id,ct."folio",NULL::uuid AS actor_id
            FROM "contratos" ct WHERE TRUE ${scope}
            UNION ALL
            SELECT 'estado_pago',h."id",h."fecha_cambio",ct."id",ct."folio",h."cambiado_por"
            FROM "historial_estados_pago" h JOIN "pagos" p ON p."id"=h."pago_id"
            JOIN "contratos" ct ON ct."id"=p."contrato_id"
            JOIN "estados_pago" ep ON ep."id"=h."estado_nuevo_id"
            WHERE ep."nombre" IN (${VALIDATED},${REJECTED}) ${scope}
            UNION ALL
            SELECT 'evidencia_cargada',e."id",e."fecha_carga",ct."id",ct."folio",e."subido_por"
            FROM "evidencias_pago" e JOIN "pagos" p ON p."id"=e."pago_id"
            JOIN "contratos" ct ON ct."id"=p."contrato_id" WHERE TRUE ${scope}
          ) eventos
          ${activityCursor ? Prisma.sql`WHERE (ocurrido_en,tipo,id_origen)<(${activityCursor[0]}::timestamptz,${activityCursor[1]},${activityCursor[2]}::uuid)` : Prisma.empty}
          ORDER BY ocurrido_en DESC,tipo DESC,id_origen DESC LIMIT ${limit+1}
        `),
        () => advisor ? Promise.resolve([] as Row[]) : tx.$queryRaw<Row[]>(Prisma.sql`
          SELECT ec."nombre" AS estado, COUNT(DISTINCT cf."id")::int AS cantidad, COALESCE(SUM(dc."monto"),0) AS monto_detalle
          FROM "cortes_financieros" cf JOIN "estados_corte" ec ON ec."id"=cf."estado_id"
          LEFT JOIN "detalle_corte" dc ON dc."corte_id"=cf."id"
          WHERE ec."nombre"<>'Cancelado' AND cf."fecha_inicio">=${start} AND cf."fecha_inicio"<${end}
          GROUP BY ec."nombre"
        `),
        () => tx.$queryRaw<Row[]>(Prisma.sql`
          SELECT s."id" AS servicio_id,s."nombre" AS servicio FROM "servicios" s
          WHERE s."activo"=true
            ${advisor ? Prisma.sql`AND EXISTS(SELECT 1 FROM "contratos" ct WHERE ct."servicio_id"=s."id" AND ct."asesor_id"=${advisor}::uuid)` : Prisma.empty}
          ORDER BY s."id"
        `),
      ];
      const results: Row[][] = [];
      for (const run of queries) results.push(await run());
      const [incomeRows, priorRows, paymentRows, contractRows, commissionRows, balanceRows, upcomingRows, activityRows, cutRows, serviceCatalogRows] = results;

      const zero = () => new Prisma.Decimal(0);
      const incomeTotal = incomeRows.reduce((n,r)=>n.plus(this.money(r.monto)),zero());
      const previousTotal = this.money(priorRows[0]?.monto);
      const days = Array.from({length:7},(_,i)=>({fecha:this.addDays(startLocal,i),monto:'0.00'}));
      const byDay = new Map(days.map((d)=>[d.fecha,zero()]));
      const byService = new Map<number,{servicio_id:number;nombre:string;monto:Prisma.Decimal}>();
      for (const row of serviceCatalogRows) byService.set(Number(row.servicio_id),{servicio_id:Number(row.servicio_id),nombre:String(row.servicio),monto:zero()});
      for (const row of incomeRows) {
        const amount=this.money(row.monto); const date=String(row.fecha); const id=Number(row.servicio_id);
        byDay.set(date,(byDay.get(date)??zero()).plus(amount));
        const current=byService.get(id);
        byService.set(id,{servicio_id:id,nombre:String(row.servicio),monto:(current?.monto??zero()).plus(amount)});
      }
      const payments = new Map(paymentRows.map((r)=>[String(r.estado),r]));
      const pending=[payments.get(REVIEW),payments.get(AUTHORIZATION)].filter((r):r is Row=>Boolean(r));
      const pendingCount=pending.reduce((n,r)=>n+Number(r.cantidad),0);
      const pendingAmount=pending.reduce((n,r)=>n.plus(this.money(r.monto)),zero());
      const periodPendingCount=pending.reduce((n,r)=>n+Number(r.del_periodo),0);
      const periodPendingAmount=pending.reduce((n,r)=>n.plus(this.money(r.monto_del_periodo)),zero());
      const commissionTotal=commissionRows.reduce((n,r)=>n.plus(this.money(r.monto)),zero());
      const personalCommissions=commissionRows.filter((r)=>!r.es_remanente && r.concepto!=='IMSS').reduce((n,r)=>n.plus(this.money(r.monto)),zero());
      const pendingCommissions=commissionRows.filter((r)=>!r.es_remanente && r.concepto!=='IMSS' && r.estado==='Pendiente de dispersión').reduce((n,r)=>n.plus(this.money(r.monto)),zero());
      const confirmedAdvisor=commissionRows.filter((r)=>r.concepto==='Asesor').reduce((n,r)=>n.plus(this.money(r.dispersado_confirmado)),zero());
      const balance=balanceRows[0]??{};
      const unavailable=Number(balance.no_disponibles??0);
      const collectionPage=upcomingRows.slice(0,limit);
      const activityPage=activityRows.slice(0,limit);
      const collectionLast=collectionPage.at(-1);
      const activityLast=activityPage.at(-1);
      return {
        periodo:{inicio_local:startLocal,fin_exclusivo_local:endLocal,zona:ZONE},calculado_en:now.toISOString(),
        alcance:advisor?'asesor':'global',
        indicadores:{
          ingresos_periodo:incomeTotal.toFixed(2),ingresos_periodo_anterior:previousTotal.toFixed(2),
          variacion_periodo_porcentaje:previousTotal.isZero()?null:incomeTotal.minus(previousTotal).mul(100).div(previousTotal).toDecimalPlaces(2,Prisma.Decimal.ROUND_HALF_UP).toFixed(2),
          variacion_motivo:previousTotal.isZero()?'sin_base_comparable':null,
          pagos_pendientes_validacion:{stock:pendingCount,del_periodo:periodPendingCount,monto_stock:pendingAmount.toFixed(2),monto_del_periodo:periodPendingAmount.toFixed(2)},
          pagos_rechazados:{stock:Number(payments.get(REJECTED)?.cantidad??0),del_periodo:Number(payments.get(REJECTED)?.del_periodo??0)},
          contratos_activos:contractRows.reduce((n,r)=>n+Number(r.cantidad),0),contratos_finalizan_mes:null,
          por_cobrar_conocido:this.money(balance.saldo_conocido).toFixed(2),por_cobrar_completo:unavailable===0,
          comisiones_generadas:personalCommissions.toFixed(2),comisiones_pendientes_dispersion:pendingCommissions.toFixed(2),
          comisiones_asesor_dispersadas_confirmadas:confirmedAdvisor.toFixed(2),
        },
        ingresos_por_servicio:{total_validado:incomeTotal.toFixed(2),dias:days.map((d)=>({...d,monto:(byDay.get(d.fecha)??zero()).toFixed(2)})),
          servicios:[...byService.values()].map((s)=>({servicio_id:s.servicio_id,nombre:s.nombre,monto:s.monto.toFixed(2),porcentaje:incomeTotal.isZero()?null:s.monto.mul(100).div(incomeTotal).toDecimalPlaces(2,Prisma.Decimal.ROUND_HALF_UP).toFixed(2)}))},
        contratos_por_servicio:contractRows.map((r)=>({servicio_id:Number(r.servicio_id),nombre:String(r.servicio),cantidad:Number(r.cantidad)})),
        cobranza:{al_corte_local:today,pendientes:Number(balance.pendientes??0),vencidas:Number(balance.vencidas??0),cubiertas:Number(balance.cubiertas??0),canceladas:Number(balance.canceladas??0),
          saldo_conocido:this.money(balance.saldo_conocido).toFixed(2),saldo_vencido_conocido:this.money(balance.saldo_vencido).toFixed(2),
          saldos_no_disponibles:unavailable,anomalias:Number(balance.anomalias??0),total_completo:unavailable===0},
        comisiones:{fecha:'fecha_calculo',total_distribuciones_snapshot:commissionTotal.toFixed(2),total_remuneraciones_personales:personalCommissions.toFixed(2),pendientes:pendingCommissions.toFixed(2),asesor_dispersadas_confirmadas:confirmedAdvisor.toFixed(2),
          por_concepto:advisor?null:commissionRows.map((r)=>({concepto_id:Number(r.concepto_id),concepto:String(r.concepto),es_remanente:Boolean(r.es_remanente),estado:String(r.estado),monto:this.money(r.monto).toFixed(2),cantidad:Number(r.cantidad)}))},
        cortes:advisor?null:cutRows.map((r)=>({estado:String(r.estado),cantidad:Number(r.cantidad),monto_detalle:this.money(r.monto_detalle).toFixed(2)})),
        proximos_cobros:{items:collectionPage.map((r)=>({id_programado:r.id,contrato_id:r.contrato_id,folio:r.folio,
          cliente:{id:r.cliente_id,nombre:r.cliente_nombre},servicio:{id:Number(r.servicio_id),nombre:r.servicio},
          tipo_cobro:r.tipo_cobro_id===null?null:{id:Number(r.tipo_cobro_id),nombre:r.tipo_cobro},
          fecha_esperada:r.fecha_esperada,importe_pendiente:this.money(r.importe_pendiente).toFixed(2),numero_pago:Number(r.numero_pago),
          cantidad_pagos:r.cantidad_pagos===null?null:Number(r.cantidad_pagos)})),hay_mas:upcomingRows.length>limit,limite:limit,
          next_cursor:upcomingRows.length>limit&&collectionLast?this.cursor([collectionLast.fecha_esperada,collectionLast.id]):null},
        actividad_reciente:{items:activityPage.map((r)=>({tipo:r.tipo,id_origen:r.id_origen,ocurrido_en:r.ocurrido_en,contrato_id:r.contrato_id,folio:r.folio,actor_id:r.actor_id})),hay_mas:activityRows.length>limit,limite:limit,
          next_cursor:activityRows.length>limit&&activityLast?this.cursor([activityLast.cursor_ocurrido_en,activityLast.tipo,activityLast.id_origen]):null},
        no_disponibles:[...(unavailable?['saldo_obligaciones_incompleto']:[]),'fin_contrato_sin_fecha_general'],
      };
    },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
  }

  private balanceSql(scope:Prisma.Sql,today:string) {
    return Prisma.sql`
      SELECT pp."id",pp."contrato_id",ct."folio",ct."servicio_id",s."nombre" AS servicio,
             cl."id" AS cliente_id,concat_ws(' ',cl."nombre",cl."apellido_paterno",cl."apellido_materno") AS cliente_nombre,
             pp."tipo_cobro_id",tc."nombre" AS tipo_cobro,ct."cantidad_pagos",
             pp."fecha_esperada",pp."fecha_vencimiento",pp."numero_pago",
             CASE WHEN esp."nombre"='Cancelado' THEN NULL
                  WHEN pp."monto_esperado" IS NULL THEN NULL
                  WHEN pp."monto_esperado"<0 THEN NULL
                  WHEN a.abonado>pp."monto_esperado" THEN NULL
                  ELSE pp."monto_esperado"-a.abonado END AS saldo,
             CASE WHEN esp."nombre"='Cancelado' THEN 'CANCELADO'
                  WHEN pp."monto_esperado" IS NULL THEN 'IMPORTE_NO_DEFINIDO'
                  WHEN pp."monto_esperado"<0 THEN 'IMPORTE_INVALIDO'
                  WHEN a.abonado>pp."monto_esperado" THEN 'SOBREPAGO' END AS motivo,
             CASE WHEN esp."nombre"='Cancelado' THEN 'Cancelado'
                  WHEN pp."monto_esperado" IS NULL OR pp."monto_esperado"<0 OR a.abonado>pp."monto_esperado" THEN NULL
                  WHEN pp."monto_esperado"=a.abonado THEN 'Cubierto'
                  WHEN pp."fecha_vencimiento" IS NULL THEN NULL
                  WHEN pp."fecha_vencimiento"<${today}::date THEN 'Vencido'
                  ELSE 'Pendiente' END AS estado
      FROM "pagos_programados" pp JOIN "contratos" ct ON ct."id"=pp."contrato_id"
      JOIN "servicios" s ON s."id"=ct."servicio_id"
      JOIN "clientes" cl ON cl."id"=ct."cliente_id"
      LEFT JOIN "tipos_cobro" tc ON tc."id"=pp."tipo_cobro_id"
      LEFT JOIN "estados_pago_programado" esp ON esp."id"=pp."estado_id"
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(p."monto") FILTER (WHERE ep."nombre"=${VALIDATED}),0) AS abonado
        FROM "pagos" p LEFT JOIN "estados_pago" ep ON ep."id"=p."estado_pago_id"
        WHERE p."pago_programado_id"=pp."id"
      ) a ON TRUE WHERE TRUE ${scope}
    `;
  }

  private money(value:unknown) {
    if (value instanceof Prisma.Decimal) return value;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return new Prisma.Decimal(value.toString());
    if (value === null || value === undefined) return new Prisma.Decimal(0);
    throw new Error('Importe agregado inválido');
  }
  private cursor(parts:unknown[]) { return Buffer.from(JSON.stringify(parts)).toString('base64url'); }
  private parseCursor(token:string|undefined,field:string,activity:boolean):string[]|null {
    if (!token) return null;
    try {
      if (!/^[A-Za-z0-9_-]+$/.test(token)) throw new Error('encoding');
      const parts:unknown=JSON.parse(Buffer.from(token,'base64url').toString('utf8'));
      if (!Array.isArray(parts)||parts.length!==(activity?3:2)||parts.some((part)=>typeof part!=='string')) throw new Error('shape');
      const values=parts as string[];
      const validDate=activity? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(values[0]) && !Number.isNaN(Date.parse(values[0]))
        : /^\d{4}-\d{2}-\d{2}$/.test(values[0]) && !Number.isNaN(Date.parse(values[0]));
      const validId=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(values[activity?2:1]);
      if (!validDate||!validId||(activity&&!['contrato_creado','estado_pago','evidencia_cargada'].includes(values[1]))) throw new Error('value');
      return values;
    } catch { throw new BadRequestException(`${field} inválido`); }
  }
  private addDays(date:string,days:number) { const d=new Date(`${date}T00:00:00.000Z`); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10); }
  private weekStart(date:string) { const d=new Date(`${date}T00:00:00.000Z`); return this.addDays(date,-((d.getUTCDay()+2)%7)); }
  private validateWeek(value:string) {
    const d=new Date(`${value}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==value||d.getUTCDay()!==5) {
      throw new BadRequestException('semana debe ser un viernes válido YYYY-MM-DD');
    }
  }
  private midnight(date:string) {
    const [year,month,day]=date.split('-').map(Number);
    const nominal=Date.UTC(year,month-1,day);
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(nominal));
    const field=(name:string)=>Number(parts.find((part)=>part.type===name)?.value);
    const local=Date.UTC(field('year'),field('month')-1,field('day'),field('hour'),field('minute'),field('second'));
    return new Date(nominal-(local-nominal));
  }
}
