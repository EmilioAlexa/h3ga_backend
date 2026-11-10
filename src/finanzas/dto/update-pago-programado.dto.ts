import { PartialType } from '@nestjs/swagger';
import { CreatePagoProgramadoDto } from './create-pago-programado.dto';

// El estado tiene una ruta administrativa separada.
export class UpdatePagoProgramadoDto extends PartialType(CreatePagoProgramadoDto) {}
