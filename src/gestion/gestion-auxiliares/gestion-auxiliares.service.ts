import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateAsignacionDto } from './dto/create-asignacion.dto';
import { CreateTareaDto } from './dto/create-tarea.dto';
import { QueryAsignacionesDto } from './dto/query-asignaciones.dto';
import { QueryTareasDto } from './dto/query-tareas.dto';

export type CurrentUser = { id: string; roles: { nombre: string } };

@Injectable()
export class GestionAuxiliaresService {
  constructor(private readonly prisma: PrismaService) {}

  async listAuxiliares(user: CurrentUser) {
    this.requireAsesor(user);
    return this.prisma.usuarios.findMany({
      where: { activo: true, roles: { nombre: 'auxiliar administrativo' } },
      select: { id: true, nombre: true, apellido_paterno: true, apellido_materno: true, correo_electronico: true },
      orderBy: [{ apellido_paterno: 'asc' }, { nombre: 'asc' }],
    });
  }

  async createAsignacion(dto: CreateAsignacionDto, user: CurrentUser) {
    this.requireAsesor(user);
    await this.assertClienteDelAsesor(dto.cliente_id, user.id);
    await this.assertAuxiliar(dto.auxiliar_id);
    const existing = await this.prisma.cliente_auxiliares.findUnique({
      where: { cliente_id_auxiliar_id: { cliente_id: dto.cliente_id, auxiliar_id: dto.auxiliar_id } },
    });
    if (existing) {
      return this.prisma.cliente_auxiliares.update({
        where: { id: existing.id },
        data: { activo: dto.activo ?? true, autorizado_por: user.id, fecha_autorizacion: new Date() },
      });
    }
    return this.prisma.cliente_auxiliares.create({
      data: { cliente_id: dto.cliente_id, auxiliar_id: dto.auxiliar_id, autorizado_por: user.id, activo: dto.activo ?? true },
    });
  }

  async findAsignaciones(query: QueryAsignacionesDto, user: CurrentUser) {
    if (user.roles.nombre === 'asesor') {
      return this.prisma.cliente_auxiliares.findMany({
        where: { activo: query.activo, auxiliar_id: query.auxiliar_id, clientes: { asesor_id: user.id, ...(query.cliente_id ? { id: query.cliente_id } : {}) } },
        include: { clientes: { select: { id: true, nombre: true, apellido_paterno: true, apellido_materno: true } }, usuario_auxiliar: { select: { id: true, nombre: true, apellido_paterno: true, correo_electronico: true } } },
      });
    }
    if (user.roles.nombre === 'auxiliar administrativo') {
      return this.prisma.cliente_auxiliares.findMany({
        where: { auxiliar_id: user.id, activo: true, ...(query.cliente_id ? { cliente_id: query.cliente_id } : {}) },
        include: { clientes: { select: { id: true, nombre: true, apellido_paterno: true, apellido_materno: true, asesor_id: true } }, usuario_auxiliar: { select: { id: true, nombre: true, apellido_paterno: true, correo_electronico: true } } },
      });
    }
    throw new ForbiddenException('No tienes acceso a asignaciones de auxiliares');
  }

  async updateAsignacion(id: string, activo: boolean, user: CurrentUser) {
    this.requireAsesor(user);
    const asignacion = await this.prisma.cliente_auxiliares.findFirst({ where: { id, clientes: { asesor_id: user.id } }, select: { id: true } });
    if (!asignacion) throw new NotFoundException('Asignación no encontrada o fuera de tu alcance');
    return this.prisma.cliente_auxiliares.update({ where: { id }, data: { activo, autorizado_por: user.id, fecha_autorizacion: new Date() } });
  }

  async createTarea(dto: CreateTareaDto, user: CurrentUser) {
    this.requireAsesor(user);
    await this.assertClienteDelAsesor(dto.cliente_id, user.id);
    await this.assertAsignacionActiva(dto.cliente_id, dto.auxiliar_id);
    if (dto.etapa_tramite_id) await this.assertEtapaDelCliente(dto.etapa_tramite_id, dto.cliente_id);
    return this.prisma.tareas_auxiliar.create({ data: { ...dto, asignado_por: user.id } });
  }

  async findTareas(query: QueryTareasDto, user: CurrentUser) {
    const where = user.roles.nombre === 'asesor'
      ? { asignado_por: user.id, ...(query.cliente_id ? { cliente_id: query.cliente_id } : {}), ...(query.auxiliar_id ? { auxiliar_id: query.auxiliar_id } : {}), ...(query.estatus ? { estatus: query.estatus } : {}) }
      : user.roles.nombre === 'auxiliar administrativo'
        ? { auxiliar_id: user.id, ...(query.cliente_id ? { cliente_id: query.cliente_id } : {}), ...(query.estatus ? { estatus: query.estatus } : {}) }
        : null;
    if (!where) throw new ForbiddenException('No tienes acceso a tareas');
    return this.prisma.tareas_auxiliar.findMany({
      where,
      include: { clientes: { select: { id: true, nombre: true, apellido_paterno: true, apellido_materno: true } }, usuarios_tareas_auxiliar_asignado_porTousuarios: { select: { id: true, nombre: true, apellido_paterno: true } }, usuarios_tareas_auxiliar_auxiliar_idTousuarios: { select: { id: true, nombre: true, apellido_paterno: true } } },
      orderBy: { creado_en: 'desc' },
    });
  }

