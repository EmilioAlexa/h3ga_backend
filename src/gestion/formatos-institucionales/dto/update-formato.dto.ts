import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Min,
} from 'class-validator';

import { tipo_formato } from '../../../generated/prisma/client';

export class UpdateFormatoDto {
  @IsOptional()
  @IsString({ message: 'El nombre debe ser un texto.' })
  @IsNotEmpty({ message: 'El nombre no puede estar vacío.' })
  nombre?: string;

  @IsOptional()
  @IsString({ message: 'La descripción debe ser un texto.' })
  descripcion?: string;

  @IsOptional()
  @IsInt({message: 'La dependencia debe ser un número entero.'})
  @Min(1)
  dependencia_id?: number;

  @IsOptional()
  @IsEnum(tipo_formato)
  tipo_formato?: tipo_formato;

  @IsOptional()
  @IsUrl({ require_tld: false }, {message: 'El enlace debe ser una URL válida.'})
  enlace_url?: string;

  @IsOptional()
  @IsString({message: 'La ruta del archivo debe ser un texto.'})
  archivo_path?: string;
}