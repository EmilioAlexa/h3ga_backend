import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const trimText = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateClienteDto {
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
  @Length(18, 18)
  curp?: string | null;

  @ApiPropertyOptional({ description: 'RFC de hasta 13 caracteres. Se normaliza a mayúsculas.', maxLength: 13, nullable: true })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(13)
  rfc?: string | null;
}
