import {
  IsEmail,
  IsInt,
  Max,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUsuarioDto {
  @ApiProperty({ description: 'Identificador de un rol existente.', minimum: 1, maximum: 32767 })
  @IsInt()
  @Min(1)
  @Max(32767)
  rol_id: number;

  @ApiProperty({ description: 'Nombre del usuario.' })
  @IsString()
  @MinLength(1)
  nombre: string;

  @ApiProperty({ description: 'Apellido paterno del usuario.' })
  @IsString()
  @MinLength(1)
  apellido_paterno: string;

  @ApiPropertyOptional({ description: 'Apellido materno del usuario.', nullable: true })
  @IsOptional()
  @IsString()
  apellido_materno?: string | null;

  @ApiProperty({ description: 'Correo electrónico único.', format: 'email', example: 'persona@ejemplo.test' })
  @IsEmail()
  correo_electronico: string;

  @ApiProperty({ description: 'Contraseña inicial. No se expone en las respuestas.', minLength: 8, writeOnly: true })
  @IsString()
  @MinLength(8)
  contrasena: string;
}
