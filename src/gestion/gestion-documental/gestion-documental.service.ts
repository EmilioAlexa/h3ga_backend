import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CurrentUser } from '../gestion-auxiliares/gestion-auxiliares.service';
import { CreateEnvioDto } from './dto/create-envio.dto';
import { DocumentStorageService } from './document-storage.service';

@Injectable()
export class GestionDocumentalService {
  constructor(private readonly prisma: PrismaService, private readonly storage: DocumentStorageService) {}

  async findTareas(user: CurrentUser) {
    this.requireAuxiliar(user);
    return this.prisma.tareas_auxiliar.findMany({ where: { auxiliar_id: user.id }, include: { clientes: { select: { id: true, nombre: true, apellido_paterno: true, apellido_materno: true } } }, orderBy: { creado_en: 'desc' } });
  }

  async findExpediente(clienteId: string, user: CurrentUser) {
    await this.assertClienteAutorizado(clienteId, user);
    return this.prisma.clientes.findUnique({ where: { id: clienteId }, select: { id: true, nombre: true, apellido_paterno: true, apellido_materno: true, asesor_id: true, documentos_clientes: { select: { id: true, tipo_documento_id: true, nombre_archivo_original: true, mime_type: true, estatus: true, fecha_carga: true, observaciones: true, tipo_documento: { select: { nombre: true } } }, orderBy: { fecha_carga: 'desc' } } } });
  }

  async findDocumentos(clienteId: string, user: CurrentUser) {
    await this.assertClienteAutorizado(clienteId, user);
    return this.prisma.documentos_clientes.findMany({ where: { cliente_id: clienteId }, select: { id: true, tipo_documento_id: true, nombre_archivo_original: true, mime_type: true, estatus: true, fecha_carga: true, observaciones: true, tipo_documento: { select: { nombre: true } } }, orderBy: { fecha_carga: 'desc' } });
  }

  async createEnvio(dto: CreateEnvioDto, user: CurrentUser) {
    this.requireAuxiliar(user);
    const tarea = await this.prisma.tareas_auxiliar.findFirst({ where: { id: dto.tarea_id, auxiliar_id: user.id, estatus: { notIn: ['validada', 'cancelada'] } } });
    if (!tarea) throw new NotFoundException('Tarea no encontrada o no disponible para entrega');
    await this.assertAsignacionActiva(tarea.cliente_id, user.id);
    const tipo = await this.prisma.tipo_documento.findUnique({ where: { id: dto.tipo_documento_id } });
    if (!tipo) throw new BadRequestException('El tipo de documento no existe');
    return this.prisma.envios_documento.create({ data: { cliente_id: tarea.cliente_id, tarea_id: tarea.id, titulo: dto.titulo, tipo_documento_id: dto.tipo_documento_id, creado_por: user.id } });
  }

  async addVersion(envioId: string, file: Express.Multer.File, user: CurrentUser) {
    this.requireAuxiliar(user);
    const envio = await this.prisma.envios_documento.findFirst({ where: { id: envioId, creado_por: user.id, tareas_auxiliar: { auxiliar_id: user.id, estatus: { notIn: ['validada', 'cancelada'] } } } });
    if (!envio) throw new NotFoundException('Envío no encontrado o no disponible para una nueva versión');
    await this.assertAsignacionActiva(envio.cliente_id, user.id);
    const archivo_path = await this.storage.save(file);
    try {
      const latest = await this.prisma.versiones_documento.aggregate({ where: { envio_id: envioId }, _max: { numero_version: true } });
      const version = await this.prisma.versiones_documento.create({ data: { envio_id: envioId, numero_version: (latest._max.numero_version ?? 0) + 1, archivo_path, subido_por: user.id, nombre_archivo_original: file.originalname, mime_type: file.mimetype } });
      const pendiente = await this.prisma.estatus_envio_documento.findUnique({ where: { nombre: 'Pendiente' } });
      if (pendiente) await this.prisma.envios_documento.update({ where: { id: envioId }, data: { estatus_id: pendiente.id, actualizado_en: new Date(), cerrado_en: null } });
      await this.prisma.tareas_auxiliar.update({ where: { id: envio.tarea_id! }, data: { estatus: 'en_revision' } });
      return version;
    } catch (error) { await this.storage.remove(archivo_path); throw error; }
  }

  async findVersiones(envioId: string, user: CurrentUser) {
    const envio = await this.getEnvioAutorizado(envioId, user);
    return this.prisma.versiones_documento.findMany({ where: { envio_id: envio.id }, select: { id: true, numero_version: true, nombre_archivo_original: true, mime_type: true, fecha_carga: true, resultado: true, comentario: true, fecha_revision: true, subido_por: true, revisor_id: true }, orderBy: { numero_version: 'desc' } });
  }

  async downloadVersion(versionId: string, user: CurrentUser) {
    const version = await this.prisma.versiones_documento.findUnique({ where: { id: versionId }, include: { envios_documento: true } });
    if (!version) throw new NotFoundException('Versión no encontrada');
    await this.getEnvioAutorizado(version.envio_id, user);
    return { file: await this.storage.get(version.archivo_path), filename: version.nombre_archivo_original ?? `documento-${version.numero_version}` , contentType: version.mime_type ?? 'application/octet-stream' };
  }

  private async getEnvioAutorizado(id: string, user: CurrentUser) {
    const envio = await this.prisma.envios_documento.findFirst({ where: { id, tareas_auxiliar: user.roles.nombre === 'asesor' ? { asignado_por: user.id } : user.roles.nombre === 'auxiliar administrativo' ? { auxiliar_id: user.id } : undefined } });
    if (!envio) throw new NotFoundException('Envío no encontrado o fuera de tu alcance');
    return envio;
  }
  private requireAuxiliar(user: CurrentUser) { if (user.roles.nombre !== 'auxiliar administrativo') throw new ForbiddenException('Solo el auxiliar administrativo puede realizar esta operación'); }
  private async assertClienteAutorizado(clienteId: string, user: CurrentUser) {
    if (user.roles.nombre === 'asesor') {
      const cliente = await this.prisma.clientes.findFirst({ where: { id: clienteId, asesor_id: user.id }, select: { id: true } });
      if (!cliente) throw new NotFoundException('Cliente no encontrado o fuera de tu alcance');
      return;
    }
    this.requireAuxiliar(user);
    await this.assertAsignacionActiva(clienteId, user.id);
  }
  private async assertAsignacionActiva(clienteId: string, auxiliarId: string) { const a = await this.prisma.cliente_auxiliares.findFirst({ where: { cliente_id: clienteId, auxiliar_id: auxiliarId, activo: true }, select: { id: true } }); if (!a) throw new ForbiddenException('No tienes una asignación activa para este cliente'); }
}
