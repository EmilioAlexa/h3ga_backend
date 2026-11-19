import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RolRespuestaDto {
  @ApiProperty({ description: 'Identificador del rol.' })
  id: number;

  @ApiProperty({ description: 'Nombre del rol.' })
  nombre: string;

  @ApiPropertyOptional({ description: 'Descripción del rol.', nullable: true })
  descripcion?: string | null;
}

export class LoginUsuarioRespuestaDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  nombre: string;

  @ApiProperty()
  apellido_paterno: string;

  @ApiPropertyOptional({ nullable: true })
  apellido_materno?: string | null;

  @ApiProperty({ format: 'email' })
  correo_electronico: string;

  @ApiProperty()
  rol_id: number;
}

export class LoginRespuestaDto {
  @ApiProperty({
    description: 'JWT para usar como Bearer token.',
    format: 'jwt',
  })
  access_token: string;

  @ApiProperty({ type: LoginUsuarioRespuestaDto })
  usuario: LoginUsuarioRespuestaDto;
}

export class UsuarioRespuestaDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  rol_id: number;

  @ApiProperty()
  nombre: string;

  @ApiProperty()
  apellido_paterno: string;

  @ApiPropertyOptional({ nullable: true })
  apellido_materno?: string | null;

  @ApiProperty({ format: 'email' })
  correo_electronico: string;

  @ApiProperty()
  activo: boolean;

  @ApiProperty({ format: 'date-time' })
  fecha_creacion: string;

  @ApiProperty({ type: RolRespuestaDto })
  roles: RolRespuestaDto;
}

export class UsuarioActualRespuestaDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  rol_id: number;

  @ApiProperty()
  nombre: string;

  @ApiProperty()
  apellido_paterno: string;

  @ApiPropertyOptional({ nullable: true })
  apellido_materno?: string | null;

  @ApiProperty({ format: 'email' })
  correo_electronico: string;

  @ApiProperty()
  activo: boolean;

  @ApiProperty({ type: () => Object, example: { nombre: 'asesor' } })
  roles: { nombre: string };
}

export class ClienteResumenRespuestaDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    type: Boolean,
    description: 'Estado operativo: true pausado, false activo.',
  })
  pausado: boolean;

  @ApiProperty()
  nombre: string;

  @ApiProperty()
  apellido_paterno: string;

  @ApiPropertyOptional({ nullable: true })
  apellido_materno?: string | null;

  @ApiPropertyOptional({ nullable: true })
  telefono?: string | null;

  @ApiPropertyOptional({ format: 'email', nullable: true })
  correo_electronico?: string | null;
}

export class ClienteDetalleRespuestaDto extends ClienteResumenRespuestaDto {
  @ApiPropertyOptional({
    description: 'CURP; visible según el rol autorizado.',
    nullable: true,
  })
  curp?: string | null;

  @ApiPropertyOptional({
    description: 'RFC; visible según el rol autorizado.',
    nullable: true,
  })
  rfc?: string | null;

  @ApiPropertyOptional({
    description: 'Asesor asignado; visible solo para administración.',
    format: 'uuid',
    nullable: true,
  })
  asesor_id?: string | null;
}

export class PaginacionRespuestaDto {
  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  total: number;

  @ApiProperty()
  totalPages: number;
}

export class ClientesPaginadosRespuestaDto {
  @ApiProperty({ type: [ClienteResumenRespuestaDto] })
  data: ClienteResumenRespuestaDto[];

  @ApiProperty({ type: PaginacionRespuestaDto })
  pagination: PaginacionRespuestaDto;
}

