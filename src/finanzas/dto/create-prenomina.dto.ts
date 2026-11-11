import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreatePrenominaDto {
  @ApiProperty({ description: 'ID de un estado existente en estados_prenomina.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  estado_id!: number;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observaciones?: string;
}
