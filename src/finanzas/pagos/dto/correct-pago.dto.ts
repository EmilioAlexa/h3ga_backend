import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDate, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

export class CorrectPagoDto {
  @ApiProperty({ description: 'Motivo de la corrección; queda en la auditoría.', maxLength: 1000 })
  @IsString()
  @MaxLength(1000)
  motivo: string;

  @ApiPropertyOptional({ description: 'Nuevo importe positivo, como string decimal.', type: String, example: '1250.00' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,10}(\.\d{1,2})?$/)
  monto?: string;

  @ApiPropertyOptional({ description: 'Nueva fecha efectiva del pago.', type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fecha_pago?: Date;

  @ApiPropertyOptional({ description: 'ID de forma de pago activa.', minimum: 1, maximum: 32767 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(32767)
  forma_pago_id?: number;

  @ApiPropertyOptional({ description: 'Observaciones corregidas.', nullable: true })
  @IsOptional()
  @IsString()
  observaciones?: string | null;

  @ApiPropertyOptional({ description: 'Folio del recibo; obligatorio si el método resultante es efectivo.', nullable: true, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  folio_recibo?: string | null;

  @ApiPropertyOptional({ description: 'UUID del usuario receptor activo; obligatorio para efectivo.', nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  recibido_por?: string | null;

  @ApiPropertyOptional({ description: 'Lugar de recepción.', nullable: true, maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  lugar_recepcion?: string | null;
}