  async updateEstadoTarea(id: string, estatus: 'pendiente' | 'en_proceso' | 'en_revision' | 'correcciones' | 'validada' | 'cancelada', user: CurrentUser) {
    const tarea = await this.getTareaAccesible(id, user);
    if (user.roles.nombre === 'auxiliar administrativo' && !['en_proceso', 'en_revision'].includes(estatus)) throw new ForbiddenException('El auxiliar solo puede iniciar o enviar a revisión una tarea propia');
    if (user.roles.nombre === 'asesor' && !['correcciones', 'validada', 'cancelada'].includes(estatus)) throw new ForbiddenException('El asesor solo puede corregir, validar o cancelar una tarea propia');
    return this.prisma.tareas_auxiliar.update({ where: { id: tarea.id }, data: { estatus, completado_en: ['validada', 'cancelada'].includes(estatus) ? new Date() : null, validado_por: estatus === 'validada' ? user.id : null, validado_en: estatus === 'validada' ? new Date() : null } });
  }

  async findEnviosTarea(id: string, user: CurrentUser) {
    await this.getTareaAccesible(id, user);
    return this.prisma.envios_documento.findMany({ where: { tarea_id: id }, include: { estatus_envio_documento: true, versiones_documento: { orderBy: { numero_version: 'desc' }, take: 1 } }, orderBy: { actualizado_en: 'desc' } });
  }

  async revisarEnvio(id: string, resultado: 'validado' | 'no_validado', comentario: string | undefined, user: CurrentUser) {
    this.requireAsesor(user);
    if (resultado === 'no_validado' && !comentario?.trim()) throw new BadRequestException('La observación es obligatoria cuando el documento no es validado');
    const envio = await this.prisma.envios_documento.findFirst({ where: { id, tareas_auxiliar: { asignado_por: user.id } }, include: { versiones_documento: { where: { resultado: null }, orderBy: { numero_version: 'desc' }, take: 1 } } });
    if (!envio) throw new NotFoundException('Envío no encontrado o fuera de tu alcance');
    const version = envio.versiones_documento[0];
    if (!version) throw new BadRequestException('No existe una versión pendiente de revisión');
    const statusName = resultado === 'validado' ? 'Validado' : 'No validado';
    const status = await this.prisma.estatus_envio_documento.findUnique({ where: { nombre: statusName } });
    return this.prisma.$transaction(async (tx) => {
      await tx.versiones_documento.update({ where: { id: version.id }, data: { resultado, comentario: comentario?.trim(), revisor_id: user.id, fecha_revision: new Date() } });
      await tx.envios_documento.update({ where: { id }, data: { estatus_id: status?.id ?? envio.estatus_id, actualizado_en: new Date(), cerrado_en: resultado === 'validado' ? new Date() : null } });
      const envios = await tx.envios_documento.findMany({ where: { tarea_id: envio.tarea_id! }, include: { versiones_documento: { orderBy: { numero_version: 'desc' }, take: 1 } } });
      const todosValidados = envios.length > 0 && envios.every((item) => item.versiones_documento[0]?.resultado === 'validado');
      const estadoTarea = resultado === 'no_validado' ? 'correcciones' : todosValidados ? 'validada' : 'en_revision';
      return tx.tareas_auxiliar.update({ where: { id: envio.tarea_id! }, data: { estatus: estadoTarea, validado_por: estadoTarea === 'validada' ? user.id : null, validado_en: estadoTarea === 'validada' ? new Date() : null, completado_en: estadoTarea === 'validada' ? new Date() : null } });
    });
  }

  async assertTareaAuxiliar(id: string, auxiliarId: string) { return this.prisma.tareas_auxiliar.findFirst({ where: { id, auxiliar_id: auxiliarId, estatus: { notIn: ['validada', 'cancelada'] } } }); }

  private async getTareaAccesible(id: string, user: CurrentUser) {
    const where = user.roles.nombre === 'asesor' ? { id, asignado_por: user.id } : user.roles.nombre === 'auxiliar administrativo' ? { id, auxiliar_id: user.id } : null;
    if (!where) throw new ForbiddenException('No tienes acceso a tareas');
    const tarea = await this.prisma.tareas_auxiliar.findFirst({ where });
    if (!tarea) throw new NotFoundException('Tarea no encontrada o fuera de tu alcance');
    return tarea;
  }
  private requireAsesor(user: CurrentUser) { if (user.roles.nombre !== 'asesor') throw new ForbiddenException('Solo el asesor puede realizar esta operación'); }
  private async assertClienteDelAsesor(clienteId: string, asesorId: string) { const cliente = await this.prisma.clientes.findFirst({ where: { id: clienteId, asesor_id: asesorId }, select: { id: true } }); if (!cliente) throw new NotFoundException('Cliente no encontrado o fuera de tu alcance'); }
  private async assertAuxiliar(id: string) { const auxiliar = await this.prisma.usuarios.findFirst({ where: { id, activo: true, roles: { nombre: 'auxiliar administrativo' } }, select: { id: true } }); if (!auxiliar) throw new BadRequestException('El usuario indicado no es un auxiliar administrativo activo'); }
  private async assertAsignacionActiva(clienteId: string, auxiliarId: string) { const a = await this.prisma.cliente_auxiliares.findFirst({ where: { cliente_id: clienteId, auxiliar_id: auxiliarId, activo: true } }); if (!a) throw new BadRequestException('El auxiliar no tiene una asignación activa para este cliente'); }
  private async assertEtapaDelCliente(etapaId: string, clienteId: string) { const etapa = await this.prisma.etapas_tramite.findFirst({ where: { id: etapaId, cliente_id: clienteId }, select: { id: true } }); if (!etapa) throw new BadRequestException('La etapa no pertenece al cliente indicado'); }
}