export class CatalogoPaginadoRespuestaDto {
  @ApiProperty({
    description: 'Registros del catálogo con los campos propios de su modelo.',
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  data: Record<string, unknown>[];

  @ApiProperty({ type: PaginacionRespuestaDto })
  pagination: PaginacionRespuestaDto;
}

export class CatalogoRetiroRespuestaDto {
  @ApiProperty({ description: 'Clave del catálogo.' })
  catalogo: string;

  @ApiProperty({ description: 'Identificador del registro.' })
  id: number;

  @ApiProperty({
    description: 'Acción real realizada por DELETE.',
    enum: ['desactivado', 'ya_desactivado', 'eliminado_fisicamente'],
  })
  accion: string;

  @ApiProperty({
    description: 'Resultado del estado activo cuando aplica.',
    required: false,
  })
  activo?: boolean;

  @ApiProperty()
  mensaje: string;
}

export class ContratoRelacionadoRespuestaDto {
  @ApiProperty({ description: 'Identificador del registro relacionado.' })
  id: string | number;

  @ApiProperty({ description: 'Nombre mostrado para la relación.' })
  nombre: string;
}

export class ContratoRespuestaDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  cliente_id: string;

  @ApiProperty({ minimum: 1 })
  servicio_id: number;

  @ApiProperty({ format: 'uuid' })
  asesor_id: string;

  @ApiProperty({ maxLength: 50 })
  folio: string;

  @ApiProperty({
    format: 'date-time',
    description: 'Fecha contractual serializada como ISO 8601 por JSON.',
  })
  fecha_contrato: string;

  @ApiProperty({ minimum: 1 })
  estado_contrato_id: number;

  @ApiPropertyOptional({ nullable: true })
  cantidad_pagos?: number | null;

  @ApiPropertyOptional({ nullable: true })
  observaciones?: string | null;

  @ApiProperty({ format: 'date-time' })
  creado_en: string;

  @ApiProperty({
    description:
      'Cliente relacionado; solo muestra nombre, apellidos e identificador.',
    type: 'object',
    additionalProperties: true,
  })
  clientes: Record<string, unknown>;

  @ApiProperty({ type: ContratoRelacionadoRespuestaDto })
  servicios: ContratoRelacionadoRespuestaDto;

  @ApiProperty({
    description: 'Asesor asignado; solo muestra identificador y nombre.',
    type: 'object',
    additionalProperties: true,
  })
  usuarios: Record<string, unknown>;

  @ApiProperty({
    description: 'Estado contractual actual del catálogo.',
    type: 'object',
    additionalProperties: true,
  })
  estados_contratos: Record<string, unknown>;
}

export class ContratosPaginadosRespuestaDto {
  @ApiProperty({ type: [ContratoRespuestaDto] })
  data: ContratoRespuestaDto[];

  @ApiProperty({ type: PaginacionRespuestaDto })
  pagination: PaginacionRespuestaDto;
}

export class PagoRelacionadoRespuestaDto {
  @ApiProperty({
    type: Number,
    description: 'Identificador entero del catálogo.',
  })
  id: number;

  @ApiProperty({ description: 'Etiqueta de la relación.' })
  nombre: string;

  @ApiPropertyOptional({
    type: Number,
    description: 'Orden del estado, cuando aplica.',
  })
  orden?: number;
}

export class PagoPersonaRespuestaDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  nombre: string;

  @ApiProperty()
  apellido_paterno: string;

  @ApiProperty({ nullable: true })
  apellido_materno: string | null;
}

export class EvidenciaPagoResumenRespuestaDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ description: 'Solo una evidencia vigente cuenta para validar.' })
  vigente: boolean;

  @ApiPropertyOptional({ nullable: true })
  nombre_original?: string | null;

  @ApiPropertyOptional({ nullable: true })
  tipo_archivo?: string | null;

  @ApiPropertyOptional({ type: PagoRelacionadoRespuestaDto, nullable: true })
  tipos_evidencia_pago?: PagoRelacionadoRespuestaDto | null;
}

export class PagoCorreccionRespuestaDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) pago_id: string;
  @ApiProperty({ format: 'uuid' }) actor_id: string;
  @ApiProperty({ format: 'date-time' }) fecha_correccion: string;
  @ApiProperty({ maxLength: 1000 }) motivo: string;
  @ApiProperty() estado_anterior_id: number;
  @ApiProperty() estado_nuevo_id: number;
  @ApiProperty({ type: String, description: 'Decimal(12,2) como string.' }) monto_anterior: string;
  @ApiProperty({ type: String, description: 'Decimal(12,2) como string.' }) monto_nuevo: string;
  @ApiProperty({ format: 'date-time', nullable: true }) fecha_pago_anterior: string | null;
  @ApiProperty({ format: 'date-time' }) fecha_pago_nueva: string;
  @ApiProperty({ nullable: true }) forma_pago_id_anterior: number | null;
  @ApiProperty() forma_pago_id_nueva: number;
  @ApiProperty({ nullable: true }) observaciones_anteriores: string | null;
  @ApiProperty({ nullable: true }) observaciones_nuevas: string | null;
  @ApiProperty({ nullable: true }) folio_recibo_anterior: string | null;
  @ApiProperty({ nullable: true }) folio_recibo_nuevo: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) recibido_por_anterior: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) recibido_por_nuevo: string | null;
  @ApiProperty({ nullable: true }) lugar_recepcion_anterior: string | null;
  @ApiProperty({ nullable: true }) lugar_recepcion_nuevo: string | null;
  @ApiProperty({ format: 'uuid' }) historial_estado_id: string;
}

export class PagoContratoRespuestaDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ description: 'Folio visible en las pantallas de pagos.' })
  folio: string;

  @ApiProperty({ format: 'uuid' })
  cliente_id: string;

  @ApiProperty({ format: 'uuid' })
  asesor_id: string;

  @ApiProperty({ nullable: true })
  cantidad_pagos: number | null;

  @ApiProperty({ type: PagoRelacionadoRespuestaDto })
  servicios: PagoRelacionadoRespuestaDto;

  @ApiProperty({
    type: PagoPersonaRespuestaDto,
    description:
      'Asesor asignado al contrato; distinto del registrante del pago.',
  })
  usuarios: PagoPersonaRespuestaDto;

  @ApiProperty({
    type: PagoPersonaRespuestaDto,
    description: 'Cliente del contrato: id y nombre completo.',
  })
  clientes: PagoPersonaRespuestaDto;
}

export class PagoRespuestaDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  contrato_id: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  pago_programado_id?: string | null;

  @ApiPropertyOptional({ nullable: true })
  forma_pago_id?: number | null;

  @ApiPropertyOptional({ nullable: true })
  estado_pago_id?: number | null;

  @ApiProperty({
    type: String,
    example: '1250.5',
    description:
      'Decimal serializado como cadena; no se garantizan ceros finales.',
  })
  monto: string;

  @ApiProperty({
    format: 'date-time',
    nullable: true,
    description:
      'Fecha real del pago; permanece null si el dato histórico es nulo.',
  })
  fecha_pago: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  registrado_por?: string | null;

  @ApiProperty({ format: 'date-time' })
  fecha_registro: string;

  @ApiPropertyOptional({ nullable: true })
  observaciones?: string | null;

  @ApiPropertyOptional({ nullable: true })
  referencia_pago?: string | null;

  @ApiPropertyOptional({ nullable: true })
  folio_recibo?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  recibido_por?: string | null;

  @ApiPropertyOptional({ nullable: true })
  lugar_recepcion?: string | null;

  @ApiProperty({ type: PagoContratoRespuestaDto })
  contratos: PagoContratoRespuestaDto;

  @ApiPropertyOptional({ type: PagoRelacionadoRespuestaDto, nullable: true })
  formas_pago?: PagoRelacionadoRespuestaDto | null;

  @ApiPropertyOptional({ type: PagoRelacionadoRespuestaDto, nullable: true })
  estados_pago?: PagoRelacionadoRespuestaDto | null;

  @ApiPropertyOptional({ type: PagoRelacionadoRespuestaDto, nullable: true })
  pagos_programados?: Record<string, unknown> | null;

  @ApiPropertyOptional({
    type: 'object',
    nullable: true,
    additionalProperties: true,
  })
  usuarios?: Record<string, unknown> | null;

  @ApiPropertyOptional({
    type: 'object',
    nullable: true,
    additionalProperties: true,
  })
  usuario_receptor?: Record<string, unknown> | null;

  @ApiPropertyOptional({ type: [EvidenciaPagoResumenRespuestaDto] })
  evidencias_pago?: EvidenciaPagoResumenRespuestaDto[];
}

export class PagoHistorialRespuestaDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  pago_id: string;

  @ApiPropertyOptional({ nullable: true })
  estado_anterior_id?: number | null;

  @ApiPropertyOptional({ nullable: true })
  estado_nuevo_id?: number | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  cambiado_por?: string | null;

  @ApiProperty({ format: 'date-time' })
  fecha_cambio: string;

  @ApiPropertyOptional({ nullable: true })
  comentario?: string | null;

  @ApiPropertyOptional({ type: PagoRelacionadoRespuestaDto, nullable: true })
  estados_pago_historial_estados_pago_estado_anterior_idToestados_pago?: PagoRelacionadoRespuestaDto | null;

  @ApiPropertyOptional({ type: PagoRelacionadoRespuestaDto, nullable: true })
  estados_pago_historial_estados_pago_estado_nuevo_idToestados_pago?: PagoRelacionadoRespuestaDto | null;

  @ApiPropertyOptional({
    type: 'object',
    nullable: true,
    additionalProperties: true,
  })
  usuarios?: Record<string, unknown> | null;
}

export class PagosPaginadosRespuestaDto {
  @ApiProperty({ type: [PagoRespuestaDto] })
  data: PagoRespuestaDto[];

  @ApiProperty({ type: PaginacionRespuestaDto })
  pagination: PaginacionRespuestaDto;
}

export class PagoProgramadoRespuestaDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  contrato_id: string;

  @ApiPropertyOptional({ nullable: true })
  tipo_cobro_id?: number | null;

  @ApiProperty()
  numero_pago: number;

  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  fecha_esperada?: string | null;

  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  fecha_vencimiento?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  monto_esperado?: string | null;

  @ApiProperty({ type: String, description: 'Suma decimal de abonos definitivamente Validados.' })
  monto_abonado_validado: string;

  @ApiProperty({ type: String, nullable: true, description: 'monto_esperado menos abonos Validados; null si no puede ofrecerse un saldo operativo.' })
  saldo_pendiente_confirmado: string | null;

  @ApiProperty({ nullable: true, enum: ['CANCELADO', 'IMPORTE_NO_DEFINIDO', 'IMPORTE_INVALIDO', 'SOBREPAGO'], description: 'Motivo técnico por el que el saldo operativo es null; no es un estado empresarial nuevo.' })
  motivo_saldo_no_disponible: string | null;

  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  periodo?: string | null;

  @ApiPropertyOptional({ nullable: true })
  estado_id?: number | null;

  @ApiPropertyOptional({ type: PagoRelacionadoRespuestaDto, nullable: true, description: 'Estado operativo calculado a partir de cancelación persistida, importe, abonos Validados y fecha de vencimiento en America/Cancun. Puede ser null para datos históricos incompletos o anomalías.' })
  estado_operativo?: PagoRelacionadoRespuestaDto | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Actor que canceló la obligación.' })
  cancelado_por?: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  cancelado_en?: string | null;

  @ApiPropertyOptional({ nullable: true })
  motivo_cancelacion?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Justificación persistida de una coincidencia permitida.' })
  justificacion_duplicado?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Motivo particular de una penalización APD.' })
  motivo_penalizacion?: string | null;

  @ApiPropertyOptional({ nullable: true, enum: ['TOPADO', 'NO_TOPADO'] })
  clasificacion_tope_apd?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Decimal recibido por el beneficiario APD; distinto del pago a H3GA.' })
  monto_recibido_beneficiario_apd?: string | null;

  @ApiProperty({ type: 'object', additionalProperties: true })
  contratos: Record<string, unknown>;

  @ApiPropertyOptional({ type: PagoRelacionadoRespuestaDto, nullable: true })
  tipos_cobro?: PagoRelacionadoRespuestaDto | null;

  @ApiPropertyOptional({ type: PagoRelacionadoRespuestaDto, nullable: true })
  estados_pago_programado?: PagoRelacionadoRespuestaDto | null;

  @ApiProperty({ type: [Object] })
  pagos: Record<string, unknown>[];
}

export class PagosProgramadosPaginadosRespuestaDto {
  @ApiProperty({ type: [PagoProgramadoRespuestaDto] })
  data: PagoProgramadoRespuestaDto[];

  @ApiProperty({ type: PaginacionRespuestaDto })
  pagination: PaginacionRespuestaDto;
}
