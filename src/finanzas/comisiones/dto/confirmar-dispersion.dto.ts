import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class ConfirmarDispersionDto {
  @ApiProperty({ format: 'uuid', description: 'Clave estable de la operación para reconocer reintentos.' })
  @IsUUID()
  idempotency_key: string;

  @ApiProperty({ maxLength: 120, description: 'Referencia real de la transferencia total.' })
  @IsString()
  @MaxLength(120)
  @Matches(/\S/)
  referencia_transferencia: string;
}
