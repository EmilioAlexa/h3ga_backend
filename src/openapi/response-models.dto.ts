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
