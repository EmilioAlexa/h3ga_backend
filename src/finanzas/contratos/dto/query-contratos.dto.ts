import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryContratosDto {
  @ApiPropertyOptional({
    description: 'Página desde 1.',
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({
    description: 'Resultados por página (máximo 100).',
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({
    description: 'Filtra por UUID de cliente.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  cliente_id?: string;

  @ApiPropertyOptional({
    description: 'Filtra por ID de servicio.',
    minimum: 1,
    maximum: 32767,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(32767)
  servicio_id?: number;

  @ApiPropertyOptional({
    description: 'Filtra por ID de estado contractual.',
    minimum: 1,
    maximum: 32767,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(32767)
  estado_contrato_id?: number;

  @ApiPropertyOptional({
    description:
      'Filtra por UUID del asesor asignado; disponible para administración.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  asesor_id?: string;

  @ApiPropertyOptional({
    description: 'Fecha inicial inclusiva del contrato.',
    type: String,
    format: 'date',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fecha_desde?: Date;

  @ApiPropertyOptional({
    description: 'Fecha final inclusiva del contrato.',
    type: String,
    format: 'date',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fecha_hasta?: Date;

  @ApiPropertyOptional({ description: 'Busca por folio.', maxLength: 50 })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(50)
  q?: string;
}
