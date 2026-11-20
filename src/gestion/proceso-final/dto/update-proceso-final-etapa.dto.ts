import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateProcesoFinalEtapaDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(32767)
  estatus_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  avance_porcentaje?: number;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  accion_a_realizar?: string | null;

  @IsOptional()
  @IsDateString({ strict: true })
  fecha_compromiso?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  motivo_rechazo?: string | null;
}
