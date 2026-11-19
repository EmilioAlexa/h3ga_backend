import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class QueryTareasDto {
  @IsOptional()
  @IsUUID()
  cliente_id?: string;

  @IsOptional()
  @IsUUID()
  auxiliar_id?: string;

  @IsOptional()
  @IsIn(['pendiente', 'en_proceso', 'en_revision', 'correcciones', 'validada', 'cancelada'])
  estatus?: 'pendiente' | 'en_proceso' | 'en_revision' | 'correcciones' | 'validada' | 'cancelada';
}
