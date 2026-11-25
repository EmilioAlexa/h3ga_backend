import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CargarFormatoDto {
  @IsString() @IsNotEmpty() nombre: string;
  @IsOptional() @IsString() descripcion?: string;
  @Type(() => Number) @IsInt() @Min(1) dependencia_id: number;
  @IsIn(['pdf', 'word']) tipo_formato: 'pdf' | 'word';
}
