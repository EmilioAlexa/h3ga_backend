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

  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fecha_vencimiento?: Date | null;

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

}
