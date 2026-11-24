import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AccionDelMes, AvanceCliente, CargaPorAsesor, ClienteDetenido, ClientesPorEtapa, DashboardRespuesta, DocumentoPendiente } from './dto/dashboard-respuesta.dto';

export interface AuthenticatedUser { id: string; roles: { nombre: string } }
type Total = { total: number };
type Resumen = { clientes_activos: number; clientes_pensionados: number; clientes_avance_detenido: number; acciones_proximas_mes: number; asesores_activos: number; docs_si: number; docs_por_confirmar: number; docs_no: number };
type AvanceRow = { cliente_id: string; cliente_nombre: string; total: number; etapas: AvanceCliente['etapas'] };
type ConTotal<T> = T & Total;
function sinTotal<T>(fila: ConTotal<T>): T { const { total: _total, ...resto } = fila; void _total; return resto as T; }

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async obtener(usuario: AuthenticatedUser, limite: number): Promise<DashboardRespuesta> {
    const rol = usuario.roles?.nombre;
    if (!['administrador', 'asesor', 'auxiliar administrativo'].includes(rol)) throw new ForbiddenException('Rol sin acceso al Dashboard');
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Cancun', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const alcance = rol === 'administrador' ? Prisma.empty : rol === 'asesor'
      ? Prisma.sql`WHERE c.asesor_id = ${usuario.id}::uuid`
      : Prisma.sql`WHERE EXISTS (SELECT 1 FROM cliente_auxiliares ca WHERE ca.cliente_id = c.id AND ca.auxiliar_id = ${usuario.id}::uuid AND ca.activo = true)`;
    const ctes = Prisma.sql`
      WITH alcance AS (
        SELECT c.id, c.asesor_id, concat_ws(' ', c.nombre, c.apellido_paterno, c.apellido_materno) AS nombre
        FROM clientes c ${alcance}
      ), etapas AS (
        SELECT et.cliente_id, et.avance_porcentaje, et.fecha_compromiso, et.fecha_completada, et.actualizado_el,
               et.accion_a_realizar, et.estatus_id, est.nombre AS estatus,
               ep.numero_paso, ep.nombre AS etapa,
               CASE WHEN est.nombre IN ('En proceso cliente', 'En proceso asesor', 'En proceso Instituto', 'Bloqueado', 'Detenido') THEN 0
                    WHEN est.nombre = 'Por iniciar' THEN 1 ELSE 2 END AS prio
        FROM etapas_tramite et
        JOIN estatus_tramite est ON est.id = et.estatus_id
        JOIN etapas_proceso ep ON ep.id = et.etapa_id
        JOIN alcance al ON al.id = et.cliente_id
      ), actual AS (
        SELECT DISTINCT ON (cliente_id) cliente_id, numero_paso, etapa, estatus_id, estatus
        FROM etapas ORDER BY cliente_id, prio, CASE WHEN prio = 2 THEN -numero_paso ELSE numero_paso END
      ), agg AS (
        SELECT cliente_id,
               bool_or(numero_paso = 15 AND estatus = 'Finalizado') AS fin,
               bool_or(estatus = 'Detenido') AS hay_detenido,
               (max(actualizado_el) AT TIME ZONE 'America/Cancun')::date AS ultima
        FROM etapas GROUP BY cliente_id
      ), info AS (
        SELECT al.id, al.asesor_id, al.nombre, NOT COALESCE(g.fin, false) AS activo,
               COALESCE(ac.numero_paso, 0) AS paso, epn.nombre AS etapa,
               ac.estatus_id, ac.estatus, g.ultima,
               (${hoy}::date - g.ultima) AS dias,
               NOT COALESCE(g.fin, false) AND (COALESCE(g.hay_detenido, false) OR COALESCE(${hoy}::date - g.ultima, 0) >= 15) AS detenido
        FROM alcance al LEFT JOIN agg g ON g.cliente_id = al.id
        LEFT JOIN actual ac ON ac.cliente_id = al.id
        LEFT JOIN etapas_proceso epn ON epn.numero_paso = COALESCE(ac.numero_paso, 0)
      ), acciones AS (
        SELECT i.id AS cliente_id, i.nombre AS cliente_nombre, i.asesor_id, e.numero_paso, e.etapa,
               e.fecha_compromiso, e.accion_a_realizar,
               CASE WHEN e.estatus = 'Finalizado' OR e.fecha_completada IS NOT NULL THEN 'completada'
                    WHEN e.fecha_compromiso < ${hoy}::date THEN 'vencida' ELSE 'proxima' END AS estado
        FROM etapas e JOIN info i ON i.id = e.cliente_id
        WHERE i.activo AND e.fecha_compromiso >= date_trunc('month', ${hoy}::date)::date
          AND e.fecha_compromiso < (date_trunc('month', ${hoy}::date) + interval '1 month')::date
          AND e.estatus NOT IN ('Cancelado', 'No aplica')
      )`;
    const query = <T>(sql: Prisma.Sql) => this.prisma.$queryRaw<T[]>(Prisma.sql`${ctes} ${sql}`);
    const [resumen, etapas, documentos, acciones, detenidos, carga, avance] = await Promise.all([
      query<Resumen>(Prisma.sql`SELECT count(*) FILTER (WHERE activo)::int AS clientes_activos,
        count(*) FILTER (WHERE NOT activo)::int AS clientes_pensionados,
        count(*) FILTER (WHERE detenido)::int AS clientes_avance_detenido,
        (SELECT count(*)::int FROM acciones WHERE estado = 'proxima') AS acciones_proximas_mes,
        (SELECT count(*)::int FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE r.nombre = 'asesor' AND u.activo) AS asesores_activos,
        (SELECT count(*)::int FROM documentos_clientes d JOIN info i ON i.id = d.cliente_id WHERE i.activo AND d.estatus = 'si') AS docs_si,
        (SELECT count(*)::int FROM documentos_clientes d JOIN info i ON i.id = d.cliente_id WHERE i.activo AND d.estatus = 'por_confirmar') AS docs_por_confirmar,
        (SELECT count(*)::int FROM documentos_clientes d JOIN info i ON i.id = d.cliente_id WHERE i.activo AND d.estatus = 'no') AS docs_no FROM info`),
      query<ClientesPorEtapa>(Prisma.sql`SELECT ep.numero_paso::int AS numero_paso, ep.nombre, count(i.id) FILTER (WHERE i.activo)::int AS clientes
        FROM etapas_proceso ep LEFT JOIN info i ON i.paso = ep.numero_paso
        WHERE ep.numero_paso BETWEEN 0 AND 15 GROUP BY ep.numero_paso, ep.nombre ORDER BY ep.numero_paso`),
      query<ConTotal<DocumentoPendiente>>(Prisma.sql`SELECT d.id AS documento_id, i.id AS cliente_id, i.nombre AS cliente_nombre,
        d.tipo_documento_id::int AS tipo_documento_id, td.nombre AS tipo_documento, d.estatus,
        d.fecha_carga, d.subido_por AS subido_por_id,
        CASE WHEN us.id IS NULL THEN NULL ELSE concat_ws(' ', us.nombre, us.apellido_paterno) END AS subido_por_nombre,
        i.etapa AS etapa_actual, count(*) OVER ()::int AS total
        FROM documentos_clientes d JOIN info i ON i.id = d.cliente_id JOIN tipo_documento td ON td.id = d.tipo_documento_id
        LEFT JOIN usuarios us ON us.id = d.subido_por WHERE i.activo AND d.estatus IN ('por_confirmar', 'no')
        ORDER BY d.fecha_carga, d.id LIMIT ${limite}`),
      query<ConTotal<AccionDelMes>>(Prisma.sql`SELECT a.cliente_id, a.cliente_nombre, a.asesor_id,
        CASE WHEN u.id IS NULL THEN NULL ELSE concat_ws(' ', u.nombre, u.apellido_paterno) END AS asesor_nombre,
        a.numero_paso::int AS numero_paso, a.etapa, to_char(a.fecha_compromiso, 'YYYY-MM-DD') AS fecha_compromiso,
        a.accion_a_realizar, a.estado, count(*) OVER ()::int AS total
        FROM acciones a LEFT JOIN usuarios u ON u.id = a.asesor_id
        ORDER BY a.fecha_compromiso, a.cliente_nombre, a.numero_paso LIMIT ${limite}`),
      query<ClienteDetenido>(Prisma.sql`SELECT i.id AS cliente_id, i.nombre AS cliente_nombre, i.asesor_id,
        CASE WHEN u.id IS NULL THEN NULL ELSE concat_ws(' ', u.nombre, u.apellido_paterno) END AS asesor_nombre,
        i.etapa AS etapa_actual, i.estatus_id::int AS estatus_id, i.estatus,
        to_char(i.ultima, 'YYYY-MM-DD') AS ultima_actividad, i.dias::int AS dias_sin_actividad
        FROM info i LEFT JOIN usuarios u ON u.id = i.asesor_id WHERE i.detenido
        ORDER BY COALESCE(i.dias, -1) DESC, i.nombre, i.id LIMIT ${limite}`),
      rol === 'administrador' ? query<CargaPorAsesor>(Prisma.sql`SELECT i.asesor_id,
        concat_ws(' ', u.nombre, u.apellido_paterno) AS asesor_nombre,
        count(*) FILTER (WHERE i.activo)::int AS clientes_activos,
        count(*) FILTER (WHERE i.detenido)::int AS clientes_detenidos,
        count(*) FILTER (WHERE NOT i.activo)::int AS clientes_pensionados
        FROM info i JOIN usuarios u ON u.id = i.asesor_id GROUP BY i.asesor_id, u.nombre, u.apellido_paterno
        ORDER BY asesor_nombre, i.asesor_id`) : Promise.resolve(null),
      rol === 'asesor' ? query<AvanceRow>(Prisma.sql`, tope AS (
        SELECT id, nombre, count(*) OVER ()::int AS total FROM info WHERE activo ORDER BY nombre, id LIMIT 200)
        SELECT t.id AS cliente_id, t.nombre AS cliente_nombre, t.total,
        (SELECT json_agg(json_build_object('numero_paso', ep.numero_paso,
            'avance_porcentaje', COALESCE(e.avance_porcentaje, 0), 'estatus_id', e.estatus_id) ORDER BY ep.numero_paso)
         FROM etapas_proceso ep LEFT JOIN etapas e ON e.cliente_id = t.id AND e.numero_paso = ep.numero_paso
         WHERE ep.numero_paso BETWEEN 0 AND 15) AS etapas FROM tope t ORDER BY t.nombre, t.id`) : Promise.resolve(null),
    ]);
    const r = resumen[0];
    return { fecha: hoy,
      resumen: { clientes_activos: r.clientes_activos, clientes_pensionados: r.clientes_pensionados,
        asesores_activos: rol === 'administrador' ? r.asesores_activos : null,
        acciones_proximas_mes: r.acciones_proximas_mes, documentos_por_confirmar: r.docs_por_confirmar,
        documentos_con_observaciones: r.docs_no, clientes_avance_detenido: r.clientes_avance_detenido },
      clientes_por_etapa: etapas, documentos_por_estatus: { si: r.docs_si, por_confirmar: r.docs_por_confirmar, no: r.docs_no },
      acciones_del_mes: acciones.map(sinTotal), total_acciones_del_mes: acciones[0]?.total ?? 0,
      documentos_pendientes: documentos.map(sinTotal), total_documentos_pendientes: documentos[0]?.total ?? 0,
      clientes_detenidos: detenidos, carga_por_asesor: carga,
      avance_por_cliente: avance?.map(({ cliente_id, cliente_nombre, etapas: pasos }) => ({ cliente_id, cliente_nombre, etapas: pasos })) ?? null,
      total_avance_por_cliente: avance ? (avance[0]?.total ?? 0) : null };
  }
}
