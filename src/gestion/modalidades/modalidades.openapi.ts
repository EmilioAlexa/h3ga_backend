import type { SchemaObject } from '@nestjs/swagger';

const text: SchemaObject = { type: 'string' };
const integer: SchemaObject = { type: 'integer' };
const uuid: SchemaObject = { type: 'string', format: 'uuid' };
const date: SchemaObject = { type: 'string', format: 'date-time', nullable: true, description: 'Campos PostgreSQL DATE se serializan a medianoche UTC; su significado es fecha civil.' };
const decimal: SchemaObject = { type: 'string', nullable: true, example: '350.25' };
const object = (properties: Record<string, SchemaObject>): SchemaObject => ({ type: 'object', properties });
const array = (items: SchemaObject): SchemaObject => ({ type: 'array', items });
const fase = object({ id: integer, nombre: text, orden: integer });
const estatus = object({ id: integer, nombre: text, descripcion: { ...text, nullable: true }, categoria: text,
  avance_porcentaje_fijo: { ...integer, nullable: true }, avance_editable: { type: 'boolean' }, avance_min: { ...integer, nullable: true }, avance_max: { ...integer, nullable: true }, etiqueta: text, terminal: { type: 'boolean' } });
const cliente = object({ id: uuid, nombre: text, apellido_paterno: text, apellido_materno: { ...text, nullable: true }, fecha_ingreso: date, nss: { ...text, nullable: true }, semanas_imss_reconocidas: { ...integer, nullable: true }, afore: { ...object({ id: integer, nombre: text }), nullable: true }, regimen_principal: { ...object({ id: integer, nombre: text }), nullable: true } });
const historicos = object({ fecha_cita_imss: date, ultimo_salario_diario_registrado: decimal, motivo_cierre: { ...text, nullable: true }, atribucion_modalidad: { nullable: true, enum: [null] } });
export const seguimientoSchema = object({ modalidad: { type: 'string', enum: ['modalidad_10', 'modalidad_40', 'modalidad_40_retroactiva'] }, fase: { ...fase, nullable: true }, estatus: { ...estatus, nullable: true }, fecha_cita_imss: date, ultimo_salario_diario_registrado: decimal, motivo_cierre: { ...text, nullable: true }, creado_el: date, actualizado_el: date, creado_por: { ...uuid, nullable: true }, actualizado_por: { ...uuid, nullable: true }, auditoria_historica_sin_autor: { type: 'boolean' } });
export const aplicacionSchema = object({ id: uuid, cliente_id: uuid, tipo_modalidad: text, creado_el: date, actualizado_el: date, valores_historicos_compartidos: historicos, modalidades: array(seguimientoSchema) });
export const catalogosSchema = object({ fases: array(fase), estatus: array(estatus) });
export const clientesSchema = object({ data: array(object({ ...cliente.properties, seguimiento: aplicacionSchema })), pagination: object({ page: integer, limit: integer, total: integer, totalPages: integer }) });
const clasificacion: SchemaObject = { type: 'string', nullable: true, enum: ['vencido', 'hoy', 'futuro', null] };
export const agendaSchema = object({ zona_horaria: { type: 'string', enum: ['America/Cancun'] },
  eventos: array(object({ id: uuid, cliente_id: uuid, fecha: date, hora: date, motivo: { ...text, nullable: true }, estatus: { ...text, nullable: true }, modalidad: { nullable: true, enum: [null] }, clasificacion })),
  compromisos: array(object({ id: uuid, cliente_id: uuid, fecha_compromiso: date, accion_a_realizar: { ...text, nullable: true }, etapas_proceso: object({ id: integer, numero_paso: integer, nombre: text }), estatus_tramite: object({ nombre: text, categoria: text }), modalidad: text, clasificacion })),
  citas_imss: array(object({ cliente_id: uuid, modalidad: text, fecha: date, clasificacion_fecha: clasificacion, cumplimiento: { nullable: true, enum: [null] } })),
});
export const alertasSchema = object({ ...agendaSchema.properties, avisos: array(object({ id: uuid, tipo: text, evento_id: { ...uuid, nullable: true }, etapa_tramite_id: { ...uuid, nullable: true }, fecha_alerta: date, atendido: { type: 'boolean' }, vigente: { type: 'boolean' } })), umbral_proximidad_dias: { nullable: true, enum: [null] } });
export const indicadoresSchema = object({ total_clientes: integer, por_modalidad: object({ modalidad_10: integer, modalidad_40: integer, modalidad_40_retroactiva: integer }), estrategias_mixtas: integer, por_estatus: { type: 'object', additionalProperties: integer }, modalidades_concluidas: integer, citas_futuras: integer, citas_vencidas: integer, compromisos_pendientes: integer, compromisos_vencidos: integer, umbral_proximidad_dias: { nullable: true, enum: [null] } });
export const detalleClienteSchema = object({ cliente, seguimiento: { ...aplicacionSchema, nullable: true }, agenda: agendaSchema, documentos: array({ type: 'object', description: 'Metadatos del expediente, descritos en Gestión Documental; nunca contiene archivo_path.' }) });
const criterio = object({ id: uuid, diagnostico_id: uuid, criterio: text, cumple: { type: 'boolean', nullable: true }, cumplimiento: { ...text, nullable: true }, observaciones: { ...text, nullable: true } });
const diagnostico = object({ id: uuid, fecha_analisis: date, observaciones_regimen: { ...text, nullable: true }, semanas_reconocidas_al_baja: { ...integer, nullable: true },
  trabaja_cuenta_propia: { ...text, nullable: true }, actividad_economica: { ...text, nullable: true }, ingreso_mensual_aproximado: decimal, conclusion_modalidad_10: { ...text, nullable: true }, comentarios_modalidad_10: { ...text, nullable: true },
  fecha_ultima_baja: date, ultimo_salario_cotizado: decimal, dado_de_baja_regimen_obligatorio: { ...text, nullable: true }, salario_propuesto_m40: decimal, meses_propuestos_m40: { ...integer, nullable: true }, conclusion_modalidad_40: { ...text, nullable: true }, comentarios_modalidad_40: { ...text, nullable: true },
  modalidad10_criterios: array(criterio), modalidad40_criterios: array(criterio),
  diagnostico_objetivos_m10: array(object({ diagnostico_id: uuid, objetivo_id: integer, detalle_otro: { ...text, nullable: true }, objetivo_modalidad_10: object({ id: integer, nombre: text }) })),
  diagnostico_objetivos_m40: array(object({ diagnostico_id: uuid, objetivo_id: integer, detalle_otro: { ...text, nullable: true }, objetivo_modalidad_40: object({ id: integer, nombre: text }) })),
  analisis_modalidad40_retroactivo: { ...object({ id: uuid, diagnostico_id: uuid, fecha_propuesta_inicio_m40: date, fecha_solicitud: date, meses_retroactivos_estimados: { ...integer, nullable: true }, salario_diario_propuesto: decimal, cuotas_estimadas: decimal, recargos_actualizaciones_estimadas: decimal, total_estimado_pagar: decimal, baja_por_mora_previa: { type: 'boolean', nullable: true }, dentro_de_plazo_reingreso: { ...text, nullable: true }, conclusion_retroactivo: { ...text, nullable: true }, comentarios: { ...text, nullable: true }, retroactivo_evaluacion_conveniencia: array({ type: 'object' }) }), nullable: true },
});
diagnostico.description = 'Solo se devuelven las propiedades seleccionadas para la modalidad solicitada. Datos de referencia, nunca editables desde este módulo.';
export const detalleModalidadSchema = object({ cliente, seguimiento: seguimientoSchema, diagnostico_referencia: { ...diagnostico, nullable: true }, etapa_referencia: { ...object({ id: uuid, avance_porcentaje: integer, accion_a_realizar: { ...text, nullable: true }, fecha_compromiso: date, fecha_completada: date, estatus_id: integer }), nullable: true }, valores_historicos_compartidos: historicos, limitaciones: object({ etapa_no_disponible: { type: 'boolean' }, sincronizacion_etapa_modalidad: { type: 'boolean', enum: [false] }, finales_alternativos_pendientes: { type: 'boolean', enum: [true] } }) });
