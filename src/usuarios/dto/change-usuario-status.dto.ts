import { IsBoolean } from 'class-validator';

export class ChangeUsuarioStatusDto {
  @IsBoolean()
  activo: boolean;
}
