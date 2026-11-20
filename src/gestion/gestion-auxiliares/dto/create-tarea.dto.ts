import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateTareaDto {
  @IsUUID()
  cliente_id!: string;

  @IsUUID()
  auxiliar_id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(250)
  titulo!: string;

  @IsString()
  @MinLength(1)
  instrucciones!: string;

  @IsOptional()
  @IsUUID()
  etapa_tramite_id?: string;
}
