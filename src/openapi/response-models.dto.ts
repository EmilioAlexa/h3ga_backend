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

  @ApiProperty({ format: 'date' })
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
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ description: 'Etiqueta de la relación.' })
  nombre: string;
}

export class EvidenciaPagoResumenRespuestaDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiPropertyOptional({ nullable: true })
  nombre_original?: string | null;

  @ApiPropertyOptional({ nullable: true })
  tipo_archivo?: string | null;

  @ApiPropertyOptional({ type: PagoRelacionadoRespuestaDto, nullable: true })
  tipos_evidencia_pago?: PagoRelacionadoRespuestaDto | null;
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

  @ApiProperty({ type: String, example: '1250.00' })
  monto: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  fecha_pago?: string | null;

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

  @ApiProperty({ type: 'object', additionalProperties: true })
  contratos: Record<string, unknown>;

  @ApiPropertyOptional({ type: PagoRelacionadoRespuestaDto, nullable: true })
  formas_pago?: PagoRelacionadoRespuestaDto | null;

  @ApiPropertyOptional({ type: PagoRelacionadoRespuestaDto, nullable: true })
  estados_pago?: PagoRelacionadoRespuestaDto | null;

  @ApiPropertyOptional({ type: PagoRelacionadoRespuestaDto, nullable: true })
  pagos_programados?: Record<string, unknown> | null;

  @ApiPropertyOptional({ type: 'object', nullable: true, additionalProperties: true })
  usuarios?: Record<string, unknown> | null;

  @ApiPropertyOptional({ type: 'object', nullable: true, additionalProperties: true })
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

  @ApiPropertyOptional({ type: 'object', nullable: true, additionalProperties: true })
  usuarios?: Record<string, unknown> | null;
}

export class PagosPaginadosRespuestaDto {
  @ApiProperty({ type: [PagoRespuestaDto] })
  data: PagoRespuestaDto[];

  @ApiProperty({ type: PaginacionRespuestaDto })
  pagination: PaginacionRespuestaDto;
}
