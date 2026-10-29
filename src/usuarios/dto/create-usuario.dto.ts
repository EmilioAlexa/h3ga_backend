import {
  IsEmail,
  IsInt,
  Max,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateUsuarioDto {
  @IsInt()
  @Min(1)
  @Max(32767)
  rol_id: number;

  @IsString()
  @MinLength(1)
  nombre: string;

  @IsString()
  @MinLength(1)
  apellido_paterno: string;

  @IsOptional()
  @IsString()
  apellido_materno?: string | null;

  @IsEmail()
  correo_electronico: string;

  @IsString()
  @MinLength(8)
  contrasena: string;
}
