import { Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Put, Query, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiConflictResponse, ApiConsumes, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../roles/decorators/roles.decorator';
import { RolesGuard } from '../../roles/guards/roles.guard';
import { CreateReceptorDispersionDto } from './dto/create-receptor-dispersion.dto';
import { ConfirmarDispersionDto } from './dto/confirmar-dispersion.dto';
import { UploadedEvidenceFile } from '../evidencias/evidence-file.validator';
import { QueryComisionesDto, SaveConfiguracionDispersionDto } from './dto/save-configuracion-dispersion.dto';
import { ComisionesService } from './comisiones.service';

type UsuarioAutenticado = { id: string; activo: boolean; roles: { nombre: string } };

@ApiTags('Finanzas — Comisiones y dispersión')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador', 'administrador financiero', 'asesor')
@Controller('finanzas')
export class ComisionesController {
  constructor(private readonly service: ComisionesService) {}

  @Post('receptores-dispersion')
  @Roles('administrador', 'administrador financiero')
  @ApiOperation({ summary: 'Registrar receptor Asesor o nombre manual de Director, Gerente, Bróker y Otro', description: 'Referidor se obtiene por UUID del cliente relacionado y no admite receptor manual. Otro exige nombre o descripción. IMSS y Empresa no usan receptor individual.' })
  createReceiver(@Body() dto: CreateReceptorDispersionDto, @CurrentUser() user: UsuarioAutenticado) { return this.service.createReceptor(dto, user); }

  @Get('receptores-dispersion')
  @Roles('administrador', 'administrador financiero')
  listReceivers(@Query('concepto_id', new ParseIntPipe({ optional: true })) conceptId: number | undefined, @CurrentUser() user: UsuarioAutenticado) { return this.service.listReceptores(conceptId, user); }

  @Patch('receptores-dispersion/:id/desactivar')
  @Roles('administrador', 'administrador financiero')
  deactivateReceiver(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UsuarioAutenticado) { return this.service.deactivateReceptor(id, user); }

  @Get('contratos/:id/comisiones')
  @Roles('administrador', 'administrador financiero')
  getConfig(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UsuarioAutenticado) { return this.service.getConfiguracion(id, user); }

  @Put('contratos/:id/comisiones')
  @Roles('administrador', 'administrador financiero')
  @ApiOperation({ summary: 'Guardar porcentajes por contrato', description: 'Porcentajes Decimal de 0 a 100 en pasos de 0.5. Asesor exige receptor contractual; Director, Gerente y Bróker admiten nombre manual opcional. Referidor se toma del cliente titular por UUID y no acepta receptor arbitrario. Otro exige receptor manual con nombre no vacío. M10, M40 y M40R exigen IMSS positivo sin receptor; APD lo rechaza. Solo afecta pagos futuros.' })
  @ApiOkResponse({ description: 'Configuración activa con valores Decimal serializados como string.' })
  @ApiBadRequestResponse({ description: 'Porcentaje, suma, concepto o receptor incompatibles.' })
  @ApiConflictResponse({ description: 'Cliente sin referidor verificable o configuración no segura.' })
  @ApiUnauthorizedResponse({ description: 'Falta JWT válido.' })
  @ApiForbiddenResponse({ description: 'Solo administración puede editar la configuración.' })
  @ApiNotFoundResponse({ description: 'Contrato inexistente.' })
  saveConfig(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveConfiguracionDispersionDto, @CurrentUser() user: UsuarioAutenticado) { return this.service.saveConfiguracion(id, dto, user); }

  @Get('contratos/:id/comisiones/historial')
  @Roles('administrador', 'administrador financiero')
  configHistory(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UsuarioAutenticado) { return this.service.historyConfiguracion(id, user); }

  @Get('comisiones')
  @ApiOperation({ summary: 'Consultar snapshots de comisiones', description: 'El asesor solo obtiene su concepto Asesor y contratos propios; contrato_id se aplica junto con el aislamiento. Los importes Decimal salen como string y las fechas como ISO.' })
  @ApiOkResponse({ description: '{data, page, limit, total}; cada fila incluye pago, folio contractual, concepto y estado.' })
  @ApiUnauthorizedResponse({ description: 'Falta JWT válido.' })
  @ApiForbiddenResponse({ description: 'El rol no tiene acceso financiero.' })
  list(@Query() query: QueryComisionesDto, @CurrentUser() user: UsuarioAutenticado) { return this.service.findComisiones(query, user); }

  @Put('comisiones/:id/dispersar')
  @Roles('administrador', 'administrador financiero')
  @UseInterceptors(FileInterceptor('file', { limits: { fields: 2, parts: 3 } }))
  @ApiOperation({ summary: 'Confirmar dispersión total de una comisión Asesor', description: 'Exige referencia real, clave idempotente y comprobante privado PDF/JPEG. Un reintento idéntico devuelve la operación original. La comisión, el registro y el historial cambian en una transacción.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['idempotency_key', 'referencia_transferencia', 'file'], properties: {
    idempotency_key: { type: 'string', format: 'uuid' }, referencia_transferencia: { type: 'string', maxLength: 120 }, file: { type: 'string', format: 'binary' },
  } } })
  @ApiOkResponse({ description: 'ID estable de dispersión, referencia, hash, tamaño, monto confirmado y fecha ISO; sin ruta privada.' })
  @ApiBadRequestResponse({ description: 'Referencia, clave o archivo inválidos.' })
  @ApiResponse({ status: 413, description: 'Comprobante demasiado grande.' })
  @ApiConflictResponse({ description: 'Clave reutilizada con datos distintos, comisión ya dispersada, origen o receptor no elegible.' })
  @ApiUnauthorizedResponse({ description: 'Falta JWT válido.' })
  @ApiForbiddenResponse({ description: 'Solo administración puede confirmar.' })
  @ApiNotFoundResponse({ description: 'Comisión inexistente.' })
  disperse(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmarDispersionDto, @UploadedFile() file: UploadedEvidenceFile | undefined, @CurrentUser() user: UsuarioAutenticado) { return this.service.disperse(id, dto, file, user); }

  @Get('dispersiones-comision/:id/comprobante')
  @Roles('administrador', 'administrador financiero')
  @ApiOperation({ summary: 'Descargar comprobante privado de dispersión', description: 'Solo administración; nunca expone la clave de almacenamiento.' })
  @ApiOkResponse({ description: 'Archivo PDF o JPEG privado.' })
  @ApiUnauthorizedResponse({ description: 'Falta JWT válido.' })
  @ApiForbiddenResponse({ description: 'Solo administración puede descargar.' })
  @ApiNotFoundResponse({ description: 'Dispersión o archivo inexistente.' })
  async downloadDisbursementProof(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UsuarioAutenticado, @Res({ passthrough: true }) response: Response) {
    const proof = await this.service.downloadDisbursementProof(id, user);
    response.setHeader('Content-Type', proof.contentType);
    response.setHeader('Content-Length', proof.object.size);
    response.setHeader('Content-Disposition', `attachment; filename="${proof.fileName}"`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', 'sandbox');
    return new StreamableFile(proof.object.stream, { length: proof.object.size });
  }
}
