import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { Equals, IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export class CrearSolicitudDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() cliente_id: string;
  @ApiProperty() @IsInt() @Min(1) @Max(32767) servicio_id: number;
}
export class CrearSolicitudPersonalizadaDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() cliente_id: string;
  @ApiProperty({ maxLength: 200 }) @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @IsNotEmpty() @MaxLength(200) nombre: string;
  @ApiProperty({ maxLength: 4000 }) @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @IsNotEmpty() @MaxLength(4000) descripcion: string;
}
export class CambiarServicioDto {
  @ApiProperty() @IsInt() @Min(1) @Max(32767) servicio_id: number;
  @ApiProperty({ enum: [true], description: 'Confirma que se reiniciará el seguimiento.' }) @Equals(true) confirmar: true;
}
export class BajaSolicitudDto {
  @ApiProperty({ enum: [true], description: 'Confirma la baja del seguimiento activo.' }) @Equals(true) confirmar: true;
}
export class CrearAlertaDto {
  @ApiProperty({ maxLength: 4000 }) @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @IsNotEmpty() @MaxLength(4000) motivo: string;
  @ApiProperty({ format: 'date', example: '2026-12-01' }) @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) fecha: string;
}
export class SeguimientoDto {
  @ApiPropertyOptional() @ValidateIf((_, v) => v !== undefined) @IsInt() @Min(1) @Max(32767) estatus_id?: number;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(4000) accion_a_realizar?: string | null;
  @ApiPropertyOptional({ format: 'date', nullable: true }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) fecha_compromiso?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(4000) observaciones?: string | null;
}
export class QuerySolicitudesDto {
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 20, maximum: 100 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(32767) servicio_id?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(32767) estatus_id?: number;
}
export class VincularDocumentoDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() documento_id: string;
}
