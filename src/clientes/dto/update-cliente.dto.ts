import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
  Matches,
  Validate,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CURP_FORMATO, RFC_FORMATO, FechaCalendario, NacimientoNoFuturo } from './cliente-validaciones';

const trimText = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateClienteDto {
  @ApiPropertyOptional({ description: 'Nuevo nombre del cliente.' })
  @Transform(trimText)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  nombre?: string;

  @ApiPropertyOptional({ description: 'Nuevo apellido paterno.' })
  @Transform(trimText)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  apellido_paterno?: string;

  @ApiPropertyOptional({ description: 'Nuevo apellido materno.', nullable: true })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  apellido_materno?: string | null;

  @ApiPropertyOptional({ description: 'Nuevo teléfono de contacto.', nullable: true })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  telefono?: string | null;

  @ApiPropertyOptional({ description: 'Nuevo correo electrónico de contacto.', nullable: true, format: 'email' })
  @Transform(trimText)
  @IsOptional()
  @IsEmail()
  correo_electronico?: string | null;

  @ApiPropertyOptional({ description: 'CURP de 18 caracteres; se normaliza a mayúsculas.', minLength: 18, maxLength: 18, nullable: true })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsOptional()
  @IsString()
  @Matches(CURP_FORMATO, { message: 'La CURP debe tener un formato válido de 18 caracteres' })
  curp?: string | null;

  @ApiPropertyOptional({ description: 'RFC de hasta 13 caracteres; se normaliza a mayúsculas.', maxLength: 13, nullable: true })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsOptional()
  @IsString()
  @Matches(RFC_FORMATO, { message: 'El RFC debe tener un formato válido de 12 o 13 caracteres' })
  rfc?: string | null;

  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  @IsOptional()
  @Validate(FechaCalendario)
  @Validate(NacimientoNoFuturo)
  fecha_nacimiento?: string | null;

  @ApiPropertyOptional({ description: 'Nuevo domicilio del cliente.', nullable: true })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  domicilio?: string | null;

  @ApiPropertyOptional({ description: 'Texto informativo de quién recomendó al cliente; no modifica la relación UUID.', nullable: true })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  referido_por?: string | null;

  @ApiPropertyOptional({ description: 'Nuevas observaciones generales.', nullable: true })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  observaciones_generales?: string | null;
}
