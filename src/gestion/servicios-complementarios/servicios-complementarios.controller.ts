import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBadRequestResponse, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { pipeline } from 'node:stream/promises';
import type { Response } from 'express';
import { CurrentUser as User } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../roles/decorators/roles.decorator';
import { RolesGuard } from '../../roles/guards/roles.guard';
import type { CurrentUser } from '../gestion-auxiliares/gestion-auxiliares.service';
import { BajaSolicitudDto, CambiarServicioDto, CrearAlertaDto, CrearSolicitudDto, CrearSolicitudPersonalizadaDto, QuerySolicitudesDto, SeguimientoDto, VincularDocumentoDto } from './dto/servicios-complementarios.dto';
import { ServiciosComplementariosService } from './servicios-complementarios.service';

@Controller('gestion/servicios-complementarios')
@UseGuards(JwtAuthGuard, RolesGuard) @Roles('asesor')
@ApiTags('Servicios complementarios') @ApiBearerAuth('jwt')
@ApiUnauthorizedResponse({ description: 'JWT requerido o inválido.' })
@ApiForbiddenResponse({ description: 'Rol sin permiso.' })
@ApiNotFoundResponse({ description: 'Recurso inexistente o fuera del alcance.' })
@ApiBadRequestResponse({ description: 'Entrada, fecha, servicio o confirmación inválidos.' })
@ApiConflictResponse({ description: 'Exclusividad, historial o catálogo incompatible.' })
export class ServiciosComplementariosController {
  constructor(private readonly service: ServiciosComplementariosService) {}
  @Get('catalogos') @ApiOperation({ summary: 'RF-41/49: servicios y estados reconocidos' })
  catalogos(@User() u: CurrentUser) { return this.service.catalogos(u); }
  @Get('clientes-disponibles') @ApiOperation({ summary: 'RF-40/47: clientes propios sin solicitud activa' })
  disponibles(@Query() q: QuerySolicitudesDto, @User() u: CurrentUser) { return this.service.disponibles(u, q); }
  @Get('solicitudes') @ApiOperation({ summary: 'RF-44: listado paginado y filtrado' })
  listar(@Query() q: QuerySolicitudesDto, @User() u: CurrentUser) { return this.service.listar(q, u); }
  @Post('solicitudes') @ApiOperation({ summary: 'RF-40/47: crear solicitud' })
  crear(@Body() dto: CrearSolicitudDto, @User() u: CurrentUser) { return this.service.crear(dto, u); }
  @Post('solicitudes/servicio-personalizado') @ApiOperation({ summary: 'RF-42: registrar servicio personalizado y solicitud atómicamente' })
  crearPersonalizado(@Body() dto: CrearSolicitudPersonalizadaDto, @User() u: CurrentUser) { return this.service.crearPersonalizado(dto, u); }
  @Get('solicitudes/:id') @ApiOperation({ summary: 'RF-43/44: detalle' })
  detalle(@Param('id', ParseUUIDPipe) id: string, @User() u: CurrentUser) { return this.service.detalle(id, u); }
  @Patch('solicitudes/:id/seguimiento') @ApiOperation({ summary: 'RF-45/49/53: actualizar seguimiento' })
  seguimiento(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SeguimientoDto, @User() u: CurrentUser) { return this.service.seguimiento(id, dto, u); }
  @Post('solicitudes/:id/cambio-servicio') @HttpCode(200) @ApiOperation({ summary: 'RF-48: cambiar servicio con confirmación', description: 'La interfaz debe mostrar: ¿Deseas cambiar el servicio complementario? Esta acción reiniciará la información de seguimiento del servicio actual. Los documentos almacenados en el expediente digital del cliente se conservarán y no serán eliminados. Cancelar no debe enviar la operación; confirmar requiere confirmar: true.' })
  cambiar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CambiarServicioDto, @User() u: CurrentUser) { return this.service.cambiar(id, dto, u); }
  @Patch('solicitudes/:id/baja') @ApiOperation({ summary: 'RF-46: baja del seguimiento activo', description: 'Advertir que el cliente dejará el seguimiento activo. Requiere confirmar: true y conserva su expediente e historial.' })
  @ApiOkResponse({ description: 'Trámite cancelado con último avance y relaciones conservadas.' })
  baja(@Param('id', ParseUUIDPipe) id: string, @Body() dto: BajaSolicitudDto, @User() u: CurrentUser) { return this.service.baja(id, dto, u); }
  @Get('solicitudes/:id/documentos') @ApiOperation({ summary: 'RF-50: documentos vinculados' })
  documentos(@Param('id', ParseUUIDPipe) id: string, @User() u: CurrentUser) { return this.service.documentos(id, u); }
  @Post('solicitudes/:id/documentos') @ApiOperation({ summary: 'RF-50: vincular documento existente del expediente' })
  vincular(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VincularDocumentoDto, @User() u: CurrentUser) { return this.service.vincular(id, dto.documento_id, u); }
  @Delete('solicitudes/:id/documentos/:documentoId') @HttpCode(204) @ApiOperation({ summary: 'RF-50: desvincular sin eliminar el documento' })
  desvincular(@Param('id', ParseUUIDPipe) id: string, @Param('documentoId', ParseUUIDPipe) doc: string, @User() u: CurrentUser) { return this.service.desvincular(id, doc, u); }
  @Get('solicitudes/:id/documentos/:documentoId/descargar') @ApiOperation({ summary: 'RF-50: descargar documento vinculado' })
  async descargar(@Param('id', ParseUUIDPipe) id: string, @Param('documentoId', ParseUUIDPipe) doc: string, @User() u: CurrentUser, @Res() response: Response) {
    const { file, filename, contentType } = await this.service.descargar(id, doc, u);
    response.setHeader('Content-Type', contentType); response.setHeader('X-Content-Type-Options', 'nosniff'); response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16))}`);
    await pipeline(file.stream, response);
  }
  @Get('solicitudes/:id/agenda') @ApiOperation({ summary: 'RF-51: eventos relacionados mediante avisos' })
  agenda(@Param('id', ParseUUIDPipe) id: string, @User() u: CurrentUser) { return this.service.agenda(id, u); }
  @Post('solicitudes/:id/alertas') @ApiOperation({ summary: 'RF-52: registrar alerta y actividad vinculadas' })
  @ApiCreatedResponse({ description: '{ id, aviso: { id, tipo, fecha_alerta, atendido, eventos_agenda: { id, fecha, hora, motivo, estatus } } }' })
  alerta(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CrearAlertaDto, @User() u: CurrentUser) { return this.service.alerta(id, dto, u); }
}
