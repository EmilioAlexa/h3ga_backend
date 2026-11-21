import { ArrayMinSize, ArrayUnique, IsArray, IsUUID, IsBoolean } from 'class-validator';

export class ConfirmarAdministrativaDto {
  @IsBoolean()
  general: boolean;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  comision_ids: string[];
}
