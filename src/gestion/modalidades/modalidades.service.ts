import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { GestionDocumentalService } from '../gestion-documental/gestion-documental.service';
import { ActualizarModalidadDto, GuardarModalidadesDto, QueryModalidadesAgendaDto, QueryModalidadesClientesDto } from './dto/modalidades.dto';
import { assertAsesor, CAMPOS, clasificarEvento, clasificarFecha, modalidadDeEtapa, modalidadValida, MODALIDADES, seleccionActual, validarFases, validarSeleccion } from './modalidades.rules';
import type { UsuarioModalidades } from './modalidades.rules';

const appInclude = { seguimientos: true, diagnostico_especializado: { select: { cliente_id: true } } } satisfies Prisma.modalidades_aplicacionInclude;
type Aplicacion = Prisma.modalidades_aplicacionGetPayload<{ include: typeof appInclude }>;
const clienteSelect = { id: true, nombre: true, apellido_paterno: true, apellido_materno: true, fecha_ingreso: true, nss: true, semanas_imss_reconocidas: true, afore: { select: { id: true, nombre: true } }, regimen_principal: { select: { id: true, nombre: true } } } satisfies Prisma.clientesSelect;
const ESTATUS: Record<string, string> = { 'Por iniciar': 'pendiente', 'En proceso cliente': 'en_proceso', 'En proceso asesor': 'en_proceso', 'En proceso Instituto': 'en_proceso', Finalizado: 'completado', Bloqueado: 'excepcion', Cancelado: 'excepcion', Detenido: 'excepcion' };

@Injectable()
export class ModalidadesService {
  constructor(private readonly prisma: PrismaService, private readonly documental: GestionDocumentalService) {}

  async catalogos(user: UsuarioModalidades, db: Prisma.TransactionClient = this.prisma) {
    assertAsesor(user);
    const [fases, estados] = await Promise.all([
      db.fase_modalidad.findMany({ orderBy: { orden: 'asc' } }),
      db.estatus_tramite.findMany({ orderBy: { nombre: 'asc' } }),
    ]);
    validarFases(fases);
    const estatus = estados.filter((e) => ESTATUS[e.nombre] === e.categoria);
    if (new Set(estatus.map((e) => e.nombre)).size !== estatus.length) throw new ConflictException('El catálogo contiene estatus semánticamente duplicados');
    if (!estatus.some((e) => e.nombre === 'Finalizado' && e.categoria === 'completado')) throw new ConflictException('Falta el estatus de finalización compatible');
    return { fases, estatus: estatus.map((e) => ({ ...e, etiqueta: e.nombre === 'Finalizado' ? 'Concluido' : e.nombre, terminal: e.categoria === 'completado' })) };
  }

