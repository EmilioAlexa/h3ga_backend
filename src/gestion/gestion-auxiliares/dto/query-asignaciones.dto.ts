import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class QueryAsignacionesDto {
  @IsOptional()
  @IsUUID()
  cliente_id?: string;

  @IsOptional()
  @IsUUID()
  auxiliar_id?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  activo?: boolean;
}
