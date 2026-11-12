import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryCortesFinancierosDto {
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

  @ApiPropertyOptional({
    description:
      'Filtra cortes cuyo periodo se cruza con este inicio (ISO 8601).',
  })
  @IsOptional()
  @IsDateString()
  fecha_desde?: string;

  @ApiPropertyOptional({
    description: 'Filtra cortes cuyo periodo se cruza con este fin (ISO 8601).',
  })
  @IsOptional()
  @IsDateString()
  fecha_hasta?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 32767 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(32767)
  estado_id?: number;
}
