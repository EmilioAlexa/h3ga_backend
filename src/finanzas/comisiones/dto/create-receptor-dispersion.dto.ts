import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReceptorDispersionDto {
  @ApiProperty({ minimum: 1, maximum: 32767 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(32767)
  concepto_id: number;

  @ApiPropertyOptional({ format: 'uuid', description: 'Usuario activo para conceptos internos.' })
  @IsOptional()
  @IsUUID()
  usuario_id?: string;

  @ApiPropertyOptional({ maxLength: 150, description: 'Nombre registrado del receptor externo.' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  nombre_externo?: string;
}
