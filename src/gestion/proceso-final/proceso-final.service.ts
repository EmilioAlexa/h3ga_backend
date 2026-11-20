import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, categoria_tramite } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { QueryProcesoFinalClientesDto } from './dto/query-proceso-final-clientes.dto';
import { UpdateProcesoFinalEtapaDto } from './dto/update-proceso-final-etapa.dto';
import { UpsertProcesoFinalDatosInstitucionalesDto } from './dto/upsert-proceso-final-datos-institucionales.dto';

const PASO_INICIAL_PROCESO_FINAL = 8;
const PASO_FINAL_PROCESO_FINAL = 14;
const ESTATUS_POR_INICIAR = 2;
const ESTATUS_EN_PROCESO = new Set([3, 4, 5]);
const ESTATUS_FINALIZADO = 6;
const ESTATUS_EXCEPCION = new Set([7, 8, 9]);

const etapaSelect = {
  id: true,
  cliente_id: true,
  estatus_id: true,
  avance_porcentaje: true,
  accion_a_realizar: true,
  fecha_compromiso: true,
  fecha_completada: true,
  reactivado_en: true,
  motivo_rechazo: true,
  actualizado_el: true,
  etapas_proceso: { select: { id: true, numero_paso: true, nombre: true } },
  estatus_tramite: { select: { id: true, nombre: true, categoria: true } },
  pension_final_datos_tramite: true,
  documentos: {
    select: {
      id: true,
      cliente_id: true,
      tipo_documento_id: true,
      nombre_archivo_original: true,
      mime_type: true,
      estatus: true,
      numero_referencia: true,
      fecha_carga: true,
      observaciones: true,
      tipo_documento: { select: { nombre: true } },
    },
    orderBy: { fecha_carga: 'desc' as const },
  },
} satisfies Prisma.etapas_tramiteSelect;

export interface UsuarioProcesoFinal {
  id: string;
  roles: { nombre: string };
}

@Injectable()
export class ProcesoFinalService {
  constructor(private readonly prisma: PrismaService) {}

