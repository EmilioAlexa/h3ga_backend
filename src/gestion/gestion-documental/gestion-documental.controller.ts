import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser as CurrentUserDecorator } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../roles/decorators/roles.decorator';
import { RolesGuard } from '../../roles/guards/roles.guard';
import type { CurrentUser } from '../gestion-auxiliares/gestion-auxiliares.service';
import { CreateEnvioDto } from './dto/create-envio.dto';
import { GestionDocumentalService } from './gestion-documental.service';

@Controller('gestion/documental')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('Gestión documental')
@ApiBearerAuth('jwt')
export class GestionDocumentalController {
  constructor(private readonly service: GestionDocumentalService) {}

  @Get('tareas') @Roles('auxiliar administrativo')
  findTareas(@CurrentUserDecorator() user: CurrentUser) { return this.service.findTareas(user); }

  @Get('clientes/:clienteId/expediente') @Roles('asesor', 'auxiliar administrativo')
  findExpediente(@Param('clienteId', ParseUUIDPipe) clienteId: string, @CurrentUserDecorator() user: CurrentUser) { return this.service.findExpediente(clienteId, user); }

  @Get('clientes/:clienteId/documentos') @Roles('asesor', 'auxiliar administrativo')
  findDocumentos(@Param('clienteId', ParseUUIDPipe) clienteId: string, @CurrentUserDecorator() user: CurrentUser) { return this.service.findDocumentos(clienteId, user); }

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
