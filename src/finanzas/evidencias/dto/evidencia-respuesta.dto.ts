import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EvidenciaPagoRespuestaDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  pago_id: string;

  @ApiPropertyOptional({ nullable: true })
  tipo_evidencia_id?: number | null;

  @ApiPropertyOptional({ nullable: true })
  nombre_original?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'application/pdf' })
  tipo_archivo?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 143221 })
  tamano_bytes?: number | null;

  @ApiPropertyOptional({ nullable: true })
  hash_archivo?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  subido_por?: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  fecha_carga: Date;

  @ApiPropertyOptional({ type: 'object', nullable: true, additionalProperties: true })
  tipos_evidencia_pago?: Record<string, unknown> | null;

  @ApiPropertyOptional({ type: 'object', nullable: true, additionalProperties: true })
  usuarios?: Record<string, unknown> | null;
}
