import { ApiTags, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import {
  Body,
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
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { IsUUID } from 'class-validator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { RolesGuard } from '../../../roles/guards/roles.guard';
import { Roles } from '../../../roles/decorators/roles.decorator';
import { UploadedEvidenceFile } from '../../evidencias/evidence-file.validator';
import { ContractDocumentsService } from './contract-documents.service';
class UploadContractDocumentDto {
  @IsUUID() solicitud_id: string;
}
@ApiTags('Documentos contractuales')
@ApiBearerAuth('jwt')
@Controller('finanzas/contratos/:contratoId/documentos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador', 'administrador financiero', 'asesor')
export class ContractDocumentsController {
  constructor(private readonly service: ContractDocumentsService) {}
  @Get() list(
    @Param('contratoId', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    return this.service.list(id, user);
  }
  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['solicitud_id', 'file'],
      properties: {
        solicitud_id: { type: 'string', format: 'uuid' },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10485760, files: 1, fields: 1, parts: 2 },
    }),
  )
  upload(
    @Param('contratoId', ParseUUIDPipe) id: string,
    @Body() dto: UploadContractDocumentDto,
    @UploadedFile() file: UploadedEvidenceFile | undefined,
    @CurrentUser() user: any,
  ) {
    return this.service.upload(id, dto.solicitud_id, file, user);
  }
  @Get(':id/archivo')
  async download(
    @Param('contratoId', ParseUUIDPipe) contractId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.service.download(contractId, id, user);
    response.setHeader('Content-Type', file.mime);
    response.setHeader('Content-Length', file.bytes.length);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="documento"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', 'sandbox');
    return new StreamableFile(file.bytes);
  }
}
