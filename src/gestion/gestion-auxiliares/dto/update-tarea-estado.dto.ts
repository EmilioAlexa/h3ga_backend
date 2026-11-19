import { IsIn } from 'class-validator';

export class UpdateTareaEstadoDto {
  @IsIn(['pendiente', 'en_proceso', 'en_revision', 'correcciones', 'validada', 'cancelada'])
  estatus!: 'pendiente' | 'en_proceso' | 'en_revision' | 'correcciones' | 'validada' | 'cancelada';
}
