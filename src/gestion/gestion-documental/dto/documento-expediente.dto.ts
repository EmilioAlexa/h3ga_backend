import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class QueryDocumentosDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Etapa existente del mismo cliente. Sin filtro devuelve el expediente.' })
  @IsOptional() @IsUUID() etapa_tramite_id?: string;
}
export class MetadatosDocumentoDto {
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(4000) observaciones?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(200) numero_referencia?: string | null;
}
export class CargarDocumentoDto extends MetadatosDocumentoDto {
  @ApiProperty({ minimum: 1, maximum: 32767 }) @Type(() => Number) @IsInt() @Min(1) @Max(32767) tipo_documento_id: number;
  @ApiPropertyOptional({ format: 'uuid', description: 'Solo etapas existentes y verificadas de una modalidad seleccionada. Omitir para documento general.' })
  @IsOptional() @IsUUID() etapa_tramite_id?: string;
}
