import { Type } from 'class-transformer';
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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateContratoDto {
  @ApiProperty({ description: 'UUID de un cliente existente.', format: 'uuid' })
  @IsUUID()
  cliente_id: string;

  @ApiProperty({
    description: 'Identificador de un servicio activo.',
    minimum: 1,
    maximum: 32767,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(32767)
  servicio_id: number;

  @ApiProperty({
    description: 'UUID de un usuario activo asignado como asesor.',
    format: 'uuid',
  })
  @IsUUID()
  asesor_id: string;

  @ApiProperty({
    description: 'Folio del contrato (máximo 50 caracteres).',
    maxLength: 50,
  })
  @IsString()
  @MaxLength(50)
  folio: string;

  @ApiProperty({
    description: 'Fecha del contrato en formato ISO 8601.',
    type: String,
    format: 'date',
  })
  @Type(() => Date)
  @IsDate()
  fecha_contrato: Date;

  @ApiProperty({
    description:
      'Identificador de un estado existente del catálogo estados-contrato.',
    minimum: 1,
    maximum: 32767,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(32767)
  estado_contrato_id: number;

  @ApiPropertyOptional({
    description: 'Cantidad de pagos indicada para el contrato.',
    minimum: 1,
    maximum: 32767,
    nullable: true,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(32767)
  cantidad_pagos?: number | null;

  @ApiPropertyOptional({
    description: 'Observaciones del contrato.',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  observaciones?: string | null;
}
