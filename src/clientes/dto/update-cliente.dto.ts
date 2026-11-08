import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

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
  @Length(18, 18)
  curp?: string | null;

  @ApiPropertyOptional({ description: 'RFC de hasta 13 caracteres; se normaliza a mayúsculas.', maxLength: 13, nullable: true })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(13)
  rfc?: string | null;
}
