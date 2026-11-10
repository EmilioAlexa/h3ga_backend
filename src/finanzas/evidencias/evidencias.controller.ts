import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiCreatedResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiBody,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../roles/decorators/roles.decorator';
import { RolesGuard } from '../../roles/guards/roles.guard';
import { EvidenciaPagoRespuestaDto } from './dto/evidencia-respuesta.dto';
import { UploadedEvidenceFile } from './evidence-file.validator';
import { EvidenciasService } from './evidencias.service';

interface AuthenticatedUser {
  id: string;
  activo: boolean;
  roles: { nombre: string };
}

@Controller('finanzas')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador', 'administrador financiero', 'asesor')
@ApiTags('Finanzas — Evidencias de pago')
@ApiBearerAuth('jwt')
export class EvidenciasController {
  constructor(private readonly service: EvidenciasService) {}

  @Post('pagos/:pagoId/evidencias')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Cargar una evidencia de pago',
    description:
      'El tipo de evidencia se deriva de la forma de pago. Asesores solo cargan evidencias de pagos de contratos propios. El archivo se almacena de forma privada.',
  })
  @ApiParam({ name: 'pagoId', format: 'uuid' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({ type: EvidenciaPagoRespuestaDto })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'El usuario no puede cargar evidencia.' })
  @ApiNotFoundResponse({ description: 'Pago inexistente o fuera del alcance.' })
  @ApiBadRequestResponse({ description: 'Archivo inválido, no permitido o demasiado grande.' })
  @ApiResponse({ status: 413, description: 'El archivo excede MAX_FILE_SIZE_MB.' })
  @ApiConflictResponse({ description: 'El tipo de evidencia requerido no está configurado.' })
  upload(
    @Param('pagoId', ParseUUIDPipe) pagoId: string,
    @UploadedFile() file: UploadedEvidenceFile | undefined,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.service.upload(pagoId, file, usuario);
  }

  @Get('pagos/:pagoId/evidencias')
  @ApiOperation({ summary: 'Listar evidencias asociadas a un pago' })
  @ApiParam({ name: 'pagoId', format: 'uuid' })
  @ApiOkResponse({ type: [EvidenciaPagoRespuestaDto] })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'El usuario no puede consultar evidencias.' })
  @ApiNotFoundResponse({ description: 'Pago inexistente o fuera del alcance.' })
  listForPayment(
    @Param('pagoId', ParseUUIDPipe) pagoId: string,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.service.findForPayment(pagoId, usuario);
  }

  @Get('evidencias/:evidenciaId/descargar')
  @ApiOperation({ summary: 'Descargar archivo de evidencia de forma autorizada' })
  @ApiParam({ name: 'evidenciaId', format: 'uuid' })
  @ApiOkResponse({
    description: 'Contenido binario con Content-Type, Content-Length y Content-Disposition.',
    content: {
      'application/pdf': { schema: { type: 'string', format: 'binary' } },
      'image/jpeg': { schema: { type: 'string', format: 'binary' } },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'El usuario no puede descargar esta evidencia.' })
  @ApiNotFoundResponse({ description: 'Evidencia o archivo no encontrado.' })
  async download(
    @Param('evidenciaId', ParseUUIDPipe) id: string,
    @CurrentUser() usuario: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.service.download(id, usuario);
    const name = result.metadata.nombre_original ?? 'evidencia';
    const encodedName = encodeURIComponent(name).replace(
      /['()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    response.setHeader('Content-Type', result.metadata.tipo_archivo ?? 'application/octet-stream');
    response.setHeader('Content-Length', result.object.size);
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', 'sandbox');
    return new StreamableFile(result.object.stream, { length: result.object.size });
  }

  @Get('evidencias/:evidenciaId')
  @ApiOperation({ summary: 'Consultar metadatos de una evidencia' })
  @ApiParam({ name: 'evidenciaId', format: 'uuid' })
  @ApiOkResponse({ type: EvidenciaPagoRespuestaDto })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'El usuario no puede consultar esta evidencia.' })
  @ApiNotFoundResponse({ description: 'Evidencia inexistente o fuera del alcance.' })
  findOne(
    @Param('evidenciaId', ParseUUIDPipe) id: string,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.service.findOne(id, usuario);
  }
}
