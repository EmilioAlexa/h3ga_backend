import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReceptorDispersionDto {
  @ApiProperty({ minimum: 1, maximum: 32767 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(32767)
  concepto_id: number;

  @ApiPropertyOptional({ format: 'uuid', description: 'Solo usuario Asesor activo.' })
  @IsOptional()
  @IsUUID()
  usuario_id?: string;

  @ApiPropertyOptional({ maxLength: 150, description: 'Nombre manual de Director, Gerente, Bróker u Otro. Otro lo exige; para los demás, la ausencia de nombre se expresa omitiendo el receptor en la configuración.' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  nombre_externo?: string;
}
