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
  @ApiProperty({ description: 'JWT para usar como Bearer token.', format: 'jwt' })
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
  @ApiPropertyOptional({ description: 'CURP; visible según el rol autorizado.', nullable: true })
  curp?: string | null;

  @ApiPropertyOptional({ description: 'RFC; visible según el rol autorizado.', nullable: true })
  rfc?: string | null;

  @ApiPropertyOptional({ description: 'Asesor asignado; visible solo para administración.', format: 'uuid', nullable: true })
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

  @ApiProperty({ description: 'Resultado del estado activo cuando aplica.', required: false })
  activo?: boolean;

  @ApiProperty()
  mensaje: string;
}
