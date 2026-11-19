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
import { CancelPagoProgramadoDto } from './dto/cancel-pago-programado.dto';
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
      'Filtros por contrato, tipo, estado operativo calculado y fecha esperada. El asesor solo ve programaciones de contratos asignados mediante contratos.asesor_id. El filtro estado_id se aplica antes de paginar; estado_operativo puede ser null para datos históricos incompletos o anomalías.',
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
  @ApiOperation({ summary: 'Consultar pago programado por UUID', description: 'Incluye suma Decimal de abonos Validados y saldo confirmado nullable. Si hay sobrepago, cancelación o importe desconocido, se devuelve motivo técnico en vez de saldo negativo.' })
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
      'No crea un pago real. Exige fecha_vencimiento. Asesores solo pueden asociarla a contratos propios. El tipo Penalización exige contrato APD, monto, fecha esperada y motivo particular. Coincidencias de contrato/fecha/importe requieren justificación.',
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
      'Asesores solo pueden actualizar programaciones de contratos propios. El contrato no se puede cambiar; no se puede retirar la fecha límite ni alterar una obligación con abonos Validados. Una coincidencia nueva exige justificación.',
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

  @Patch(':id/cancelar')
  @Roles('administrador', 'administrador financiero')
  @ApiOperation({
    summary: 'Cancelar una obligación sin pagos vinculados',
    description: 'Bloquea la programación, rechaza cualquier pago vinculado sin importar su estado y conserva actor, fecha y motivo. No elimina la obligación ni permite reactivación.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: PagoProgramadoRespuestaDto })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'Solo administrador o administrador financiero activos pueden cancelar.' })
  @ApiNotFoundResponse({ description: 'Obligación no encontrada.' })
  @ApiBadRequestResponse({ description: 'Motivo ausente o inválido.' })
  @ApiConflictResponse({ description: 'Obligación cancelada o con cualquier pago vinculado.' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelPagoProgramadoDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.service.cancel(id, dto, usuario);
  }

  @Patch(':id/estado')
  @Roles('administrador', 'administrador financiero')
  @ApiOperation({
    summary: 'Ruta histórica de cambio de estado (deshabilitada)',
    description:
      'No acepta cambios arbitrarios por ID. Utilizar PATCH /:id/cancelar para cancelar con auditoría; devuelve 409 a administración y 403 a asesor.',
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
