import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertProcesoFinalDatosInstitucionalesDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  institucion?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  folio_institucional?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  numero_expediente?: string | null;

  @IsOptional()
  @IsDateString({ strict: true })
  fecha_solicitud?: string | null;

  @IsOptional()
  @IsDateString({ strict: true })
  fecha_resolucion?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  resultado_resolucion?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  observaciones?: string | null;
}
