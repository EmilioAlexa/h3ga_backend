import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  IsUUID,
  Matches,
  Validate,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CURP_FORMATO, RFC_FORMATO, FechaCalendario, NacimientoNoFuturo } from './cliente-validaciones';

const trimText = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateClienteDto {
  @ApiPropertyOptional({ description: 'UUID de un cliente referidor asignado al mismo asesor. Opcional; no se interpreta el texto histórico referido_por.', format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  referido_por_cliente_id?: string | null;

  @ApiProperty({ description: 'Nombre del cliente.' })
  @Transform(trimText)
  @IsString()
  @MinLength(1)
  nombre: string;

  @ApiProperty({ description: 'Apellido paterno del cliente.' })
  @Transform(trimText)
  @IsString()
  @MinLength(1)
  apellido_paterno: string;

  @ApiPropertyOptional({ description: 'Apellido materno del cliente.', nullable: true })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  apellido_materno?: string | null;

  @ApiPropertyOptional({ description: 'Teléfono de contacto.', nullable: true })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  telefono?: string | null;

  @ApiPropertyOptional({ description: 'Correo electrónico de contacto.', nullable: true, format: 'email' })
  @Transform(trimText)
  @IsOptional()
  @IsEmail()
  correo_electronico?: string | null;

  @ApiPropertyOptional({ description: 'CURP de 18 caracteres. Se normaliza a mayúsculas.', minLength: 18, maxLength: 18, nullable: true })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsOptional()
  @IsString()
  @Matches(CURP_FORMATO, { message: 'La CURP debe tener un formato válido de 18 caracteres' })
  curp?: string | null;

  @ApiPropertyOptional({ description: 'RFC de hasta 13 caracteres. Se normaliza a mayúsculas.', maxLength: 13, nullable: true })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsOptional()
  @IsString()
  @Matches(RFC_FORMATO, { message: 'El RFC debe tener un formato válido de 12 o 13 caracteres' })
  rfc?: string | null;

  @ApiPropertyOptional({ type: String, format: 'date', nullable: true, description: 'Fecha de nacimiento no futura, AAAA-MM-DD.' })
  @IsOptional()
  @Validate(FechaCalendario)
  @Validate(NacimientoNoFuturo)
  fecha_nacimiento?: string | null;

  @ApiPropertyOptional({ description: 'Domicilio del cliente.', nullable: true })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  domicilio?: string | null;

  @ApiPropertyOptional({ description: 'Texto informativo de quién recomendó al cliente; no asigna un UUID.', nullable: true })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  referido_por?: string | null;

  @ApiPropertyOptional({ description: 'Observaciones generales del cliente.', nullable: true })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  observaciones_generales?: string | null;
}
