import { IsInt, Max, Min } from 'class-validator';

export class ChangeUsuarioRoleDto {
  @IsInt()
  @Min(1)
  @Max(32767)
  rol_id: number;
}
