import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class QueryFinancialDashboardDto {
  @ApiPropertyOptional({ description: 'Viernes inicial de la semana financiera en America/Cancun (YYYY-MM-DD). Por defecto, viernes de la semana actual.', example: '2026-11-13' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  semana?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 20, default: 5, description: 'Máximo de próximos cobros y eventos recientes por bloque.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limite = 5;

  @ApiPropertyOptional({ description: 'Cursor opaco devuelto por proximos_cobros.next_cursor.' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor_cobros?: string;

  @ApiPropertyOptional({ description: 'Cursor opaco devuelto por actividad_reciente.next_cursor.' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor_actividad?: string;
}
