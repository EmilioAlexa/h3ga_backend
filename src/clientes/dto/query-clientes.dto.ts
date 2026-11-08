import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryClientesDto {
  @ApiPropertyOptional({ description: 'Número de página, desde 1.', minimum: 1, default: 1 })
  @Type(() => Number)
  @IsOptional()
  @Max(1_000_000)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ description: 'Cantidad de resultados por página.', minimum: 1, maximum: 100, default: 20 })
  @Type(() => Number)
  @ApiPropertyOptional({ description: 'Búsqueda por nombre, apellidos o correo electrónico.', maxLength: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  q?: string;
}
