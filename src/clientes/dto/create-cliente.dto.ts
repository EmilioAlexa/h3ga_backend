import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

const trimText = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateClienteDto {
  @Transform(trimText)
  @IsString()
  @MinLength(1)
  nombre: string;

  @Transform(trimText)
  @IsString()
  @MinLength(1)
  apellido_paterno: string;

  @Transform(trimText)
  @IsOptional()
  @IsString()
  apellido_materno?: string | null;

  @Transform(trimText)
  @IsOptional()
  @IsString()
  telefono?: string | null;

  @Transform(trimText)
  @IsOptional()
  @IsEmail()
  correo_electronico?: string | null;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsOptional()
  @IsString()
  @Length(18, 18)
  curp?: string | null;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(13)
  rfc?: string | null;
}
