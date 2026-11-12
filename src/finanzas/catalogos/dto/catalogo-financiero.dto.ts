import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { tipo_destino_dispersion } from '../../../generated/prisma/enums';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CatalogoFinancieroDto {
  @ApiPropertyOptional({ description: 'Nombre del registro de catálogo.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nombre?: string;

  @ApiPropertyOptional({ description: 'Descripción del registro.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  descripcion?: string;

  @ApiPropertyOptional({ description: 'Estado de disponibilidad, solo para catálogos que contienen este campo.' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  activo?: boolean;

  @ApiPropertyOptional({ description: 'Destino definido por el esquema Prisma.', enum: tipo_destino_dispersion })
  @IsOptional()
  @IsEnum(tipo_destino_dispersion)
  tipo_destino?: tipo_destino_dispersion;

  @ApiPropertyOptional({ description: 'Indica si el concepto se incluye en prenómina.' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  incluye_en_prenomina?: boolean;

  @ApiPropertyOptional({ description: 'Indica si el concepto representa el remanente.' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  es_remanente?: boolean;

  @ApiPropertyOptional({ description: 'Orden del catálogo cuando aplica.', minimum: 0, maximum: 32767 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(32767)
  orden?: number;
}
