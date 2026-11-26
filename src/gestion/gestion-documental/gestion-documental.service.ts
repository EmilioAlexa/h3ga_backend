import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CurrentUser } from '../gestion-auxiliares/gestion-auxiliares.service';
import { CreateEnvioDto } from './dto/create-envio.dto';
import { DocumentStorageService } from './document-storage.service';
import { CargarDocumentoDto, MetadatosDocumentoDto, QueryDocumentosDto } from './dto/documento-expediente.dto';
import { validarDocumento } from './documento-expediente.validator';
import { assertAsesor, CAMPOS, modalidadDeEtapa } from '../modalidades/modalidades.rules';

const documentoSelect = { id: true, cliente_id: true, tipo_documento_id: true, nombre_archivo_original: true, mime_type: true, estatus: true, numero_referencia: true, fecha_carga: true, observaciones: true, subido_por: true, etapa_tramite_id: true, tipo_documento: { select: { nombre: true } }, etapa_tramite: { select: { cliente_id: true, etapas_proceso: { select: { numero_paso: true, nombre: true } } } } } satisfies Prisma.documentos_clientesSelect;

@Injectable()
export class GestionDocumentalService {
  private readonly logger = new Logger(GestionDocumentalService.name);
  constructor(private readonly prisma: PrismaService, private readonly storage: DocumentStorageService) {}

  async findTareas(user: CurrentUser) {
    this.requireAuxiliar(user);
    return this.prisma.tareas_auxiliar.findMany({ where: { auxiliar_id: user.id }, include: { clientes: { select: { id: true, nombre: true, apellido_paterno: true, apellido_materno: true } } }, orderBy: { creado_en: 'desc' } });
  }

  async findExpediente(clienteId: string, user: CurrentUser) {
    await this.assertClienteAutorizado(clienteId, user);
    return this.prisma.clientes.findUnique({ where: { id: clienteId }, select: { id: true, nombre: true, apellido_paterno: true, apellido_materno: true, asesor_id: true, documentos_clientes: { select: { id: true, tipo_documento_id: true, nombre_archivo_original: true, mime_type: true, estatus: true, fecha_carga: true, observaciones: true, tipo_documento: { select: { nombre: true } } }, orderBy: { fecha_carga: 'desc' } } } });
  }

  async findDocumentos(clienteId: string, user: CurrentUser, query: QueryDocumentosDto = {}) {
    await this.assertClienteAutorizado(clienteId, user);
    if (query.etapa_tramite_id) {
      const etapa = await this.prisma.etapas_tramite.findFirst({ where: { id: query.etapa_tramite_id, cliente_id: clienteId }, select: { id: true } });
      if (!etapa) throw new NotFoundException('Etapa no encontrada en el cliente');
    }
    const rows = await this.prisma.documentos_clientes.findMany({ where: { cliente_id: clienteId, ...(query.etapa_tramite_id ? { etapa_tramite_id: query.etapa_tramite_id } : {}) }, select: documentoSelect, orderBy: [{ fecha_carga: 'desc' }, { id: 'asc' }] });
    return rows.map((d) => {
      if (d.etapa_tramite && d.etapa_tramite.cliente_id !== d.cliente_id) throw new ConflictException('Documento asociado a una etapa de otro cliente; requiere conciliación');
      return { ...d, modalidad: d.etapa_tramite ? modalidadDeEtapa(d.etapa_tramite.etapas_proceso) : null, general: d.etapa_tramite_id === null };
    });
  }

