import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateContratoDto {
  @ApiPropertyOptional({
    description:
      'Observaciones. En esta etapa es el único campo editable por PATCH.',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  observaciones?: string | null;
}
