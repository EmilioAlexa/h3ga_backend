import { IsInt, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangeUsuarioRoleDto {
  @ApiProperty({ description: 'Identificador del rol existente que se asignará.', minimum: 1, maximum: 32767 })
  @IsInt()
  @Min(1)
  @Max(32767)
  rol_id: number;
}