  async cargarDocumento(clienteId: string, dto: CargarDocumentoDto, file: Express.Multer.File | undefined, user: CurrentUser) {
    assertAsesor(user);
    await this.assertClienteAutorizado(clienteId, user);
    validarDocumento(file);
    let key: string | undefined;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const own = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM clientes WHERE id = ${clienteId}::uuid AND asesor_id = ${user.id}::uuid FOR UPDATE`;
        if (!own.length) throw new NotFoundException('Cliente no encontrado o fuera de tu alcance');
        if (dto.etapa_tramite_id) {
          const etapa = await tx.etapas_tramite.findFirst({ where: { id: dto.etapa_tramite_id, cliente_id: clienteId }, include: { etapas_proceso: true } });
          const m = etapa && modalidadDeEtapa(etapa.etapas_proceso);
          if (!etapa || !m) throw new BadRequestException('Etapa de modalidad inexistente o sin correspondencia verificada');
          const apps = await tx.modalidades_aplicacion.findMany({ where: { cliente_id: clienteId }, take: 2 });
          if (apps.length !== 1 || !apps[0][CAMPOS[m].aplica]) throw new ConflictException('La etapa no corresponde a una modalidad seleccionada inequívoca');
        }
        if (!await tx.tipo_documento.findUnique({ where: { id: dto.tipo_documento_id } })) throw new BadRequestException('El tipo de documento no existe');
        key = await this.storage.save(file!);
        return tx.documentos_clientes.create({ data: { cliente_id: clienteId, tipo_documento_id: dto.tipo_documento_id, etapa_tramite_id: dto.etapa_tramite_id,
          archivo_path: key, nombre_archivo_original: file!.originalname, mime_type: file!.mimetype, subido_por: user.id,
          observaciones: dto.observaciones, numero_referencia: dto.numero_referencia,
        }, select: documentoSelect });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15000 });
    } catch (error) {
      if (key) {
        await this.storage.remove(key);
        try {
          const remaining = await this.storage.get(key);
          remaining.stream.destroy();
          throw new ServiceUnavailableException('No se pudo confirmar la limpieza del archivo; requiere revisión del almacenamiento');
        } catch (cleanupError) {
          if (!(cleanupError instanceof NotFoundException)) throw new ServiceUnavailableException('No se pudo confirmar la limpieza del archivo; requiere revisión del almacenamiento');
        }
      }
      throw error;
    }
  }

  async obtenerDocumento(documentoId: string, user: CurrentUser) {
    // Alcance comprobado antes de recuperar cualquier contenido físico.
    if (!['asesor', 'auxiliar administrativo'].includes(user.roles?.nombre)) throw new ForbiddenException('Rol sin acceso documental');
    const doc = await this.prisma.documentos_clientes.findUnique({ where: { id: documentoId }, select: { ...documentoSelect, archivo_path: true } });
    if (!doc) throw new NotFoundException('Documento no encontrado');
    await this.assertClienteAutorizado(doc.cliente_id, user);
    if (doc.etapa_tramite && doc.etapa_tramite.cliente_id !== doc.cliente_id) throw new ConflictException('Documento asociado a una etapa de otro cliente');
    return { file: await this.storage.get(doc.archivo_path), filename: doc.nombre_archivo_original ?? 'documento', contentType: doc.mime_type ?? 'application/octet-stream' };
  }

  async actualizarMetadatos(documentoId: string, dto: MetadatosDocumentoDto, user: CurrentUser) {
    assertAsesor(user);
    if (!Object.keys(dto).length || Object.keys(dto).some((k) => !['observaciones', 'numero_referencia'].includes(k))) throw new BadRequestException('Metadatos no admitidos');
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT d.id FROM documentos_clientes d JOIN clientes c ON c.id = d.cliente_id WHERE d.id = ${documentoId}::uuid AND c.asesor_id = ${user.id}::uuid FOR UPDATE OF c, d`;
      if (!rows.length) throw new NotFoundException('Documento no encontrado o fuera de tu alcance');
      const doc = await tx.documentos_clientes.findUnique({ where: { id: documentoId }, select: { estatus: true, _count: { select: { envios_documento: true, serviciosComplementariosDocumentos: true } } } });
      if (doc?.estatus === 'si' || doc?._count.envios_documento || doc?._count.serviciosComplementariosDocumentos) throw new ConflictException('Documento confirmado o referenciado; se requiere una política de modificación');
      return tx.documentos_clientes.update({ where: { id: documentoId }, data: { ...(dto.observaciones !== undefined ? { observaciones: dto.observaciones } : {}), ...(dto.numero_referencia !== undefined ? { numero_referencia: dto.numero_referencia } : {}) }, select: documentoSelect });
    });
  }

  async eliminarDocumento(documentoId: string, user: CurrentUser): Promise<void> {
    assertAsesor(user);
    let deleteAttempted = false;
    try {
      await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ id: string }[]>`SELECT d.id FROM documentos_clientes d JOIN clientes c ON c.id = d.cliente_id WHERE d.id = ${documentoId}::uuid AND c.asesor_id = ${user.id}::uuid FOR UPDATE OF c, d`;
        if (!rows.length) throw new NotFoundException('Documento no encontrado o fuera de tu alcance');
        const doc = await tx.documentos_clientes.findUnique({ where: { id: documentoId }, select: { estatus: true, _count: { select: { envios_documento: true, serviciosComplementariosDocumentos: true } } } });
        if (!doc) throw new NotFoundException('Documento no encontrado o fuera de tu alcance');
        if (doc.estatus === 'si' || doc._count.envios_documento || doc._count.serviciosComplementariosDocumentos) throw new ConflictException('Documento confirmado o referenciado');
        // Se registra antes del DELETE: una caída durante el commit requiere conciliación.
        this.logger.warn(`Eliminación documental iniciada; conciliar almacenamiento. documento=${documentoId} actor=${user.id}`);
        deleteAttempted = true;
        await tx.documentos_clientes.delete({ where: { id: documentoId } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') throw new ConflictException('Documento referenciado');
      if (error instanceof NotFoundException || error instanceof ConflictException) throw error;
      if (deleteAttempted) this.logger.error(`Resultado de eliminación documental no confirmado; conciliar almacenamiento y registro. documento=${documentoId} actor=${user.id}`);
      throw new ServiceUnavailableException('No se pudo confirmar la eliminación; requiere revisión');
    }
    // Ningún protocolo compartido impide que se cree una referencia concurrente al archivo.
    this.logger.warn(`Registro documental eliminado; archivo conservado para conciliación. documento=${documentoId} actor=${user.id}`);
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
