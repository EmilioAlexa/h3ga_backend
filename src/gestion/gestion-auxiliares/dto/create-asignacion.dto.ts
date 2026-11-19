import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class CreateAsignacionDto {
  @IsUUID()
  cliente_id!: string;

  @IsUUID()
  auxiliar_id!: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
