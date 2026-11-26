import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MODALIDADES } from '../modalidades.rules';
import type { Modalidad } from '../modalidades.rules';

export class GuardarModalidadesDto {
  @ApiProperty({ enum: [...MODALIDADES], isArray: true, minItems: 1, maxItems: 2 })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2) @ArrayUnique() @IsIn(MODALIDADES, { each: true })
  modalidades: Modalidad[];
}
export class ActualizarModalidadDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 32767 })
  @ValidateIf((_, v) => v !== undefined) @IsInt() @Min(1) @Max(32767)
  fase_id?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 32767 })
  @ValidateIf((_, v) => v !== undefined) @IsInt() @Min(1) @Max(32767)
  estatus_id?: number;

  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true })
  fecha_cita_imss?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '350.25', description: 'Decimal exacto no negativo, máximo 8 enteros y 2 decimales.' })
  @IsOptional() @IsString() @Matches(/^\d{1,8}(\.\d{1,2})?$/)
  ultimo_salario_diario_registrado?: string | null;
}
export class QueryModalidadesClientesDto {
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 20, maximum: 100 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) q?: string;
  @ApiPropertyOptional({ enum: [...MODALIDADES] }) @IsOptional() @IsIn(MODALIDADES) modalidad?: Modalidad;
  @ApiPropertyOptional({ enum: ['m10_m40r', 'm40_m40r'] }) @IsOptional() @IsIn(['m10_m40r', 'm40_m40r']) combinacion?: 'm10_m40r' | 'm40_m40r';
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(32767) estatus_id?: number;
  @ApiPropertyOptional({ format: 'date' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) fecha_desde?: string;
  @ApiPropertyOptional({ format: 'date' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) fecha_hasta?: string;
  @ApiPropertyOptional({ enum: ['nombre', 'ingreso'], default: 'nombre' }) @IsOptional() @IsIn(['nombre', 'ingreso']) orden: 'nombre' | 'ingreso' = 'nombre';
}
export class QueryModalidadesAgendaDto {
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() cliente_id?: string;
  @ApiPropertyOptional({ format: 'date' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) fecha_desde?: string;
  @ApiPropertyOptional({ format: 'date' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) fecha_hasta?: string;
  @ApiPropertyOptional({ enum: ['pendiente', 'cumplido', 'reagendado', 'cancelado'] }) @IsOptional() @IsIn(['pendiente', 'cumplido', 'reagendado', 'cancelado']) estatus?: 'pendiente' | 'cumplido' | 'reagendado' | 'cancelado';
}
