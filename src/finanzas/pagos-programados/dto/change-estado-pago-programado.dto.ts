import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangeEstadoPagoProgramadoDto {
  @ApiProperty({ minimum: 1, maximum: 32767 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(32767)
  estado_id: number;

}
