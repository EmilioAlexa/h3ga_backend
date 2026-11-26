import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ModalidadesService } from './modalidades.service';
import { CAMPOS, clasificarFecha, FASES, modalidadDeEtapa, MODALIDADES } from './modalidades.rules';
import { ActualizarModalidadDto } from './dto/modalidades.dto';

const clienteId = '11111111-1111-4111-8111-111111111111';
const user = { id: '22222222-2222-4222-8222-222222222222', roles: { nombre: 'asesor' } };
const fases = FASES.map((nombre, i) => ({ id: 101 + i, nombre, orden: i + 1 }));
const estados = [
  { id: 202, nombre: 'Por iniciar', categoria: 'pendiente' },
  { id: 204, nombre: 'En proceso asesor', categoria: 'en_proceso' },
  { id: 206, nombre: 'Finalizado', categoria: 'completado' },
  { id: 208, nombre: 'Cancelado', categoria: 'excepcion' },
  { id: 210, nombre: 'Estado ajeno', categoria: 'excepcion' },
];

function fixture(modes: readonly string[] = []) {
  let row: any = null;
  const historico = { fecha_cita_imss: new Date('2025-01-02'), ultimo_salario_diario_registrado: '700.00', motivo_cierre: 'Texto histórico sin atribución' };
  const empty = () => ({ id: 'app', cliente_id: clienteId, diagnostico_id: 'diag', diagnostico_especializado: { cliente_id: clienteId }, ...historico,
    tipo_modalidad: modes.length === 2 ? 'mixto' : modes[0], creado_el: new Date('2020-01-01'), actualizado_el: new Date('2020-01-01'), seguimientos: [],
    ...Object.fromEntries(MODALIDADES.flatMap((m) => { const c = CAMPOS[m]; return [[c.aplica, false], [c.fase, null], [c.estatus, null]]; })),
  });
  if (modes.length) {
    row = empty();
    for (const m of modes as (typeof MODALIDADES)[number][]) {
      const c = CAMPOS[m]; row[c.aplica] = true; row[c.fase] = 101; row[c.estatus] = 202;
      row.seguimientos.push({ modalidad: m, fecha_cita_imss: null, ultimo_salario_diario_registrado: null, motivo_cierre: null, creado_el: new Date('2020-01-01'), actualizado_el: new Date('2020-01-01'), creado_por: null, actualizado_por: null });
    }
  }
  const db: any = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: clienteId }]),
    clientes: { findFirst: jest.fn().mockResolvedValue({ id: clienteId }), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    modalidades_aplicacion: {
      findMany: jest.fn(async () => row ? [structuredClone(row)] : []),
      create: jest.fn(async ({ data }) => { row = { ...empty(), ...data }; return structuredClone(row); }),
      update: jest.fn(async ({ data }) => { Object.assign(row, data); return structuredClone(row); }),
    },
    modalidades_seguimiento: {
      create: jest.fn(async ({ data }) => { const s = { fecha_cita_imss: null, ultimo_salario_diario_registrado: null, motivo_cierre: null, ...data }; row.seguimientos.push(s); return s; }),
      update: jest.fn(async ({ where, data }) => { const s = row.seguimientos.find((s: any) => s.modalidad === where.modalidad_aplicacion_id_modalidad.modalidad); Object.assign(s, data); return s; }),
    },
    diagnostico_especializado: { findUnique: jest.fn().mockResolvedValue({ id: 'diag' }) },
    fase_modalidad: { findMany: jest.fn().mockResolvedValue(fases) },
    estatus_tramite: { findMany: jest.fn().mockResolvedValue(estados) },
    etapas_tramite: { findMany: jest.fn().mockResolvedValue([]) },
    eventos_agenda: { findMany: jest.fn().mockResolvedValue([]) },
    avisos: { findMany: jest.fn().mockResolvedValue([]) },
  };
  db.$transaction = jest.fn((fn) => fn(db));
  const documental = { findDocumentos: jest.fn().mockResolvedValue([]) };
  return { service: new ModalidadesService(db, documental as any), db, getRow: () => row, historico };
}

