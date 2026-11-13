import {
  IsEmail,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class ResetPasswordDto {
  @IsEmail()
  correo_electronico: string;

  @IsString()
  @Matches(/^\d{6}$/, {
    message: 'El código debe contener exactamente 6 dígitos',
  })
  codigo: string;

  @IsString()
  @MinLength(8, {
    message: 'La contraseña debe tener al menos 8 caracteres',
  })
  nueva_contrasena: string;
}