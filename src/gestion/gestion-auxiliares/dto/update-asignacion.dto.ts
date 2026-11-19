import { IsBoolean } from 'class-validator';

export class UpdateAsignacionDto {
  @IsBoolean()
  activo!: boolean;
}
