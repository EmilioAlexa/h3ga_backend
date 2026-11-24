import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiConflictResponse, ApiConsumes, ApiCreatedResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiPayloadTooLargeResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { pipeline } from 'node:stream/promises';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser as CurrentUserDecorator } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../roles/decorators/roles.decorator';
import { RolesGuard } from '../../roles/guards/roles.guard';
import type { CurrentUser } from '../gestion-auxiliares/gestion-auxiliares.service';
import { CreateEnvioDto } from './dto/create-envio.dto';
import { GestionDocumentalService } from './gestion-documental.service';
import { CargarDocumentoDto, MetadatosDocumentoDto, QueryDocumentosDto } from './dto/documento-expediente.dto';
import { LIMITE_DOCUMENTO } from './documento-expediente.validator';

@Controller('gestion/documental')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('Gestión documental')
@ApiBearerAuth('jwt')
@ApiUnauthorizedResponse({ description: 'JWT requerido.' })
@ApiForbiddenResponse({ description: 'Rol sin permiso o auxiliar sin asignación activa.' })
@ApiNotFoundResponse({ description: 'Recurso inexistente o fuera del alcance.' })
@ApiBadRequestResponse({ description: 'DTO, tipo de documento o archivo inválido.' })
@ApiConflictResponse({ description: 'Estado, referencia documental o asociación incompatible.' })
export class GestionDocumentalController {
  constructor(private readonly service: GestionDocumentalService) {}

  @Get('tareas') @Roles('auxiliar administrativo')
  findTareas(@CurrentUserDecorator() user: CurrentUser) { return this.service.findTareas(user); }

  @Get('clientes/:clienteId/expediente') @Roles('asesor', 'auxiliar administrativo')
  findExpediente(@Param('clienteId', ParseUUIDPipe) clienteId: string, @CurrentUserDecorator() user: CurrentUser) { return this.service.findExpediente(clienteId, user); }

  @Get('clientes/:clienteId/documentos') @Roles('asesor', 'auxiliar administrativo')
  @ApiOperation({ summary: 'RF-27 — Expediente autorizado; filtro opcional por etapa existente' })
  @ApiOkResponse({ description: 'Metadatos, etapa_tramite_id, general y modalidad verificable; sin archivo_path.' })
  findDocumentos(@Param('clienteId', ParseUUIDPipe) clienteId: string, @CurrentUserDecorator() user: CurrentUser, @Query() query: QueryDocumentosDto) { return this.service.findDocumentos(clienteId, user, query); }

  @Post('clientes/:clienteId/documentos') @Roles('asesor')
  @ApiOperation({ summary: 'RF-28 — Incorporar documento general o de modalidad seleccionada' })
  @UseInterceptors(FileInterceptor('archivo', { storage: memoryStorage(), limits: { fileSize: LIMITE_DOCUMENTO } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['archivo', 'tipo_documento_id'], properties: { archivo: { type: 'string', format: 'binary' }, tipo_documento_id: { type: 'integer' }, etapa_tramite_id: { type: 'string', format: 'uuid' }, observaciones: { type: 'string', maxLength: 4000 }, numero_referencia: { type: 'string', maxLength: 200 } } } })
  @ApiCreatedResponse({ description: 'Metadatos del documento creado, sin rutas internas.' })
  @ApiPayloadTooLargeResponse({ description: 'Máximo 10 MiB.' })
  cargarDocumento(@Param('clienteId', ParseUUIDPipe) clienteId: string, @Body() dto: CargarDocumentoDto, @UploadedFile() file: Express.Multer.File | undefined, @CurrentUserDecorator() user: CurrentUser) { return this.service.cargarDocumento(clienteId, dto, file, user); }

  @Patch('documentos/:documentoId') @Roles('asesor')
  @ApiOperation({ summary: 'Metadatos de documentos no confirmados ni referenciados; no reemplaza archivos' })
  @ApiOkResponse({ description: 'Metadatos actualizados; solo observaciones y numero_referencia.' })
  actualizarMetadatos(@Param('documentoId', ParseUUIDPipe) id: string, @Body() dto: MetadatosDocumentoDto, @CurrentUserDecorator() user: CurrentUser) { return this.service.actualizarMetadatos(id, dto, user); }

  @Get('documentos/:documentoId/visualizar') @Roles('asesor', 'auxiliar administrativo')
  @ApiOperation({ summary: 'RF-27 — Visualizar PDF/imagen; Word se descarga' })
  @ApiOkResponse({ description: 'Contenido binario con MIME y nombre original.' })
  visualizarDocumento(@Param('documentoId', ParseUUIDPipe) id: string, @CurrentUserDecorator() user: CurrentUser, @Res() response: Response) { return this.entregarDocumento(id, user, response, true); }

  @Get('documentos/:documentoId/descargar') @Roles('asesor', 'auxiliar administrativo')
  @ApiOperation({ summary: 'RF-27 — Descargar documento del expediente autorizado' })
  @ApiOkResponse({ description: 'Contenido binario; Content-Disposition attachment.' })
  descargarDocumento(@Param('documentoId', ParseUUIDPipe) id: string, @CurrentUserDecorator() user: CurrentUser, @Res() response: Response) { return this.entregarDocumento(id, user, response, false); }

  private async entregarDocumento(id: string, user: CurrentUser, response: Response, visualizar: boolean) {
    const { file, filename, contentType } = await this.service.obtenerDocumento(id, user);
    const inline = visualizar && ['application/pdf', 'image/jpeg', 'image/png'].includes(contentType);
    response.setHeader('Content-Type', contentType);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16))}`);
    await pipeline(file.stream, response);
  }

  @Post('envios') @Roles('auxiliar administrativo')
  createEnvio(@Body() dto: CreateEnvioDto, @CurrentUserDecorator() user: CurrentUser) { return this.service.createEnvio(dto, user); }

  @Post('envios/:id/versiones') @Roles('auxiliar administrativo')
  @UseInterceptors(FileInterceptor('archivo', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['archivo'], properties: { archivo: { type: 'string', format: 'binary' } } } })
  addVersion(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File | undefined, @CurrentUserDecorator() user: CurrentUser) {
    if (!file) throw new BadRequestException('Se requiere un archivo');
    return this.service.addVersion(id, file, user);
  }

  @Get('envios/:id/versiones') @Roles('asesor', 'auxiliar administrativo')
  findVersiones(@Param('id', ParseUUIDPipe) id: string, @CurrentUserDecorator() user: CurrentUser) { return this.service.findVersiones(id, user); }

  @Get('versiones/:id/descargar') @Roles('asesor', 'auxiliar administrativo')
  async download(@Param('id', ParseUUIDPipe) id: string, @CurrentUserDecorator() user: CurrentUser, @Res() response: Response) {
    const { file, filename, contentType } = await this.service.downloadVersion(id, user);
    response.setHeader('Content-Type', contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    file.stream.pipe(response);
  }
}
