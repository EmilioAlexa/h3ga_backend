
import { Type, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class QueryFormatosDto {
  @IsOptional()
  @IsString({ message: 'La búsqueda debe ser un texto.' })
  buscar?: string;

  @IsOptional()
  @IsIn(['pdf', 'word', 'enlace'])
  tipo?: 'pdf' | 'word' | 'enlace';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dependencia_id?: number;

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
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  nuevos?: boolean;

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
