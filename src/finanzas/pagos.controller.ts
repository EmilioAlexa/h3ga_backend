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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../roles/decorators/roles.decorator';
import { RolesGuard } from '../roles/guards/roles.guard';
import {
  PagoHistorialRespuestaDto,
  PagoRespuestaDto,
  PagosPaginadosRespuestaDto,
} from '../openapi/response-models.dto';
import { ChangeEstadoPagoDto } from './dto/change-estado-pago.dto';
import { CreatePagoDto } from './dto/create-pago.dto';
import { QueryPagosDto } from './dto/query-pagos.dto';
import { PagosService } from './pagos.service';

interface UsuarioAutenticado {
  id: string;
  activo: boolean;
  roles: { nombre: string };
}

@Controller('finanzas/pagos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador', 'administrador financiero', 'asesor')
@ApiTags('Finanzas — Pagos')
@ApiBearerAuth('jwt')
export class PagosController {
  constructor(private readonly pagosService: PagosService) {}

  @Get()
  @ApiOperation({
    summary: 'Consultar pagos',
    description:
      'Lista paginada con filtros. El asesor solo recibe pagos de contratos cuyo contratos.asesor_id coincide con su sesión; administración consulta el conjunto autorizado.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'contrato_id', required: false, type: String })
  @ApiQuery({ name: 'cliente_id', required: false, type: String })
  @ApiQuery({
    name: 'asesor_id',
    required: false,
    type: String,
    description: 'Filtro administrativo; se ignora en el rol asesor.',
  })
  @ApiQuery({ name: 'estado_pago_id', required: false, type: Number })
  @ApiQuery({ name: 'forma_pago_id', required: false, type: Number })
  @ApiQuery({
    name: 'fecha_desde',
    required: false,
    type: String,
    format: 'date-time',
  })
  @ApiQuery({
    name: 'fecha_hasta',
    required: false,
    type: String,
    format: 'date-time',
  })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiOkResponse({ type: PagosPaginadosRespuestaDto })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'El rol no tiene acceso a pagos.' })
  @ApiBadRequestResponse({
    description: 'Filtros inválidos o rango de fechas invertido.',
  })
  findAll(
    @Query() query: QueryPagosDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.pagosService.findAll(query, usuario);
  }

  @Get(':id/historial')
  @ApiOperation({
    summary: 'Consultar historial de estados de un pago',
    description:
      'El asesor solo consulta el historial de pagos de sus contratos.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: [PagoHistorialRespuestaDto] })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'El rol no tiene acceso al pago.' })
  @ApiNotFoundResponse({
    description: 'Pago inexistente o fuera del alcance del asesor.',
  })
  @ApiBadRequestResponse({ description: 'El identificador no es UUID válido.' })
  findHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.pagosService.findHistory(id, usuario);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Consultar un pago por UUID',
    description:
      'Devuelve datos relacionados mínimos, sin exponer rutas privadas de evidencias.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: PagoRespuestaDto })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'El rol no tiene acceso al pago.' })
  @ApiNotFoundResponse({
    description: 'Pago inexistente o fuera del alcance del asesor.',
  })
  @ApiBadRequestResponse({ description: 'El identificador no es UUID válido.' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.pagosService.findOne(id, usuario);
  }

  @Post()
  @ApiOperation({
    summary: 'Registrar un pago',
    description:
      'Asesores, administradores financieros y administradores pueden registrar pagos. El usuario registrado_por se obtiene del JWT; el estado inicial siempre es Pendiente de revisión financiera. Para efectivo se requiere folio de recibo y usuario receptor activo.',
  })
  @ApiCreatedResponse({ type: PagoRespuestaDto })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'El rol no puede registrar pagos.' })
  @ApiBadRequestResponse({
    description: 'Importe, referencias o datos de pago inválidos.',
  })
  @ApiConflictResponse({
    description: 'Falta configurar el estado inicial del pago.',
  })
  create(
    @Body() dto: CreatePagoDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.pagosService.create(dto, usuario);
  }

  @Patch(':id/estado')
  @Roles('administrador', 'administrador financiero')
  @ApiOperation({
    summary: 'Revisar, rechazar, enviar a autorización o validar un pago',
    description:
      'Administración financiera: desde Pendiente de revisión financiera puede rechazar o enviar a Pendiente de autorización. Administración: desde el estado inicial puede rechazar o validar directamente; desde Pendiente de autorización puede rechazar o validar. Aprobar requiere evidencia tipificada correspondiente al método. Cada transición queda auditada.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: PagoRespuestaDto })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({
    description: 'Solo administración puede cambiar estados.',
  })
  @ApiNotFoundResponse({ description: 'Pago no encontrado.' })
  @ApiBadRequestResponse({
    description: 'Transición no permitida o evidencia requerida ausente.',
  })
  @ApiConflictResponse({
    description: 'Estado, catálogo o historial inconsistente.',
  })
  changeState(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeEstadoPagoDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.pagosService.changeState(id, dto, usuario);
  }
}
