import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../roles/decorators/roles.decorator';
import { RolesGuard } from '../../roles/guards/roles.guard';
import { ActualizarModalidadDto, GuardarModalidadesDto, QueryModalidadesAgendaDto, QueryModalidadesClientesDto } from './dto/modalidades.dto';
import { MODALIDADES } from './modalidades.rules';
import type { UsuarioModalidades } from './modalidades.rules';
import { ModalidadesService } from './modalidades.service';
import { agendaSchema, alertasSchema, aplicacionSchema, catalogosSchema, clientesSchema, detalleClienteSchema, detalleModalidadSchema, indicadoresSchema, seguimientoSchema } from './modalidades.openapi';

@Controller('gestion/modalidades')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('asesor')
@ApiTags('Gestión — Modalidades de Pensión')
@ApiBearerAuth('jwt')
@ApiUnauthorizedResponse({ description: 'JWT ausente, inválido, expirado o usuario inactivo.' })
@ApiForbiddenResponse({ description: 'Rol distinto de asesor.' })
@ApiNotFoundResponse({ description: 'Cliente fuera del alcance o modalidad no seleccionada.' })
@ApiBadRequestResponse({ description: 'Entrada inválida, combinación prohibida o catálogo incompatible.' })
@ApiConflictResponse({ description: 'Datos inconsistentes, catálogo incompleto o política pendiente.' })
export class ModalidadesController {
  constructor(private readonly service: ModalidadesService) {}

  @Get('clientes') @ApiOperation({ summary: 'RF-19/29 — Clientes propios con modalidades, búsqueda y filtros' })
  @ApiOkResponse({ schema: clientesSchema, description: '{ data: clientes con seguimiento independiente e históricos, pagination: { page, limit, total, totalPages } }' })
  clientes(@Query() q: QueryModalidadesClientesDto, @CurrentUser() u: UsuarioModalidades) { return this.service.findClientes(q, u); }

  @Get('catalogos') @ApiOperation({ summary: 'RF-18/22 — Cinco fases y estatus compatibles; Concluido usa Finalizado' })
  @ApiOkResponse({ schema: catalogosSchema, description: '{ fases: [{id,nombre,orden}], estatus: catálogo con etiqueta y terminal }' })
  catalogos(@CurrentUser() u: UsuarioModalidades) { return this.service.catalogos(u); }

  @Get('agenda') @ApiOperation({ summary: 'RF-25 — Eventos, compromisos y citas IMSS del asesor' })
  @ApiOkResponse({ schema: agendaSchema, description: '{ zona_horaria, eventos, compromisos, citas_imss }; eventos sin atribución a modalidad.' })
  agenda(@Query() q: QueryModalidadesAgendaDto, @CurrentUser() u: UsuarioModalidades) { return this.service.agenda(q, u); }

  @Get('alertas') @ApiOperation({ summary: 'RF-26 — Avisos existentes y clasificación de fechas; sin umbral inventado' })
  @ApiOkResponse({ schema: alertasSchema, description: 'Agenda más { avisos: avisos no atendidos con vigente, umbral_proximidad_dias: null }' })
  alertas(@Query() q: QueryModalidadesAgendaDto, @CurrentUser() u: UsuarioModalidades) { return this.service.alertas(q, u); }

  @Get('indicadores') @ApiOperation({ summary: 'RF-30 — Clientes únicos, modalidades, estatus y compromisos' })
  @ApiOkResponse({ schema: indicadoresSchema, description: '{ total_clientes, por_modalidad, estrategias_mixtas, por_estatus, modalidades_concluidas, citas_futuras, citas_vencidas, compromisos_pendientes, compromisos_vencidos, umbral_proximidad_dias }' })
  indicadores(@CurrentUser() u: UsuarioModalidades) { return this.service.indicadores(u); }

  @Get('clientes/:clienteId') @ApiOperation({ summary: 'RF-20/27 — Resumen del cliente propio y expediente' })
  @ApiOkResponse({ schema: detalleClienteSchema, description: '{ cliente, seguimiento, agenda, documentos }; sin rutas internas.' })
  cliente(@Param('clienteId', ParseUUIDPipe) id: string, @CurrentUser() u: UsuarioModalidades) { return this.service.findCliente(id, u); }

  @Get('clientes/:clienteId/agenda') @ApiOperation({ summary: 'RF-25 — Citas y compromisos del cliente propio' })
  @ApiOkResponse({ schema: agendaSchema, description: '{ zona_horaria, eventos, compromisos, citas_imss }' })
  agendaCliente(@Param('clienteId', ParseUUIDPipe) id: string, @Query() q: QueryModalidadesAgendaDto, @CurrentUser() u: UsuarioModalidades) { return this.service.agenda({ ...q, cliente_id: id }, u); }

  @Get('clientes/:clienteId/modalidades') @ApiOperation({ summary: 'RF-17/20 — Selección, seguimiento y valores históricos separados' })
  @ApiOkResponse({ schema: { ...aplicacionSchema, nullable: true }, description: 'Aplicación con modalidades individuales y valores_historicos_compartidos; null si todavía no existe.' })
  modalidades(@Param('clienteId', ParseUUIDPipe) id: string, @CurrentUser() u: UsuarioModalidades) { return this.service.findModalidades(id, u); }

  @Put('clientes/:clienteId/modalidades') @ApiOperation({ summary: 'RF-17/21 — Registrar o ampliar selección; bloqueo transaccional por cliente' })
  @ApiOkResponse({ schema: aplicacionSchema, description: 'Aplicación y seguimientos. Repetir la misma selección no modifica fechas. Retirar una modalidad devuelve 409.' })
  guardar(@Param('clienteId', ParseUUIDPipe) id: string, @Body() dto: GuardarModalidadesDto, @CurrentUser() u: UsuarioModalidades) { return this.service.guardar(id, dto, u); }

  @Get('clientes/:clienteId/modalidades/:modalidad') @ApiOperation({ summary: 'RF-18/20/23/24 — Formulario específico, diagnóstico de referencia y etapa existente' })
  @ApiParam({ name: 'modalidad', enum: [...MODALIDADES] })
  @ApiOkResponse({ schema: detalleModalidadSchema, description: '{ cliente, seguimiento, diagnostico_referencia, etapa_referencia, valores_historicos_compartidos, limitaciones }; no calcula cuotas ni porcentajes.' })
  modalidad(@Param('clienteId', ParseUUIDPipe) id: string, @Param('modalidad') m: string, @CurrentUser() u: UsuarioModalidades) { return this.service.findModalidad(id, m, u); }

  @Patch('clientes/:clienteId/modalidades/:modalidad') @ApiOperation({ summary: 'RF-22/24 — Fase, estatus, cita y salario de una sola modalidad' })
  @ApiParam({ name: 'modalidad', enum: [...MODALIDADES] })
  @ApiOkResponse({ schema: seguimientoSchema, description: 'Seguimiento individual actualizado. Mantiene intactos los valores de las otras modalidades y los campos históricos compartidos.' })
  actualizar(@Param('clienteId', ParseUUIDPipe) id: string, @Param('modalidad') m: string, @Body() dto: ActualizarModalidadDto, @CurrentUser() u: UsuarioModalidades) { return this.service.actualizar(id, m, dto, u); }
}
