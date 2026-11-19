import { Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  IsEnum,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClasificacionTopeApd } from '../../../generated/prisma/client';

export class CreatePagoProgramadoDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  contrato_id: string;

  @ApiProperty({ minimum: 1, maximum: 32767 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(32767)
  numero_pago: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 32767, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(32767)
  tipo_cobro_id?: number | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    nullable: true,
    description: 'Fecha esperada del cobro; no crea un pago real.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fecha_esperada?: Date | null;

  @ApiProperty({ type: String, format: 'date', description: 'Fecha límite de la obligación; obligatoria para nuevas programaciones.' })
  @Type(() => Date)
  @IsDate()
  fecha_vencimiento: Date;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '1250.00',
    pattern: '^\\d{1,10}(\\.\\d{1,2})?$',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,10}(\.\d{1,2})?$/)
  monto_esperado?: string | null;

  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  periodo?: Date | null;

  @ApiPropertyOptional({ description: 'Justificación persistida cuando coincide contrato, fecha esperada e importe con otra obligación.', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  justificacion_duplicado?: string | null;

  @ApiPropertyOptional({ description: 'Motivo particular, obligatorio para el tipo Penalización APD.', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  motivo_penalizacion?: string | null;

  @ApiPropertyOptional({ enum: ClasificacionTopeApd, description: 'Clasificación por cobro APD; no calcula el límite.' })
  @IsOptional()
  @IsEnum(ClasificacionTopeApd)
  clasificacion_tope_apd?: ClasificacionTopeApd | null;

  @ApiPropertyOptional({ type: String, example: '1200.00', description: 'Importe recibido por el beneficiario APD, distinto del pago a H3GA.' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,10}(\.\d{1,2})?$/)
  monto_recibido_beneficiario_apd?: string | null;

}
