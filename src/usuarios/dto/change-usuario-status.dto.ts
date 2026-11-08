import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangeUsuarioStatusDto {
  @ApiProperty({ description: 'Indica si la cuenta debe estar activa.', type: Boolean })
  @IsBoolean()
  activo: boolean;
}
