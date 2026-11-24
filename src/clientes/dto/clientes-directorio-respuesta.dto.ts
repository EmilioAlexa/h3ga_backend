import { ApiProperty } from '@nestjs/swagger';
import {
  ClienteResumenRespuestaDto,
  PaginacionRespuestaDto,
} from '../../openapi/response-models.dto';

class AsesorDirectorioRespuestaDto {
  @ApiProperty()
  nombre: string;

  @ApiProperty()
  apellido_paterno: string;

  @ApiProperty({ type: String, nullable: true })
  apellido_materno: string | null;
}

class ServicioDirectorioRespuestaDto {
  @ApiProperty()
  nombre: string;
}

class ContratoServicioDirectorioRespuestaDto {
  @ApiProperty({ type: ServicioDirectorioRespuestaDto })
  servicios: ServicioDirectorioRespuestaDto;
}

class ClienteDirectorioRespuestaDto extends ClienteResumenRespuestaDto {
  @ApiProperty({
    type: AsesorDirectorioRespuestaDto,
    nullable: true,
    description:
      'Nombre del asesor relacionado mediante asesor_id; no expone datos de su cuenta.',
  })
  usuarios: AsesorDirectorioRespuestaDto | null;

  @ApiProperty({
    type: [ContratoServicioDirectorioRespuestaDto],
    description:
      'Servicios de todos los contratos del cliente. No representa el estado operativo del cliente.',
  })
  contratos: ContratoServicioDirectorioRespuestaDto[];
}

export class ClientesDirectorioPaginadoRespuestaDto {
  @ApiProperty({ type: [ClienteDirectorioRespuestaDto] })
  data: ClienteDirectorioRespuestaDto[];

  @ApiProperty({ type: PaginacionRespuestaDto })
  pagination: PaginacionRespuestaDto;
}
