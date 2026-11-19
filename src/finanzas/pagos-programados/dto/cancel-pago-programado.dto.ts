import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class CancelPagoProgramadoDto {
  @ApiProperty({ maxLength: 1000, description: 'Motivo obligatorio que se conserva junto al actor y fecha de cancelación.' })
  @IsString()
  @MaxLength(1000)
  motivo: string;
}
