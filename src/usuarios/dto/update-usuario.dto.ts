import {
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUsuarioDto {
  @ApiPropertyOptional({ description: 'Nuevo nombre del usuario.' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  nombre?: string;

  @ApiPropertyOptional({ description: 'Nuevo apellido paterno.' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  apellido_paterno?: string;

  @ApiPropertyOptional({ description: 'Nuevo apellido materno.', nullable: true })
  @IsOptional()
  @IsString()
  apellido_materno?: string | null;

  @ApiPropertyOptional({ description: 'Nuevo correo electrónico.', format: 'email' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEmail()
  correo_electronico?: string;
}