  // Todos los escritores del módulo adquieren la misma fila ANTES de leer la aplicación.
  // READ COMMITTED renueva el snapshot después de esperar al escritor anterior.
  private async conBloqueo<T>(clienteId: string, user: UsuarioModalidades, work: (tx: Prisma.TransactionClient) => Promise<T>) {
    assertAsesor(user);
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM clientes WHERE id = ${clienteId}::uuid AND asesor_id = ${user.id}::uuid FOR UPDATE`;
      if (rows.length !== 1) throw new NotFoundException('Cliente no encontrado o fuera de tu alcance');
      return work(tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10000, timeout: 15000 });
  }

  private async cliente(clienteId: string, user: UsuarioModalidades) {
    assertAsesor(user);
    const cliente = await this.prisma.clientes.findFirst({ where: { id: clienteId, asesor_id: user.id }, select: clienteSelect });
    if (!cliente) throw new NotFoundException('Cliente no encontrado o fuera de tu alcance');
    return cliente;
  }

  private async aplicacion(clienteId: string, db: Prisma.TransactionClient = this.prisma, asesorId?: string) {
    const rows = await db.modalidades_aplicacion.findMany({ where: { cliente_id: clienteId, ...(asesorId ? { clientes: { asesor_id: asesorId } } : {}) }, include: appInclude, take: 2 });
    if (rows.length > 1) throw new ConflictException('Existen aplicaciones duplicadas; se requiere conciliación');
    const row = rows[0];
    if (row) this.validarAplicacion(row);
    return row ?? null;
  }

  private validarAplicacion(row: Aplicacion) {
    let tipo: string;
    try { tipo = validarSeleccion(seleccionActual(row)); } catch { throw new ConflictException('Selección histórica inconsistente'); }
    if (tipo !== row.tipo_modalidad || row.diagnostico_especializado.cliente_id !== row.cliente_id) throw new ConflictException('Aplicación o diagnóstico inconsistente');
    for (const m of MODALIDADES) {
      const c = CAMPOS[m];
      if (!row[c.aplica] && (row[c.fase] !== null || row[c.estatus] !== null)) throw new ConflictException('Seguimiento activo en modalidad no seleccionada');
      if (row[c.aplica] && !row.seguimientos.some((s) => s.modalidad === m)) throw new ConflictException('Falta seguimiento individual; revisar migración');
    }
  }

  private resumen(row: Aplicacion, catalogos: Awaited<ReturnType<ModalidadesService['catalogos']>>) {
    for (const m of seleccionActual(row)) {
      const c = CAMPOS[m];
      if ((row[c.fase] !== null && !catalogos.fases.some((f) => f.id === row[c.fase])) ||
          (row[c.estatus] !== null && !catalogos.estatus.some((e) => e.id === row[c.estatus]))) {
        throw new ConflictException('La modalidad contiene fase o estatus fuera del catálogo compatible');
      }
    }
    return {
      id: row.id, cliente_id: row.cliente_id, tipo_modalidad: row.tipo_modalidad,
      creado_el: row.creado_el, actualizado_el: row.actualizado_el,
      valores_historicos_compartidos: {
        fecha_cita_imss: row.fecha_cita_imss, ultimo_salario_diario_registrado: row.ultimo_salario_diario_registrado,
        motivo_cierre: row.motivo_cierre, atribucion_modalidad: null,
      },
      modalidades: seleccionActual(row).map((m) => {
        const c = CAMPOS[m], datos = row.seguimientos.find((s) => s.modalidad === m)!;
        return { modalidad: m, fase: catalogos.fases.find((f) => f.id === row[c.fase]) ?? null,
          estatus: catalogos.estatus.find((e) => e.id === row[c.estatus]) ?? null,
          fecha_cita_imss: datos.fecha_cita_imss, ultimo_salario_diario_registrado: datos.ultimo_salario_diario_registrado,
          motivo_cierre: datos.motivo_cierre, creado_el: datos.creado_el, actualizado_el: datos.actualizado_el,
          creado_por: datos.creado_por, actualizado_por: datos.actualizado_por,
          auditoria_historica_sin_autor: datos.creado_por === null,
        };
      }),
    };
  }

  async findModalidades(clienteId: string, user: UsuarioModalidades) {
    await this.cliente(clienteId, user);
    const [row, cats] = await Promise.all([this.aplicacion(clienteId, this.prisma, user.id), this.catalogos(user)]);
    return row ? this.resumen(row, cats) : null;
  }

  async guardar(clienteId: string, dto: GuardarModalidadesDto, user: UsuarioModalidades) {
    assertAsesor(user);
    const tipo = validarSeleccion(dto.modalidades);
    return this.conBloqueo(clienteId, user, async (tx) => {
      const original = await this.aplicacion(clienteId, tx);
      if (original && seleccionActual(original).some((m) => !dto.modalidades.includes(m))) throw new ConflictException('Retirar o sustituir modalidades requiere una política aprobada');
      const diagnostico = await tx.diagnostico_especializado.findUnique({ where: { cliente_id: clienteId }, select: { id: true } });
      if (!diagnostico) throw new ConflictException('Se requiere el diagnóstico especializado del cliente');
      const cats = await this.catalogos(user, tx);
      const inicial = cats.estatus.find((e) => e.nombre === 'Por iniciar' && e.categoria === 'pendiente');
      if (!inicial) throw new ConflictException('Falta el estatus inicial compatible');
      const nuevos = dto.modalidades.filter((m) => !original?.[CAMPOS[m].aplica]);
      if (original && nuevos.length === 0) return this.resumen(original, cats);
      const now = new Date();
      const data: Prisma.modalidades_aplicacionUncheckedUpdateInput = { tipo_modalidad: tipo, actualizado_el: now };
      for (const m of nuevos) {
        const c = CAMPOS[m];
        data[c.aplica] = true; data[c.fase] = cats.fases[0].id; data[c.estatus] = inicial.id;
      }
      const row = original
        ? await tx.modalidades_aplicacion.update({ where: { id: original.id }, data })
        : await tx.modalidades_aplicacion.create({ data: {
          cliente_id: clienteId, diagnostico_id: diagnostico.id, tipo_modalidad: tipo,
          ...Object.fromEntries(nuevos.flatMap((m) => { const c = CAMPOS[m]; return [[c.aplica, true], [c.fase, cats.fases[0].id], [c.estatus, inicial.id]]; })),
        } });
      for (const m of nuevos) await tx.modalidades_seguimiento.create({ data: { modalidad_aplicacion_id: row.id, modalidad: m, creado_por: user.id, actualizado_por: user.id, creado_el: now, actualizado_el: now } });
      return this.resumen((await this.aplicacion(clienteId, tx))!, cats);
    });
  }

  async actualizar(clienteId: string, modalidad: string, dto: ActualizarModalidadDto, user: UsuarioModalidades) {
    assertAsesor(user);
    const m = modalidadValida(modalidad), c = CAMPOS[m];
    const allowed = ['fase_id', 'estatus_id', 'fecha_cita_imss', 'ultimo_salario_diario_registrado'];
    if (!Object.keys(dto).length || Object.keys(dto).some((k) => !allowed.includes(k))) throw new BadRequestException('Campos de seguimiento no admitidos');
    return this.conBloqueo(clienteId, user, async (tx) => {
      const row = await this.aplicacion(clienteId, tx);
      if (!row?.[c.aplica]) throw new NotFoundException('Modalidad no seleccionada');
      const cats = await this.catalogos(user, tx);
      this.resumen(row, cats); // No corregir silenciosamente un catálogo histórico incompatible.
      if (dto.fase_id !== undefined && !cats.fases.some((f) => f.id === dto.fase_id)) throw new BadRequestException('Fase inexistente');
      if (dto.estatus_id !== undefined && !cats.estatus.some((e) => e.id === dto.estatus_id)) throw new BadRequestException('Estatus inexistente o incompatible');
      const previo = cats.estatus.find((e) => e.id === row[c.estatus]);
      if (previo?.terminal && ((dto.estatus_id !== undefined && dto.estatus_id !== previo.id) || (dto.fase_id !== undefined && dto.fase_id !== row[c.fase]))) throw new ConflictException('La reactivación de una modalidad concluida requiere una política aprobada');
      const now = new Date();
      await tx.modalidades_aplicacion.update({ where: { id: row.id }, data: {
        actualizado_el: now, ...(dto.fase_id !== undefined ? { [c.fase]: dto.fase_id } : {}), ...(dto.estatus_id !== undefined ? { [c.estatus]: dto.estatus_id } : {}),
      } });
      await tx.modalidades_seguimiento.update({ where: { modalidad_aplicacion_id_modalidad: { modalidad_aplicacion_id: row.id, modalidad: m } }, data: {
        actualizado_el: now, actualizado_por: user.id,
        ...(dto.fecha_cita_imss !== undefined ? { fecha_cita_imss: dto.fecha_cita_imss === null ? null : new Date(`${dto.fecha_cita_imss}T00:00:00Z`) } : {}),
        ...(dto.ultimo_salario_diario_registrado !== undefined ? { ultimo_salario_diario_registrado: dto.ultimo_salario_diario_registrado } : {}),
      } });
      return this.resumen((await this.aplicacion(clienteId, tx))!, cats).modalidades.find((s) => s.modalidad === m)!;
    });
  }

  private intervalo(desde?: string, hasta?: string) {
    if (desde && hasta && desde > hasta) throw new BadRequestException('El inicio del intervalo es posterior al fin');
    return { ...(desde ? { gte: new Date(`${desde}T00:00:00Z`) } : {}), ...(hasta ? { lte: new Date(`${hasta}T00:00:00Z`) } : {}) };
  }

  async findClientes(q: QueryModalidadesClientesDto, user: UsuarioModalidades) {
    assertAsesor(user);
    const rango = this.intervalo(q.fecha_desde, q.fecha_hasta);
    if (q.modalidad && q.combinacion) throw new BadRequestException('Utilice modalidad o combinación, no ambos filtros');
    const modes = q.modalidad ? [q.modalidad] : [...MODALIDADES];
    const filtro: Prisma.modalidades_aplicacionWhereInput = {
      ...(q.combinacion ? { aplica_m40r: true, aplica_m10: q.combinacion === 'm10_m40r', aplica_m40: q.combinacion === 'm40_m40r' } : {}),
      OR: modes.map((m) => ({ [CAMPOS[m].aplica]: true,
        ...(q.estatus_id ? { [CAMPOS[m].estatus]: q.estatus_id } : {}),
        ...(q.fecha_desde || q.fecha_hasta ? { seguimientos: { some: { modalidad: m, fecha_cita_imss: rango } } } : {}),
      })),
    };
    const where: Prisma.clientesWhereInput = { asesor_id: user.id, modalidades_aplicacion: { some: filtro },
      ...(q.q ? { AND: q.q.split(/\s+/).filter(Boolean).map((word) => ({ OR: ['nombre', 'apellido_paterno', 'apellido_materno'].map((field) => ({ [field]: { contains: word, mode: 'insensitive' } })) })) } : {}),
    };
    const [clientes, total, cats] = await Promise.all([
      this.prisma.clientes.findMany({ where, select: { ...clienteSelect, modalidades_aplicacion: { include: appInclude } },
        orderBy: q.orden === 'ingreso' ? [{ fecha_ingreso: 'desc' }, { id: 'asc' }] : [{ apellido_paterno: 'asc' }, { nombre: 'asc' }, { id: 'asc' }], skip: (q.page - 1) * q.limit, take: q.limit }),
      this.prisma.clientes.count({ where }), this.catalogos(user),
    ]);
    return { data: clientes.map(({ modalidades_aplicacion: apps, ...cliente }) => {
      if (apps.length !== 1) throw new ConflictException('Aplicaciones duplicadas; se requiere conciliación');
      this.validarAplicacion(apps[0]);
      return { ...cliente, seguimiento: this.resumen(apps[0], cats) };
    }), pagination: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) } };
  }

  async findCliente(clienteId: string, user: UsuarioModalidades) {
    const cliente = await this.cliente(clienteId, user);
    const [seguimiento, agenda, documentos] = await Promise.all([
      this.findModalidades(clienteId, user), this.agenda({ cliente_id: clienteId }, user), this.documental.findDocumentos(clienteId, user),
    ]);
    return { cliente, seguimiento, agenda, documentos };
  }

  async findModalidad(clienteId: string, modalidad: string, user: UsuarioModalidades) {
    const m = modalidadValida(modalidad);
    const resumen = await this.findModalidades(clienteId, user);
    const seguimiento = resumen?.modalidades.find((s) => s.modalidad === m);
    if (!seguimiento) throw new NotFoundException('Modalidad no seleccionada');
    const diagnostico = await this.prisma.diagnostico_especializado.findUnique({ where: { cliente_id: clienteId }, select: {
      id: true, fecha_analisis: true, observaciones_regimen: true, semanas_reconocidas_al_baja: true,
      ...(m === 'modalidad_10' ? { trabaja_cuenta_propia: true, actividad_economica: true, ingreso_mensual_aproximado: true, conclusion_modalidad_10: true, comentarios_modalidad_10: true, diagnostico_objetivos_m10: { include: { objetivo_modalidad_10: true } }, modalidad10_criterios: true } : {}),
      ...(m === 'modalidad_40' ? { fecha_ultima_baja: true, ultimo_salario_cotizado: true, dado_de_baja_regimen_obligatorio: true, salario_propuesto_m40: true, meses_propuestos_m40: true, conclusion_modalidad_40: true, comentarios_modalidad_40: true, diagnostico_objetivos_m40: { include: { objetivo_modalidad_40: true } }, modalidad40_criterios: true } : {}),
      ...(m === 'modalidad_40_retroactiva' ? { analisis_modalidad40_retroactivo: { include: { retroactivo_evaluacion_conveniencia: true } } } : {}),
    } });
    const etapas = await this.prisma.etapas_tramite.findMany({ where: { cliente_id: clienteId, clientes: { asesor_id: user.id }, etapas_proceso: { numero_paso: CAMPOS[m].paso, nombre: CAMPOS[m].etapa } }, select: {
      id: true, avance_porcentaje: true, accion_a_realizar: true, fecha_compromiso: true, fecha_completada: true, estatus_id: true,
    } });
    return { cliente: await this.cliente(clienteId, user), seguimiento, diagnostico_referencia: diagnostico, etapa_referencia: etapas[0] ?? null,
      valores_historicos_compartidos: resumen!.valores_historicos_compartidos,
      limitaciones: { etapa_no_disponible: etapas.length === 0, sincronizacion_etapa_modalidad: false, finales_alternativos_pendientes: true } };
  }

  async agenda(q: QueryModalidadesAgendaDto, user: UsuarioModalidades) {
    assertAsesor(user);
    if (q.cliente_id) await this.cliente(q.cliente_id, user);
    const fecha = this.intervalo(q.fecha_desde, q.fecha_hasta);
    const clienteWhere: Prisma.clientesWhereInput = { asesor_id: user.id, ...(q.cliente_id ? { id: q.cliente_id } : {}), modalidades_aplicacion: { some: {} } };
    const [eventos, etapas, aplicaciones] = await Promise.all([
      this.prisma.eventos_agenda.findMany({ where: { asesor_id: user.id, clientes: clienteWhere, fecha, ...(q.estatus ? { estatus: q.estatus } : {}) }, select: { id: true, cliente_id: true, fecha: true, hora: true, motivo: true, estatus: true }, orderBy: [{ fecha: 'asc' }, { id: 'asc' }] }),
      this.prisma.etapas_tramite.findMany({ where: { clientes: clienteWhere, fecha_compromiso: { not: null, ...fecha }, etapas_proceso: { numero_paso: { in: [5, 6, 7] } } }, select: { id: true, cliente_id: true, fecha_compromiso: true, accion_a_realizar: true, etapas_proceso: true, estatus_tramite: { select: { nombre: true, categoria: true } } } }),
      this.prisma.modalidades_aplicacion.findMany({ where: { clientes: clienteWhere }, include: appInclude }),
    ]);
    const now = new Date();
    const selected = new Map<string, string[]>();
    for (const app of aplicaciones) {
      this.validarAplicacion(app);
      if (selected.has(app.cliente_id)) throw new ConflictException('Aplicaciones duplicadas');
      selected.set(app.cliente_id, seleccionActual(app));
    }
    return {
      zona_horaria: 'America/Cancun',
      eventos: eventos.map((e) => {
        return { ...e, modalidad: null, clasificacion: e.estatus === 'pendiente' ? clasificarEvento(e.fecha, e.hora, now) : null };
      }),
      compromisos: etapas.filter((e) => { const m = modalidadDeEtapa(e.etapas_proceso); return m && selected.get(e.cliente_id)?.includes(m); }).map((e) => ({ ...e, modalidad: modalidadDeEtapa(e.etapas_proceso), clasificacion: ['pendiente', 'en_proceso'].includes(e.estatus_tramite.categoria) ? clasificarFecha(e.fecha_compromiso!, now) : null })),
      citas_imss: aplicaciones.flatMap((app) => app.seguimientos.filter((s) => selected.get(app.cliente_id)!.includes(s.modalidad) && s.fecha_cita_imss && (!fecha.gte || s.fecha_cita_imss >= fecha.gte) && (!fecha.lte || s.fecha_cita_imss <= fecha.lte)).map((s) => ({ cliente_id: app.cliente_id, modalidad: s.modalidad, fecha: s.fecha_cita_imss, clasificacion_fecha: clasificarFecha(s.fecha_cita_imss!, now), cumplimiento: null }))),
    };
  }

  async alertas(q: QueryModalidadesAgendaDto, user: UsuarioModalidades) {
    const agenda = await this.agenda(q, user);
    const eventoIds = agenda.eventos.map((e) => e.id), etapaIds = agenda.compromisos.map((e) => e.id);
    const avisos = await this.prisma.avisos.findMany({ where: { atendido: false, OR: [
      { evento_id: { in: eventoIds }, etapa_tramite_id: null }, { etapa_tramite_id: { in: etapaIds }, evento_id: null },
    ] }, select: { id: true, tipo: true, evento_id: true, etapa_tramite_id: true, fecha_alerta: true, atendido: true }, orderBy: { fecha_alerta: 'asc' } });
    return { ...agenda, avisos: avisos.map((a) => ({ ...a, vigente: a.fecha_alerta <= new Date() })), umbral_proximidad_dias: null };
  }

  async indicadores(user: UsuarioModalidades) {
    assertAsesor(user);
    const [apps, cats, agenda] = await Promise.all([
      this.prisma.modalidades_aplicacion.findMany({ where: { clientes: { asesor_id: user.id } }, include: appInclude }), this.catalogos(user), this.agenda({}, user),
    ]);
    const clientes = new Set<string>();
    const cantidades = Object.fromEntries(MODALIDADES.map((m) => [m, 0]));
    const porEstatus: Record<string, number> = {};
    let mixtas = 0, concluidas = 0;
    for (const app of apps) {
      this.validarAplicacion(app);
      if (clientes.has(app.cliente_id)) throw new ConflictException('Aplicaciones duplicadas');
      clientes.add(app.cliente_id);
      if (app.tipo_modalidad === 'mixto') mixtas++;
      for (const m of seleccionActual(app)) {
        cantidades[m]++; const id = app[CAMPOS[m].estatus];
        porEstatus[String(id ?? 'sin_estatus')] = (porEstatus[String(id ?? 'sin_estatus')] ?? 0) + 1;
        if (cats.estatus.some((e) => e.id === id && e.terminal)) concluidas++;
      }
    }
    return { total_clientes: clientes.size, por_modalidad: cantidades, estrategias_mixtas: mixtas, por_estatus: porEstatus, modalidades_concluidas: concluidas,
      citas_futuras: agenda.eventos.filter((e) => e.clasificacion === 'futuro').length,
      citas_vencidas: agenda.eventos.filter((e) => e.clasificacion === 'vencido').length,
      compromisos_pendientes: agenda.compromisos.filter((e) => e.clasificacion !== null).length,
      compromisos_vencidos: agenda.compromisos.filter((e) => e.clasificacion === 'vencido').length,
      umbral_proximidad_dias: null };
  }
}
