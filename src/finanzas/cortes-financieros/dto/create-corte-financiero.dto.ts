import { IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCorteFinancieroDto {
  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-11-06',
    description: 'Viernes de inicio del periodo semanal en America/Cancun.',
  })
  @IsDateString({ strict: true })
  periodo_inicio: string;
}
