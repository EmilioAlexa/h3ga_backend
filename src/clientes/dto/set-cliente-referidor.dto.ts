import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetClienteReferidorDto {
  @ApiProperty({ format: 'uuid', nullable: true, description: 'Cliente referidor existente, o null para retirar la asignación.' })
  @IsOptional()
  @IsUUID()
  referidor_cliente_id?: string | null;

  @ApiProperty({ minLength: 1, maxLength: 500, description: 'Motivo obligatorio de la reasignación.' })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  motivo: string;
}
