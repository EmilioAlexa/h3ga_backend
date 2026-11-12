import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../roles/decorators/roles.decorator';
import { RolesGuard } from '../../roles/guards/roles.guard';
import {
  PagoProgramadoRespuestaDto,
  PagosProgramadosPaginadosRespuestaDto,
} from '../../openapi/response-models.dto';
import { ChangeEstadoPagoProgramadoDto } from './dto/change-estado-pago-programado.dto';
import { CreatePagoProgramadoDto } from './dto/create-pago-programado.dto';
import { QueryPagosProgramadosDto } from './dto/query-pagos-programados.dto';
import { UpdatePagoProgramadoDto } from './dto/update-pago-programado.dto';
import { PagosProgramadosService } from './pagos-programados.service';

interface UsuarioAutenticado {
  id: string;
  activo: boolean;
  roles: { nombre: string };
}

@Controller('finanzas/pagos-programados')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador', 'administrador financiero', 'asesor')
@ApiTags('Finanzas — Pagos programados')
@ApiBearerAuth('jwt')
export class PagosProgramadosController {
  constructor(private readonly service: PagosProgramadosService) {}

  @Get()
  @ApiOperation({
    summary: 'Consultar pagos programados',
    description:
      'Filtros por contrato, tipo, estado y fecha esperada. El asesor solo ve programaciones de contratos asignados mediante contratos.asesor_id.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'contrato_id', required: false, type: String })
  @ApiQuery({ name: 'tipo_cobro_id', required: false, type: Number })
  @ApiQuery({ name: 'estado_id', required: false, type: Number })
  @ApiQuery({ name: 'fecha_desde', required: false, type: String, format: 'date' })
  @ApiQuery({ name: 'fecha_hasta', required: false, type: String, format: 'date' })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiOkResponse({ type: PagosProgramadosPaginadosRespuestaDto })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'El rol no tiene acceso.' })
  @ApiBadRequestResponse({ description: 'Filtros inválidos o rango invertido.' })
  findAll(
    @Query() query: QueryPagosProgramadosDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.service.findAll(query, usuario);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar pago programado por UUID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: PagoProgramadoRespuestaDto })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'El rol no tiene acceso.' })
  @ApiNotFoundResponse({ description: 'No existe o queda fuera del alcance.' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.service.findOne(id, usuario);
  }

  @Post()
  @ApiOperation({
    summary: 'Registrar una programación de cobro',
    description:
      'No crea un pago real. Asesores solo pueden asociarla a contratos propios. El estado puede asignarlo administración mediante PATCH /:id/estado.',
  })
  @ApiCreatedResponse({ type: PagoProgramadoRespuestaDto })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'El rol no puede crear.' })
  @ApiBadRequestResponse({ description: 'Contrato, tipo o importe inválido.' })
  create(
    @Body() dto: CreatePagoProgramadoDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.service.create(dto, usuario);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar datos de una programación',
    description:
      'Asesores solo pueden actualizar programaciones de contratos propios. El contrato no se puede cambiar; el estado usa una ruta administrativa separada.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: PagoProgramadoRespuestaDto })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'El rol no puede actualizar.' })
  @ApiNotFoundResponse({ description: 'Programación no encontrada.' })
  @ApiBadRequestResponse({ description: 'Cuerpo vacío o datos inválidos.' })
  @ApiConflictResponse({ description: 'Conflicto con relaciones existentes.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePagoProgramadoDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.service.update(id, dto, usuario);
  }

  @Patch(':id/estado')
  @Roles('administrador', 'administrador financiero')
  @ApiOperation({
    summary: 'Asignar un estado de catálogo a la programación',
    description:
      'Solo administración cambia el estado. Se acepta un estado existente en estados_pago_programado; el esquema no tiene historial ni catálogo de transiciones para pagos programados.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: PagoProgramadoRespuestaDto })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'Solo administración puede cambiar estado.' })
  @ApiNotFoundResponse({ description: 'Programación no encontrada.' })
  @ApiBadRequestResponse({ description: 'El estado no existe.' })
  changeState(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeEstadoPagoProgramadoDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.service.changeState(id, dto, usuario);
  }
}
