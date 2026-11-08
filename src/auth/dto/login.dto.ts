import {IsEmail, IsString, MinLength} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    description: 'Correo electrónico registrado para el usuario.',
    example: 'usuario@ejemplo.test',
    format: 'email',
  })
  @IsEmail()
  correo_electronico: string;

  @ApiProperty({
    description: 'Contraseña del usuario. Nunca se devuelve en la respuesta.',
    minLength: 8,
    writeOnly: true,
  })
  @IsString()
  @MinLength(8)
  contrasena: string;
}
