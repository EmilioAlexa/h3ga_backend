import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangeEstadoComisionDto {
  @ApiProperty({ maxLength: 500, description: 'Confirmación administrativa explícita de una transferencia real; queda en el historial.' })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(500)
  comentario: string;
}
