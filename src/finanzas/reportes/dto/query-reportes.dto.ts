import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

export class QueryReportesFinancierosDto {
  @ApiProperty({ description: 'Inicio del periodo como fecha local America/Cancun.', example: '2026-01-01' })
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fecha_desde!: string;

  @ApiProperty({ description: 'Fin inclusivo del periodo como fecha local America/Cancun.', example: '2026-01-31' })
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fecha_hasta!: string;

  @ApiPropertyOptional({ enum: ['semanal', 'mensual', 'anual'], default: 'mensual' })
  @IsOptional()
  @IsIn(['semanal', 'mensual', 'anual'])
  granularidad: 'semanal' | 'mensual' | 'anual' = 'mensual';

  @ApiPropertyOptional({ default: false, description: 'Compara con un periodo inmediatamente anterior de la misma duración.' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value)
  @IsBoolean()
  comparar = false;

  @ApiPropertyOptional({ minimum: 1, maximum: 32767, description: 'Filtra pagos por método de pago.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(32767)
  forma_pago_id?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 32767, description: 'Filtra por tipo de venta representado en seguimiento APD.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(32767)
  tipo_venta_id?: number;
}
