import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const LIMITE_POR_OMISION = 8;
export class DashboardQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: LIMITE_POR_OMISION })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' && /^-?\d+$/.test(value) ? Number(value) : value)
  @IsInt() @Min(1) @Max(50)
  limite?: number;
}
