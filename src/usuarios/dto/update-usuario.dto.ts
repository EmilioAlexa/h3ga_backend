import {
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateUsuarioDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  nombre?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  apellido_paterno?: string;

  @IsOptional()
  @IsString()
  apellido_materno?: string | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEmail()
  correo_electronico?: string;
}
