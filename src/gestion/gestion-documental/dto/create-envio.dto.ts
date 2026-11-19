import { Type } from 'class-transformer';
import { IsInt, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateEnvioDto {
  @IsUUID()
  tarea_id!: string;

  @IsString()
  @MaxLength(250)
  titulo!: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  tipo_documento_id!: number;
}
