import { Type } from 'class-transformer';
import {
  IsDate,
  IsDecimal,
  MaxLength,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateContratoDto {
  @ApiPropertyOptional({description: 'Salario diario expl?cito para M40/M40R. No calcula cuotas.'})
  @IsOptional() @IsDecimal({decimal_digits: '0,2', force_decimal: false})
  salario_diario?: string;

  @ApiPropertyOptional({description: 'Monto mensual expl?cito para M10/M40.'})
  @IsOptional() @IsDecimal({decimal_digits: '0,2', force_decimal: false})
  monto_mensual?: string;

  @ApiPropertyOptional({description: 'Periodo descriptivo M10; M40 admite 6, 12, 24 meses o Indefinido.'})
  @IsOptional() @IsString() @MaxLength(100)
  periodo_contrato?: string;

  @ApiPropertyOptional({description: 'Fecha de t?rmino expl?cita, ?nicamente M40.'})
  @IsOptional() @Type(() => Date) @IsDate()
  fecha_fin?: Date;

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

  @ApiPropertyOptional({
    description:
      'UUID del asesor activo a quien se asigna el contrato. Obligatorio para administradores; los asesores se asignan automáticamente desde el JWT y no deben enviar esta propiedad.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  asesor_id?: string;

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