describe('Modalidades — selección e independencia', () => {
  it.each([
    ['modalidad_10'], ['modalidad_40'], ['modalidad_40_retroactiva'],
    ['modalidad_10', 'modalidad_40_retroactiva'], ['modalidad_40', 'modalidad_40_retroactiva'],
  ].map((modalidades) => ({ modalidades })))('registra $modalidades sin IDs fijos', async ({ modalidades }) => {
    const { service, db } = fixture();
    const result = await service.guardar(clienteId, { modalidades } as any, user);
    expect(result.modalidades.map((m) => m.modalidad)).toEqual(expect.arrayContaining(modalidades));
    expect(result.tipo_modalidad).toBe(modalidades.length === 2 ? 'mixto' : modalidades[0]);
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(db.modalidades_aplicacion.findMany.mock.invocationCallOrder[0]);
    expect(db.$transaction.mock.calls[0][1].isolationLevel).toBe('ReadCommitted');
    expect(db.modalidades_aplicacion.create.mock.calls[0][0].data).not.toHaveProperty('fecha_cita_imss');
  });

  it.each([[], ['modalidad_10', 'modalidad_40'], [...MODALIDADES], ['modalidad_10', 'modalidad_10'], ['mixto']].map((modes) => ({ modes })))('rechaza selección inválida $modes en alta y actualización', async ({ modes }) => {
    for (const inicial of [[], ['modalidad_10']]) {
      const { service, db } = fixture(inicial);
      await expect(service.guardar(clienteId, { modalidades: modes } as any, user)).rejects.toBeInstanceOf(BadRequestException);
      expect(db.$transaction).not.toHaveBeenCalled();
    }
  });

  it('repetir la selección es idempotente, sin cambiar timestamps', async () => {
    const { service, db } = fixture(['modalidad_10']);
    await service.guardar(clienteId, { modalidades: ['modalidad_10'] }, user);
    expect(db.modalidades_aplicacion.create).not.toHaveBeenCalled();
    expect(db.modalidades_aplicacion.update).not.toHaveBeenCalled();
    expect(db.modalidades_seguimiento.update).not.toHaveBeenCalled();
  });

  it('amplía a mixta sin reiniciar el seguimiento existente', async () => {
    const { service, getRow } = fixture(['modalidad_10']);
    const before = structuredClone(getRow().seguimientos[0]);
    await service.guardar(clienteId, { modalidades: ['modalidad_10', 'modalidad_40_retroactiva'] }, user);
    expect(getRow().seguimientos[0]).toEqual(before);
    expect(getRow().fase_m10_id).toBe(101);
  });

  it('rechaza retirar o sustituir una modalidad', async () => {
    const { service } = fixture(['modalidad_10']);
    await expect(service.guardar(clienteId, { modalidades: ['modalidad_40'] }, user)).rejects.toBeInstanceOf(ConflictException);
  });

  it.each(MODALIDADES)('actualizar %s conserva otra modalidad y los históricos', async (m) => {
    const other = m === 'modalidad_40_retroactiva' ? 'modalidad_10' : 'modalidad_40_retroactiva';
    const { service, getRow, db, historico } = fixture([m, other]);
    const before = structuredClone(getRow().seguimientos.find((s: any) => s.modalidad === other));
    await service.actualizar(clienteId, m, { fase_id: 103, fecha_cita_imss: '2027-01-02', ultimo_salario_diario_registrado: '900.21' }, user);
    expect(getRow().seguimientos.find((s: any) => s.modalidad === other)).toEqual(before);
    expect(getRow()[CAMPOS[other].fase]).toBe(101);
    expect(getRow()).toMatchObject(historico);
    expect(Object.keys(db.modalidades_aplicacion.update.mock.calls[0][0].data).sort()).toEqual(['actualizado_el', CAMPOS[m].fase].sort());
  });

  it('expone los históricos separadamente y no usa fallback compartido', async () => {
    const { service, historico } = fixture(['modalidad_10', 'modalidad_40_retroactiva']);
    const result = await service.findModalidades(clienteId, user);
    expect(result!.valores_historicos_compartidos).toEqual({ ...historico, atribucion_modalidad: null });
    expect(result!.modalidades.every((s) => s.fecha_cita_imss === null && s.ultimo_salario_diario_registrado === null)).toBe(true);
  });

  it('concluye una modalidad conservando la fase y el estado de la otra', async () => {
    const { service, getRow } = fixture(['modalidad_10', 'modalidad_40_retroactiva']);
    await service.actualizar(clienteId, 'modalidad_10', { estatus_id: 206 }, user);
    expect(getRow()).toMatchObject({ fase_m10_id: 101, estatus_m10_id: 206, estatus_m40r_id: 202 });
    const cats = await service.catalogos(user);
    expect(cats.fases).toHaveLength(5);
    expect(cats.estatus.find((e) => e.id === 206)).toMatchObject({ etiqueta: 'Concluido', terminal: true });
  });

  it('no reactiva un trámite concluido sin política', async () => {
    const { service, getRow } = fixture(['modalidad_10']); getRow().estatus_m10_id = 206;
    await expect(service.actualizar(clienteId, 'modalidad_10', { estatus_id: 202 }, user)).rejects.toBeInstanceOf(ConflictException);
  });
  it.each([{ fase_id: 999 }, { estatus_id: 210 }, {}, { motivo_cierre: 'No procede' }])('rechaza datos no admitidos %j', async (dto) => {
    const { service, db } = fixture(['modalidad_10']);
    await expect(service.actualizar(clienteId, 'modalidad_10', dto as ActualizarModalidadDto, user)).rejects.toBeInstanceOf(BadRequestException);
    expect(db.modalidades_aplicacion.update).not.toHaveBeenCalled();
  });
  it('rechaza una modalidad no seleccionada', async () => {
    const { service } = fixture(['modalidad_10']);
    await expect(service.actualizar(clienteId, 'modalidad_40', { fase_id: 102 }, user)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('no asume correspondencia de No procede o No interesado', async () => {
    const { service } = fixture();
    expect((await service.catalogos(user)).estatus.map((e) => e.etiqueta)).not.toEqual(expect.arrayContaining(['No procede', 'No interesado']));
  });
  it('detecta duplicados existentes antes de escribir', async () => {
    const { service, db, getRow } = fixture(['modalidad_10']); db.modalidades_aplicacion.findMany.mockResolvedValue([getRow(), getRow()]);
    await expect(service.guardar(clienteId, { modalidades: ['modalidad_10'] }, user)).rejects.toBeInstanceOf(ConflictException);
    expect(db.modalidades_aplicacion.create).not.toHaveBeenCalled();
  });
  it('rechaza catálogo de seis fases', async () => {
    const { service, db } = fixture(); db.fase_modalidad.findMany.mockResolvedValue([...fases, { nombre: 'Concluido', orden: 6 }]);
    await expect(service.catalogos(user)).rejects.toBeInstanceOf(ConflictException);
  });
  it('rechaza crear sin diagnóstico, pero permite consultar su ausencia', async () => {
    const { service, db } = fixture(); db.diagnostico_especializado.findUnique.mockResolvedValue(null);
    expect(await service.findModalidades(clienteId, user)).toBeNull();
    await expect(service.guardar(clienteId, { modalidades: ['modalidad_10'] }, user)).rejects.toBeInstanceOf(ConflictException);
    expect(db.modalidades_aplicacion.create).not.toHaveBeenCalled();
  });
  it.each(MODALIDADES)('selecciona solo la referencia del diagnóstico de %s', async (m) => {
    const { service, db } = fixture([m]);
    const result = await service.findModalidad(clienteId, m, user);
    expect(result.diagnostico_referencia).toEqual({ id: 'diag' });
    const select = db.diagnostico_especializado.findUnique.mock.calls[0][0].select;
    expect(select).not.toHaveProperty('firma_cliente_path');
    expect(select).toHaveProperty(m === 'modalidad_10' ? 'modalidad10_criterios' : m === 'modalidad_40' ? 'modalidad40_criterios' : 'analisis_modalidad40_retroactivo');
    expect(db.modalidades_aplicacion.update).not.toHaveBeenCalled();
  });
  it('detecta diagnóstico de otro cliente', async () => {
    const { service, getRow } = fixture(['modalidad_10']); getRow().diagnostico_especializado.cliente_id = 'otro';
    await expect(service.findModalidades(clienteId, user)).rejects.toBeInstanceOf(ConflictException);
  });
  it.each(['administrador', 'auxiliar administrativo', 'administrador financiero'])('rechaza acceso directo del rol %s', async (nombre) => {
    const { service, db } = fixture(); const u = { ...user, roles: { nombre } };
    await expect(service.guardar(clienteId, { modalidades: ['modalidad_10'] }, u)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.agenda({}, u)).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('rechaza lectura y actualización del cliente ajeno', async () => {
    const { service, db } = fixture(['modalidad_10']); db.clientes.findFirst.mockResolvedValue(null); db.$queryRaw.mockResolvedValue([]);
    await expect(service.findModalidades(clienteId, user)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.actualizar(clienteId, 'modalidad_10', { fase_id: 102 }, user)).rejects.toBeInstanceOf(NotFoundException);
    expect(db.modalidades_aplicacion.update).not.toHaveBeenCalled();
  });
  it('propaga fallo de persistencia sin escribir diagnóstico ni campos compartidos', async () => {
    const { service, db } = fixture(); db.modalidades_aplicacion.create.mockRejectedValue(new Error('persistencia'));
    await expect(service.guardar(clienteId, { modalidades: ['modalidad_10'] }, user)).rejects.toThrow('persistencia');
    expect(db.modalidades_seguimiento.create).not.toHaveBeenCalled();
  });
});

describe('Agenda, filtros e indicadores', () => {
  afterEach(() => jest.useRealTimers());
  it('clasifica fechas civiles en Cancún al cruzar medianoche UTC', () => {
    const now = new Date('2026-11-21T02:00:00Z');
    expect(clasificarFecha(new Date('2026-11-20'), now)).toBe('hoy');
    expect(clasificarFecha(new Date('2026-11-19'), now)).toBe('vencido');
    expect(clasificarFecha(new Date('2026-11-21'), now)).toBe('futuro');
  });
  it('no atribuye etapas por número sin comprobar su nombre', () => {
    expect(modalidadDeEtapa({ numero_paso: 5, nombre: 'Otro' })).toBeNull();
    expect(modalidadDeEtapa({ numero_paso: 99, nombre: 'Estrategia Modalidad 10' })).toBeNull();
  });
  it('agenda exige asesor y cliente propios y no atribuye eventos a una modalidad', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-20T18:00:00Z'));
    const { service, db } = fixture(['modalidad_10']);
    db.eventos_agenda.findMany.mockResolvedValue([
      { id: 'a', cliente_id: clienteId, fecha: new Date('2026-11-20'), hora: new Date('1970-01-01T12:00:00Z'), estatus: 'pendiente' },
      { id: 'b', cliente_id: clienteId, fecha: new Date('2026-11-21'), hora: null, estatus: 'pendiente' },
      { id: 'c', cliente_id: clienteId, fecha: new Date('2026-11-19'), hora: null, estatus: 'cancelado' },
    ]);
    const result = await service.agenda({ cliente_id: clienteId }, user);
    expect(db.eventos_agenda.findMany.mock.calls[0][0].where).toMatchObject({ asesor_id: user.id, clientes: { id: clienteId, asesor_id: user.id } });
    expect(result.eventos.map((e) => e.clasificacion)).toEqual(['vencido', 'futuro', null]);
    expect(result.eventos.every((e) => e.modalidad === null)).toBe(true);
  });
  it('agenda del cliente ajeno se rechaza antes de consultar eventos', async () => {
    const { service, db } = fixture(); db.clientes.findFirst.mockResolvedValue(null);
    await expect(service.agenda({ cliente_id: clienteId }, user)).rejects.toBeInstanceOf(NotFoundException);
    expect(db.eventos_agenda.findMany).not.toHaveBeenCalled();
  });
  it('alertas se limitan a referencias autorizadas y sin asociación ambigua', async () => {
    const { service, db } = fixture(['modalidad_10']);
    await service.alertas({}, user);
    expect(db.avisos.findMany.mock.calls[0][0].where).toEqual({ atendido: false, OR: [{ evento_id: { in: [] }, etapa_tramite_id: null }, { etapa_tramite_id: { in: [] }, evento_id: null }] });
  });
  it('consulta compromisos de modalidades seleccionadas e identifica avisos vigentes', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-20T18:00:00Z'));
    const { service, db } = fixture(['modalidad_10']);
    const etapa = { id: 'etapa10', cliente_id: clienteId, fecha_compromiso: new Date('2026-11-19'), accion_a_realizar: 'Entregar documentación', etapas_proceso: { numero_paso: 5, nombre: 'Estrategia Modalidad 10' }, estatus_tramite: { nombre: 'En proceso asesor', categoria: 'en_proceso' } };
    db.etapas_tramite.findMany.mockResolvedValue([etapa, { ...etapa, id: 'etapa40', etapas_proceso: { numero_paso: 6, nombre: 'Estrategia Modalidad 40' } }]);
    db.avisos.findMany.mockResolvedValue([{ id: 'aviso', tipo: 'tramite', etapa_tramite_id: 'etapa10', evento_id: null, fecha_alerta: new Date('2026-11-18'), atendido: false }]);
    const result = await service.alertas({ cliente_id: clienteId }, user);
    expect(result.compromisos).toHaveLength(1);
    expect(result.compromisos[0]).toMatchObject({ modalidad: 'modalidad_10', clasificacion: 'vencido' });
    expect(result.avisos[0].vigente).toBe(true);
    expect(db.avisos.findMany.mock.calls[0][0].where.OR[1].etapa_tramite_id.in).toEqual(['etapa10']);
  });
  it('no marca cumplidos, reagendados o cancelados como citas pendientes vencidas', async () => {
    const { service, db } = fixture(['modalidad_10']);
    db.eventos_agenda.findMany.mockResolvedValue(['cumplido', 'reagendado', 'cancelado'].map((estatus) => ({ id: estatus, cliente_id: clienteId, fecha: new Date('2000-01-01'), hora: null, estatus })));
    expect((await service.agenda({}, user)).eventos.every((e) => e.clasificacion === null)).toBe(true);
  });
  it('indicadores cuentan una estrategia mixta como un cliente y dos modalidades', async () => {
    const { service } = fixture(['modalidad_10', 'modalidad_40_retroactiva']);
    expect(await service.indicadores(user)).toMatchObject({ total_clientes: 1, estrategias_mixtas: 1, por_modalidad: { modalidad_10: 1, modalidad_40: 0, modalidad_40_retroactiva: 1 } });
  });
  it('filtros de estatus y fecha aplican sobre la misma modalidad', async () => {
    const { service, db } = fixture();
    await service.findClientes({ page: 1, limit: 20, orden: 'nombre', modalidad: 'modalidad_10', estatus_id: 204, fecha_desde: '2026-11-01' }, user);
    expect(db.clientes.findMany.mock.calls[0][0].where.modalidades_aplicacion.some.OR).toEqual([expect.objectContaining({ aplica_m10: true, estatus_m10_id: 204, seguimientos: { some: { modalidad: 'modalidad_10', fecha_cita_imss: { gte: new Date('2026-11-01') } } } })]);
  });
  it('rechaza intervalo invertido', async () => {
    const { service } = fixture();
    await expect(service.agenda({ fecha_desde: '2027-01-01', fecha_hasta: '2026-01-01' }, user)).rejects.toBeInstanceOf(BadRequestException);
  });
});