  async findClientes(query: QueryProcesoFinalClientesDto, user: UsuarioProcesoFinal) {
    this.assertAsesor(user);
    const etapaWhere: Prisma.etapas_tramiteWhereInput = {
      etapas_proceso: { numero_paso: { gte: PASO_INICIAL_PROCESO_FINAL, lte: PASO_FINAL_PROCESO_FINAL } },
      ...(query.estatus_id ? { estatus_id: query.estatus_id } : {}),
    };
    const where: Prisma.clientesWhereInput = {
      asesor_id: user.id,
      etapas_tramite: { some: etapaWhere },
      ...(query.q
        ? {
            OR: [
              { nombre: { contains: query.q, mode: 'insensitive' } },
              { apellido_paterno: { contains: query.q, mode: 'insensitive' } },
              { apellido_materno: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const clientes = await this.prisma.clientes.findMany({
      where,
      select: {
        id: true,
        nombre: true,
        apellido_paterno: true,
        apellido_materno: true,
        etapas_tramite: { where: etapaWhere, select: etapaSelect, orderBy: { etapas_proceso: { numero_paso: 'asc' } } },
      },
      orderBy: [{ apellido_paterno: 'asc' }, { nombre: 'asc' }, { id: 'asc' }],
    });
    const cards = clientes.map((cliente) => this.toClienteCard(cliente));
    if (query.orden === 'compromiso') {
      cards.sort((a, b) => this.dateSortKey(a.proximo_compromiso) - this.dateSortKey(b.proximo_compromiso));
    }
    const total = cards.length;
    const offset = (query.page - 1) * query.limit;
    return {
      data: cards.slice(offset, offset + query.limit),
      pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
    };
  }

  async findCliente(clienteId: string, user: UsuarioProcesoFinal) {
    this.assertAsesor(user);
    const cliente = await this.prisma.clientes.findFirst({
      where: { id: clienteId, asesor_id: user.id },
      select: {
        id: true,
        nombre: true,
        apellido_paterno: true,
        apellido_materno: true,
        afore: { select: { id: true, nombre: true } },
        regimen_principal: { select: { id: true, nombre: true } },
        etapas_tramite: {
          where: this.whereEtapasProcesoFinal(),
          select: etapaSelect,
          orderBy: { etapas_proceso: { numero_paso: 'asc' } },
        },
      },
    });
    if (!cliente) throw new NotFoundException('Cliente no encontrado o fuera de tu alcance');
    return { ...cliente, etapas: cliente.etapas_tramite, compromisos: this.toCompromisos(cliente.etapas_tramite) };
  }

  async findEtapa(clienteId: string, etapaId: string, user: UsuarioProcesoFinal) {
    this.assertAsesor(user);
    return this.findEtapaAutorizada(clienteId, etapaId, user);
  }

  async findDocumentos(clienteId: string, etapaId: string, user: UsuarioProcesoFinal) {
    const etapa = await this.findEtapaAutorizada(clienteId, etapaId, user);
    return etapa.documentos;
  }

  async findDatosInstitucionales(clienteId: string, etapaId: string, user: UsuarioProcesoFinal) {
    const etapa = await this.findEtapaAutorizada(clienteId, etapaId, user);
    return etapa.pension_final_datos_tramite;
  }

  async findCompromisos(user: UsuarioProcesoFinal) {
    this.assertAsesor(user);
    const etapas = await this.prisma.etapas_tramite.findMany({
      where: {
        clientes: { asesor_id: user.id },
        ...this.whereEtapasProcesoFinal(),
        fecha_compromiso: { not: null },
      },
      select: {
        id: true,
        cliente_id: true,
        fecha_compromiso: true,
        accion_a_realizar: true,
        estatus_tramite: { select: { id: true, nombre: true, categoria: true } },
        etapas_proceso: { select: { numero_paso: true, nombre: true } },
        clientes: { select: { id: true, nombre: true, apellido_paterno: true, apellido_materno: true } },
      },
      orderBy: { fecha_compromiso: 'asc' },
    });
    return this.toCompromisos(etapas);
  }

  async findCompromisosCliente(clienteId: string, user: UsuarioProcesoFinal) {
    this.assertAsesor(user);
    await this.assertClienteAutorizado(clienteId, user);
    const etapas = await this.prisma.etapas_tramite.findMany({
      where: { cliente_id: clienteId, ...this.whereEtapasProcesoFinal(), fecha_compromiso: { not: null } },
      select: {
        id: true,
        cliente_id: true,
        fecha_compromiso: true,
        accion_a_realizar: true,
        estatus_tramite: { select: { id: true, nombre: true, categoria: true } },
        etapas_proceso: { select: { numero_paso: true, nombre: true } },
      },
      orderBy: { fecha_compromiso: 'asc' },
    });
    return this.toCompromisos(etapas);
  }

  async findCobranzaFinal(clienteId: string, user: UsuarioProcesoFinal) {
    this.assertAsesor(user);
    await this.assertClienteAutorizado(clienteId, user);
    const etapaCobranza = await this.prisma.etapas_tramite.findFirst({
      where: { cliente_id: clienteId, etapas_proceso: { numero_paso: 14 } },
      select: etapaSelect,
    });
    if (!etapaCobranza) throw new NotFoundException('La etapa de cobranza final no existe para el cliente');
    const pagos = await this.prisma.pagos.findMany({
      where: { contratos: { is: { cliente_id: clienteId, asesor_id: user.id } } },
      select: {
        id: true, monto: true, fecha_pago: true, fecha_registro: true, referencia_pago: true, folio_recibo: true,
        observaciones: true, estados_pago: { select: { id: true, nombre: true } },
        formas_pago: { select: { id: true, nombre: true } },
        contratos: { select: { id: true, folio: true, servicio_id: true, servicios: { select: { nombre: true } } } },
      },
      orderBy: [{ fecha_registro: 'desc' }, { id: 'desc' }],
    });
    return {
      etapa: etapaCobranza,
      pagos,
      identificacion_cobranza_final: false,
      limitacion: 'El modelo actual no vincula pagos individuales con la etapa de cobranza final; se muestran pagos existentes del cliente sin atribuirlos al cierre.',
    };
  }

  async updateEtapa(clienteId: string, etapaId: string, dto: UpdateProcesoFinalEtapaDto, user: UsuarioProcesoFinal) {
    this.assertAsesor(user);
    if (Object.keys(dto).length === 0) throw new BadRequestException('Debe proporcionar al menos un campo actualizable');
    const etapa = await this.findEtapaAutorizada(clienteId, etapaId, user);
    const nuevoEstatusId = dto.estatus_id ?? etapa.estatus_id;
    const nuevoEstatus = await this.prisma.estatus_tramite.findUnique({ where: { id: nuevoEstatusId } });
    if (!nuevoEstatus) throw new BadRequestException('El estatus indicado no existe');
    const cambioEstatus = nuevoEstatusId !== etapa.estatus_id;
    const data: Prisma.etapas_tramiteUpdateInput = { actualizado_el: new Date() };

    if (dto.accion_a_realizar !== undefined) data.accion_a_realizar = this.nullableText(dto.accion_a_realizar);
    if (dto.fecha_compromiso !== undefined) data.fecha_compromiso = this.toDate(dto.fecha_compromiso);

    if (nuevoEstatusId === ESTATUS_POR_INICIAR) {
      data.avance_porcentaje = 10;
    } else if (ESTATUS_EN_PROCESO.has(nuevoEstatusId)) {
      if (dto.avance_porcentaje !== undefined) {
        this.assertRangoProceso(dto.avance_porcentaje);
        data.avance_porcentaje = dto.avance_porcentaje;
      }
    } else if (nuevoEstatusId === ESTATUS_FINALIZADO) {
      data.avance_porcentaje = 100;
      data.fecha_completada = new Date();
    } else if (ESTATUS_EXCEPCION.has(nuevoEstatusId) && dto.avance_porcentaje !== undefined) {
      throw new BadRequestException('No se permite modificar el avance en un estado de excepción');
    } else if (dto.avance_porcentaje !== undefined) {
      throw new BadRequestException('El avance no es editable para el estatus indicado');
    }

    if (nuevoEstatusId === 7) {
      const motivo = this.nullableText(dto.motivo_rechazo ?? etapa.motivo_rechazo);
      if (!motivo) throw new BadRequestException('El motivo de rechazo es obligatorio al bloquear una etapa');
      data.motivo_rechazo = motivo;
    } else if (dto.motivo_rechazo !== undefined || cambioEstatus) {
      data.motivo_rechazo = null;
    }
    if (cambioEstatus && ESTATUS_EXCEPCION.has(etapa.estatus_id) && !ESTATUS_EXCEPCION.has(nuevoEstatusId)) {
      data.reactivado_en = new Date();
    }
    if (cambioEstatus) data.estatus_tramite = { connect: { id: nuevoEstatusId } };

    return this.prisma.$transaction(async (tx) => {
      const actualizada = await tx.etapas_tramite.update({ where: { id: etapaId }, data, select: etapaSelect });
      if (cambioEstatus) {
        await tx.etapas_tramite_historial.create({
          data: {
            etapa_tramite_id: etapaId,
            estatus_anterior_id: etapa.estatus_id,
            estatus_nuevo_id: nuevoEstatusId,
            motivo_rechazo: nuevoEstatusId === 7 ? (data.motivo_rechazo as string) : null,
            cambiado_por: user.id,
          },
        });
      }
      return actualizada;
    });
  }

  async upsertDatosInstitucionales(clienteId: string, etapaId: string, dto: UpsertProcesoFinalDatosInstitucionalesDto, user: UsuarioProcesoFinal) {
    this.assertAsesor(user);
    await this.findEtapaAutorizada(clienteId, etapaId, user);
    const data = {
      ...(dto.institucion !== undefined ? { institucion: this.nullableText(dto.institucion) } : {}),
      ...(dto.folio_institucional !== undefined ? { folio_institucional: this.nullableText(dto.folio_institucional) } : {}),
      ...(dto.numero_expediente !== undefined ? { numero_expediente: this.nullableText(dto.numero_expediente) } : {}),
      ...(dto.fecha_solicitud !== undefined ? { fecha_solicitud: this.toDate(dto.fecha_solicitud) } : {}),
      ...(dto.fecha_resolucion !== undefined ? { fecha_resolucion: this.toDate(dto.fecha_resolucion) } : {}),
      ...(dto.resultado_resolucion !== undefined ? { resultado_resolucion: this.nullableText(dto.resultado_resolucion) } : {}),
      ...(dto.observaciones !== undefined ? { observaciones: this.nullableText(dto.observaciones) } : {}),
      actualizado_el: new Date(),
    };
    return this.prisma.pension_final_datos_tramite.upsert({
      where: { etapa_tramite_id: etapaId },
      create: { etapa_tramite_id: etapaId, ...data },
      update: data,
    });
  }

  private whereEtapasProcesoFinal(): Prisma.etapas_tramiteWhereInput {
    return { etapas_proceso: { numero_paso: { gte: PASO_INICIAL_PROCESO_FINAL, lte: PASO_FINAL_PROCESO_FINAL } } };
  }

  private assertAsesor(user: UsuarioProcesoFinal) {
    if (user.roles?.nombre !== 'asesor') throw new ForbiddenException('Solo el asesor puede operar Proceso Final');
  }

  private async assertClienteAutorizado(clienteId: string, user: UsuarioProcesoFinal) {
    const cliente = await this.prisma.clientes.findFirst({ where: { id: clienteId, asesor_id: user.id }, select: { id: true } });
    if (!cliente) throw new NotFoundException('Cliente no encontrado o fuera de tu alcance');
  }

  private async findEtapaAutorizada(clienteId: string, etapaId: string, user: UsuarioProcesoFinal) {
    const etapa = await this.prisma.etapas_tramite.findFirst({
      where: { id: etapaId, cliente_id: clienteId, clientes: { asesor_id: user.id }, ...this.whereEtapasProcesoFinal() },
      select: etapaSelect,
    });
    if (!etapa) throw new NotFoundException('Etapa no encontrada o fuera de tu alcance');
    return etapa;
  }

  private toClienteCard(cliente: { id: string; nombre: string; apellido_paterno: string; apellido_materno: string | null; etapas_tramite: Array<{ avance_porcentaje: number; fecha_compromiso: Date | null; estatus_tramite: { categoria: categoria_tramite } }> }) {
    const etapasContables = cliente.etapas_tramite.filter((etapa) => etapa.estatus_tramite.categoria !== 'no_aplica');
    const completadas = etapasContables.filter((etapa) => etapa.estatus_tramite.categoria === 'completado').length;
    const avance = etapasContables.length
      ? Math.round(etapasContables.reduce((total, etapa) => total + etapa.avance_porcentaje, 0) / etapasContables.length)
      : null;
    const proximo = cliente.etapas_tramite
      .filter((etapa) => etapa.fecha_compromiso && etapa.estatus_tramite.categoria !== 'completado')
      .map((etapa) => etapa.fecha_compromiso!)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    return {
      cliente_id: cliente.id,
      nombre: [cliente.nombre, cliente.apellido_paterno, cliente.apellido_materno].filter(Boolean).join(' '),
      etapas_aplicables: etapasContables.length,
      etapas_completadas: completadas,
      avance_porcentaje: avance,
      proximo_compromiso: proximo,
    };
  }

  private toCompromisos(etapas: Array<{ id: string; cliente_id: string; fecha_compromiso: Date | null; accion_a_realizar: string | null; estatus_tramite: { id: number; nombre: string; categoria: categoria_tramite }; etapas_proceso: { numero_paso: number; nombre: string }; clientes?: { id: string; nombre: string; apellido_paterno: string; apellido_materno: string | null } }>) {
    return etapas
      .filter((etapa) => etapa.fecha_compromiso && etapa.estatus_tramite.categoria !== 'completado')
      .map((etapa) => ({
        etapa_tramite_id: etapa.id,
        cliente_id: etapa.cliente_id,
        cliente: etapa.clientes,
        etapa: etapa.etapas_proceso,
        estatus: etapa.estatus_tramite,
        accion_a_realizar: etapa.accion_a_realizar,
        fecha_compromiso: etapa.fecha_compromiso,
        clasificacion: this.clasificarCompromiso(etapa.fecha_compromiso!),
      }));
  }

  private clasificarCompromiso(fecha: Date): 'vencido' | 'hoy' | 'proximo' {
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Cancun', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date()).filter((part) => part.type !== 'literal').map((part) => part.value).join('-');
    const fechaTexto = fecha.toISOString().slice(0, 10);
    if (fechaTexto < hoy) return 'vencido';
    if (fechaTexto === hoy) return 'hoy';
    return 'proximo';
  }

  private dateSortKey(fecha: Date | null): number {
    return fecha?.getTime() ?? Number.MAX_SAFE_INTEGER;
  }

  private assertRangoProceso(avance: number) {
    if (avance < 20 || avance > 90) throw new BadRequestException('El avance para un estado en proceso debe estar entre 20 y 90');
  }

  private nullableText(value: string | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    return value.trim() || null;
  }

  private toDate(value: string | null): Date | null {
    return value === null ? null : new Date(`${value}T00:00:00.000Z`);
  }
}
