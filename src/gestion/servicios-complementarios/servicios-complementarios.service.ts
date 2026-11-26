import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { CurrentUser } from '../gestion-auxiliares/gestion-auxiliares.service';
import { GestionDocumentalService } from '../gestion-documental/gestion-documental.service';
import { BajaSolicitudDto, CambiarServicioDto, CrearAlertaDto, CrearSolicitudDto, CrearSolicitudPersonalizadaDto, QuerySolicitudesDto, SeguimientoDto } from './dto/servicios-complementarios.dto';

const estados = ['por iniciar', 'en proceso cliente', 'en proceso asesor', 'en proceso instituto', 'finalizado'];
const porcentajes = [10, 25, 50, 75, 100];
const servicios = ['mejoravit', 'apoyo por desempleo', 'apoyo por desempleo apd', 'apd', 'prestamos a pensionados', 'prestamos a pensionados pp', 'pp', 'plan privado de retiro', 'plan privado de retiro ppr', 'ppr'];
const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const cliente = { id: true, nombre: true, apellido_paterno: true, apellido_materno: true } as const;
const incluir = { clientes: { select: cliente }, servicios: { select: { id: true, nombre: true, descripcion: true } }, estatus_tramite: { select: { id: true, nombre: true, categoria: true } } } as const;
type Db = Prisma.TransactionClient;

