import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ChangeEstadoCorteDto {
  @ApiPropertyOptional({
    maxLength: 500,
    description: 'Comentario de generación, cierre o cancelación.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comentario?: string;
}
