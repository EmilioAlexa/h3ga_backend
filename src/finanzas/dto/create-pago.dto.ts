import { Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePagoDto {
  @ApiProperty({
    description: 'UUID del contrato relacionado.',
    format: 'uuid',
  })
  @IsUUID()
  contrato_id: string;

  @ApiPropertyOptional({
    description: 'UUID opcional de un pago programado del mismo contrato.',
    format: 'uuid',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  pago_programado_id?: string | null;

  @ApiProperty({
    description: 'ID de una forma de pago activa del catálogo.',
    minimum: 1,
    maximum: 32767,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(32767)
  forma_pago_id: number;

  @ApiProperty({
    description: 'Importe positivo con hasta dos decimales.',
    type: String,
    example: '1250.00',
    pattern: '^\\d{1,10}(\\.\\d{1,2})?$',
  })
  @IsString()
  @Matches(/^\d{1,10}(\.\d{1,2})?$/)
  monto: string;

  @ApiProperty({
    description: 'Fecha y hora efectiva en que se recibió el pago.',
    type: String,
    format: 'date-time',
  })
  @Type(() => Date)
  @IsDate()
  fecha_pago: Date;

  @ApiPropertyOptional({
    description: 'Referencia de transferencia, depósito o pago.',
    maxLength: 100,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  referencia_pago?: string | null;

  @ApiPropertyOptional({
    description: 'Folio del recibo; obligatorio para efectivo.',
    maxLength: 100,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  folio_recibo?: string | null;

  @ApiPropertyOptional({
    description:
      'UUID del usuario que recibió el dinero; obligatorio para efectivo.',
    format: 'uuid',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  recibido_por?: string | null;

  @ApiPropertyOptional({
    description: 'Lugar de recepción, cuando corresponda.',
    maxLength: 150,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  lugar_recepcion?: string | null;

  @ApiPropertyOptional({ description: 'Observaciones.', nullable: true })
  @IsOptional()
  @IsString()
  observaciones?: string | null;
}