@Injectable()
export class ServiciosComplementariosService {
  constructor(private readonly db: PrismaService, private readonly documental: GestionDocumentalService) {}
  private asesor(u: CurrentUser) { if (u.roles?.nombre !== 'asesor') throw new ForbiddenException('Rol sin permiso'); }
  private async estados(db: Db) {
    const rows = await db.estatus_tramite.findMany();
    const result = estados.map((nombre) => rows.filter((r) => normalizar(r.nombre) === nombre));
    if (result.some((r) => r.length !== 1)) throw new ConflictException('Catálogo de estados incompleto o ambiguo');
    return result.map((r) => r[0]);
  }
  private async servicio(db: Db, id: number) {
    const row = await db.servicios.findUnique({ where: { id } });
    if (!row || !row.activo || (row.codigo_folio != null && !servicios.includes(normalizar(row.nombre)))) throw new BadRequestException('Servicio complementario no disponible en el catálogo');
    return row;
  }
  private async lock(db: Db, clienteId: string, u: CurrentUser) {
    const rows = await db.$queryRaw<{ id: string }[]>`SELECT id FROM clientes WHERE id = ${clienteId}::uuid AND asesor_id = ${u.id}::uuid FOR UPDATE`;
    if (!rows.length) throw new NotFoundException('Cliente no encontrado o fuera de tu alcance');
  }
  private async tramite(db: Db, id: string, u: CurrentUser) {
    const row = await db.servicios_complementarios_tramite.findFirst({ where: { id, clientes: { asesor_id: u.id } } });
    if (!row) throw new NotFoundException('Solicitud no encontrada o fuera de tu alcance');
    return row;
  }
  private async bloqueado<T>(id: string, u: CurrentUser, fn: (tx: Db, t: Awaited<ReturnType<ServiciosComplementariosService['tramite']>>) => Promise<T>) {
    this.asesor(u);
    return this.db.$transaction(async (tx) => {
      const t = await this.tramite(tx, id, u);
      await this.lock(tx, t.cliente_id, u);
      return fn(tx, await this.tramite(tx, id, u));
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10000, timeout: 15000 });
  }
  private async cancelado(db: Db) {
    const rows = (await db.estatus_tramite.findMany()).filter((r) => normalizar(r.nombre) === 'cancelado' && r.categoria === 'excepcion');
    if (rows.length !== 1) throw new ConflictException('Estado Cancelado inexistente o ambiguo');
    return rows[0];
  }
  private async exclusividad(db: Db, clienteId: string, finalId: number, except?: string) {
    const cancelado = await this.cancelado(db);
    if (await db.servicios_complementarios_tramite.findFirst({ where: { cliente_id: clienteId, estatus_id: { notIn: [finalId, cancelado.id] }, ...(except ? { id: { not: except } } : {}) }, select: { id: true } })) throw new ConflictException('El cliente ya tiene un servicio activo');
  }
  async catalogos(u: CurrentUser) {
    this.asesor(u);
    const [all, estatus] = await Promise.all([this.db.servicios.findMany({ where: { activo: true }, select: { id: true, nombre: true, descripcion: true, codigo_folio: true }, orderBy: { nombre: 'asc' } }), this.estados(this.db)]);
    return { servicios: all.filter((s) => s.codigo_folio === null || servicios.includes(normalizar(s.nombre))).map(({ id, nombre, descripcion }) => ({ id, nombre, descripcion })), estados: estatus.map(({ id, nombre }, i) => ({ id, nombre, avance_porcentaje_fijo: porcentajes[i] })) };
  }
  async disponibles(u: CurrentUser, q: QuerySolicitudesDto) {
    this.asesor(u); const es = await this.estados(this.db); const cancelado = await this.cancelado(this.db);
    const where: Prisma.clientesWhereInput = { asesor_id: u.id, servicios_complementarios_tramite: { none: { estatus_id: { notIn: [es[4].id, cancelado.id] } } }, ...(q.q ? { OR: ['nombre', 'apellido_paterno', 'apellido_materno'].map((k) => ({ [k]: { contains: q.q, mode: 'insensitive' } })) } : {}) };
    const [data, total] = await Promise.all([this.db.clientes.findMany({ where, select: cliente, skip: (q.page - 1) * q.limit, take: q.limit, orderBy: [{ nombre: 'asc' }, { id: 'asc' }] }), this.db.clientes.count({ where })]);
    return { data, pagination: { page: q.page, limit: q.limit, total } };
  }
  async crear(dto: CrearSolicitudDto, u: CurrentUser) {
    this.asesor(u);
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, dto.cliente_id, u); const es = await this.estados(tx);
      await this.servicio(tx, dto.servicio_id); await this.exclusividad(tx, dto.cliente_id, es[4].id);
      return tx.servicios_complementarios_tramite.create({ data: { cliente_id: dto.cliente_id, servicio_id: dto.servicio_id, estatus_id: es[0].id, avance_porcentaje: 10 }, include: incluir });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10000, timeout: 15000 });
  }
  async crearPersonalizado(dto: CrearSolicitudPersonalizadaDto, u: CurrentUser) {
    this.asesor(u);
    const nombre = dto.nombre.trim(); const descripcion = dto.descripcion.trim();
    if (!nombre || !descripcion) throw new BadRequestException('Nombre y descripción son obligatorios');
    try {
      return await this.db.$transaction(async (tx) => {
        await this.lock(tx, dto.cliente_id, u);
        const es = await this.estados(tx);
        await this.exclusividad(tx, dto.cliente_id, es[4].id);
        const avance = 10;
        const servicio = await tx.servicios.create({ data: { nombre, descripcion }, select: { id: true } });
        return tx.servicios_complementarios_tramite.create({ data: { cliente_id: dto.cliente_id, servicio_id: servicio.id, estatus_id: es[0].id, avance_porcentaje: avance }, include: incluir });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10000, timeout: 15000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Ya existe un servicio con ese nombre');
      throw error;
    }
  }
  async listar(q: QuerySolicitudesDto, u: CurrentUser) {
    this.asesor(u); const cancelado = await this.cancelado(this.db);
    const where: Prisma.servicios_complementarios_tramiteWhereInput = { clientes: { asesor_id: u.id, ...(q.q ? { OR: ['nombre', 'apellido_paterno', 'apellido_materno'].map((k) => ({ [k]: { contains: q.q, mode: 'insensitive' } })) } : {}) }, ...(q.servicio_id ? { servicio_id: q.servicio_id } : {}), estatus_id: q.estatus_id ?? { not: cancelado.id } };
    const [data, total] = await Promise.all([this.db.servicios_complementarios_tramite.findMany({ where, include: incluir, skip: (q.page - 1) * q.limit, take: q.limit, orderBy: [{ creado_el: 'desc' }, { id: 'asc' }] }), this.db.servicios_complementarios_tramite.count({ where })]);
    return { data, pagination: { page: q.page, limit: q.limit, total } };
  }
  async detalle(id: string, u: CurrentUser) { this.asesor(u); const row = await this.db.servicios_complementarios_tramite.findFirst({ where: { id, clientes: { asesor_id: u.id } }, include: incluir }); if (!row) throw new NotFoundException('Solicitud no encontrada'); return row; }
  async seguimiento(id: string, dto: SeguimientoDto, u: CurrentUser) {
    return this.bloqueado(id, u, async (tx, t) => {
      const es = await this.estados(tx); const e = es.find((x) => x.id === (dto.estatus_id ?? t.estatus_id));
      if (!e) throw new BadRequestException('Estado no permitido');
      const cancelado = await this.cancelado(tx);
      if (t.estatus_id === cancelado.id) throw new ConflictException('Solicitud dada de baja; reactivación no definida');
      const cambio = e.id !== t.estatus_id;
      if (cambio && e.id !== es[4].id) await this.exclusividad(tx, t.cliente_id, es[4].id, t.id);
      const avance = dto.estatus_id !== undefined ? porcentajes[es.findIndex((x) => x.id === e.id)] : t.avance_porcentaje;
      if (cambio) await tx.servicios_complementarios_historial.create({ data: { servicio_tramite_id: id, estatus_anterior_id: t.estatus_id, estatus_nuevo_id: e.id, cambiado_por: u.id } });
      return tx.servicios_complementarios_tramite.update({ where: { id }, data: { estatus_id: e.id, avance_porcentaje: avance, ...(dto.accion_a_realizar !== undefined ? { accion_a_realizar: dto.accion_a_realizar } : {}), ...(dto.observaciones !== undefined ? { observaciones: dto.observaciones } : {}), ...(dto.fecha_compromiso !== undefined ? { fecha_compromiso: dto.fecha_compromiso ? new Date(dto.fecha_compromiso) : null } : {}), ...(cambio ? { fecha_completada: e.id === es[4].id ? new Date() : null } : {}), actualizado_el: new Date() }, include: incluir });
    });
  }
  async cambiar(id: string, dto: CambiarServicioDto, u: CurrentUser) {
    if (dto.confirmar !== true) throw new BadRequestException('Debe confirmar el reinicio del seguimiento');
    return this.bloqueado(id, u, async (tx, t) => {
      const es = await this.estados(tx); await this.servicio(tx, dto.servicio_id);
      if (t.estatus_id === (await this.cancelado(tx)).id) throw new ConflictException('Solicitud dada de baja; reactivación no definida');
      if (t.servicio_id === dto.servicio_id) throw new BadRequestException('Seleccione otro servicio');
      await this.exclusividad(tx, t.cliente_id, es[4].id, t.id);
      if (t.estatus_id !== es[0].id) await tx.servicios_complementarios_historial.create({ data: { servicio_tramite_id: id, estatus_anterior_id: t.estatus_id, estatus_nuevo_id: es[0].id, cambiado_por: u.id } });
      return tx.servicios_complementarios_tramite.update({ where: { id }, data: { servicio_id: dto.servicio_id, contrato_id: null, estatus_id: es[0].id, avance_porcentaje: 10, accion_a_realizar: null, fecha_compromiso: null, observaciones: null, fecha_completada: null, reactivado_en: null, motivo_rechazo: null, actualizado_el: new Date() }, include: incluir });
    });
  }
  async baja(id: string, dto: BajaSolicitudDto, u: CurrentUser) {
    if (dto.confirmar !== true) throw new BadRequestException('Debe confirmar la baja');
    return this.bloqueado(id, u, async (tx, t) => {
      const cancelado = await this.cancelado(tx);
      if (t.estatus_id === cancelado.id) throw new ConflictException('Solicitud ya dada de baja');
      await tx.servicios_complementarios_historial.create({ data: { servicio_tramite_id: id, estatus_anterior_id: t.estatus_id, estatus_nuevo_id: cancelado.id, cambiado_por: u.id } });
      return tx.servicios_complementarios_tramite.update({ where: { id }, data: { estatus_id: cancelado.id, actualizado_el: new Date() }, include: incluir });
    });
  }
  async alerta(id: string, dto: CrearAlertaDto, u: CurrentUser) {
    const motivo = dto.motivo.trim();
    if (!motivo) throw new BadRequestException('El motivo es obligatorio');
    return this.bloqueado(id, u, async (tx, t) => {
      const fecha = new Date(`${dto.fecha}T00:00:00.000Z`);
      const evento = await tx.eventos_agenda.create({ data: { asesor_id: u.id, cliente_id: t.cliente_id, fecha, motivo, estatus: 'pendiente' }, select: { id: true, fecha: true, hora: true, motivo: true, estatus: true } });
      const aviso = await tx.avisos.create({ data: { tipo: 'tramite', evento_id: evento.id, fecha_alerta: new Date(`${dto.fecha}T05:00:00.000Z`) }, select: { id: true, fecha_alerta: true, atendido: true, tipo: true } });
      const vinculo = await tx.servicios_complementarios_avisos.create({ data: { servicio_tramite_id: id, aviso_id: aviso.id }, select: { id: true } });
      return { id: vinculo.id, aviso: { ...aviso, eventos_agenda: evento } };
    });
  }
  async documentos(id: string, u: CurrentUser) {
    this.asesor(u); const t = await this.tramite(this.db, id, u);
    return this.db.servicios_complementarios_documentos.findMany({ where: { servicio_tramite_id: id, documento: { cliente_id: t.cliente_id } }, select: { id: true, creado_el: true, documento: { select: { id: true, cliente_id: true, tipo_documento_id: true, nombre_archivo_original: true, mime_type: true, fecha_carga: true, observaciones: true } } } });
  }
  async vincular(id: string, docId: string, u: CurrentUser) {
    return this.bloqueado(id, u, async (tx, t) => {
      const doc = await tx.documentos_clientes.findFirst({ where: { id: docId, cliente_id: t.cliente_id }, select: { id: true } });
      if (!doc) throw new NotFoundException('Documento no encontrado en el expediente');
      if (await tx.servicios_complementarios_documentos.findFirst({ where: { servicio_tramite_id: id, documento_id: docId } })) throw new ConflictException('Documento ya vinculado');
      return tx.servicios_complementarios_documentos.create({ data: { servicio_tramite_id: id, documento_id: docId } });
    });
  }
  async desvincular(id: string, docId: string, u: CurrentUser) {
    return this.bloqueado(id, u, async (tx, t) => {
      const result = await tx.servicios_complementarios_documentos.deleteMany({ where: { servicio_tramite_id: id, documento_id: docId, documento: { cliente_id: t.cliente_id } } });
      if (!result.count) throw new NotFoundException('Vínculo no encontrado');
    });
  }
  async descargar(id: string, docId: string, u: CurrentUser) {
    this.asesor(u); const t = await this.tramite(this.db, id, u);
    if (!await this.db.servicios_complementarios_documentos.findFirst({ where: { servicio_tramite_id: id, documento_id: docId, documento: { cliente_id: t.cliente_id } } })) throw new NotFoundException('Documento no vinculado');
    return this.documental.obtenerDocumento(docId, u);
  }
  async agenda(id: string, u: CurrentUser) {
    this.asesor(u); const t = await this.tramite(this.db, id, u);
    return this.db.servicios_complementarios_avisos.findMany({ where: { servicio_tramite_id: id, aviso: { eventos_agenda: { cliente_id: t.cliente_id, asesor_id: u.id } } }, select: { id: true, aviso: { select: { id: true, fecha_alerta: true, atendido: true, eventos_agenda: { select: { id: true, fecha: true, hora: true, motivo: true, estatus: true } } } } } });
  }
}
