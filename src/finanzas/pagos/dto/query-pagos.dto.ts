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

export class QueryPagosDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filtra por contrato.' })
  @IsOptional()
  @IsUUID()
  contrato_id?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filtra por cliente.' })
  @IsOptional()
  @IsUUID()
  cliente_id?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Filtro administrativo por asesor; se ignora para asesores.',
  })
  @IsOptional()
  @IsUUID()
  asesor_id?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 32767 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(32767)
  estado_pago_id?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 32767 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(32767)
  forma_pago_id?: number;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fecha_desde?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fecha_hasta?: Date;

  @ApiPropertyOptional({
    maxLength: 100,
    description: 'Busca por referencia o folio.',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  q?: string;
}
