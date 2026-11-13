import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum AccionEstadoPago {
  RECHAZAR = 'rechazar',
  ENVIAR_A_AUTORIZACION = 'enviar_a_autorizacion',
  VALIDAR = 'validar',
}

export class ChangeEstadoPagoDto {
  @ApiProperty({ enum: AccionEstadoPago })
  @IsEnum(AccionEstadoPago)
  accion: AccionEstadoPago;

  @ApiPropertyOptional({
    description: 'Comentario de revisión, rechazo o autorización.',
    maxLength: 1000,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comentario?: string | null;
}
