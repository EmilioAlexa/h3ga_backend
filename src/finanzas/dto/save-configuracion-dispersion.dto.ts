import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConfiguracionDispersionItemDto {
  @ApiProperty({ minimum: 1, maximum: 32767 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(32767)
  concepto_id: number;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  receptor_dispersion_id: string;

  @ApiProperty({
    type: String,
    example: '15.00',
    description: 'Porcentaje entre 0 y 100, en pasos de 0.5.',
    pattern: '^\\d{1,3}(\\.5|\\.0{1,2})?$',
  })
  @IsString()
  @Matches(/^\d{1,3}(\.\d{1,2})?$/)
  valor: string;
}

export class SaveConfiguracionDispersionDto {
  @ApiProperty({ type: [ConfiguracionDispersionItemDto], maxItems: 20 })
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique((item: ConfiguracionDispersionItemDto) => item.concepto_id)
  @ValidateNested({ each: true })
  @Type(() => ConfiguracionDispersionItemDto)
  configuracion: ConfiguracionDispersionItemDto[];
}

export class QueryComisionesDto {
  @ApiProperty({ required: false, minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiProperty({ required: false, minimum: 1, maximum: 100, default: 20 })
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiProperty({ required: false, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  contrato_id?: string;

  @ApiProperty({ required: false, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  pago_id?: string;

  @ApiProperty({ required: false, minimum: 1, maximum: 32767 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(32767)
  estado_id?: number;
}
