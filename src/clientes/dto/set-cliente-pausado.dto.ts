import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetClientePausadoDto {
  @ApiProperty({
    type: Boolean,
    description: 'true pausa al cliente; false lo reactiva.',
  })
  @IsBoolean()
  pausado: boolean;
}
