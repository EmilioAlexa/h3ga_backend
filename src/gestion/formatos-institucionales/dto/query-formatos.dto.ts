import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class QueryFormatosDto {
  @IsOptional()
  @IsString({ message: 'La búsqueda debe ser un texto.' })
  buscar?: string;

  @IsOptional()
  @IsIn(['pdf', 'word', 'enlace'])
  tipo?: 'pdf' | 'word' | 'enlace';

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  desde?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  hasta?: string;

  @IsOptional()
  @IsIn(['recientes', 'antiguos'])
  orden?: 'recientes' | 'antiguos';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limite: number = 10;
}