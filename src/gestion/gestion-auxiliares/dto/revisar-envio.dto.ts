import { IsIn, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class RevisarEnvioDto {
  @IsIn(['validado', 'no_validado'])
  resultado!: 'validado' | 'no_validado';

  @ValidateIf((dto: RevisarEnvioDto) => dto.resultado === 'no_validado')
  @IsString()
  @MaxLength(4000)
  comentario?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  observacion?: string;
}
