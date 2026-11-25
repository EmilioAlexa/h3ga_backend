
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
} from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { pipeline } from 'node:stream/promises';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LIMITE_DOCUMENTO } from '../gestion-documental/documento-expediente.validator';
import { CargarFormatoDto } from './dto/cargar-formato.dto';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../roles/guards/roles.guard';
import { Roles } from '../../roles/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

import { FormatosInstitucionalesService } from './formatos-institucionales.service';
import { CreateFormatoDto } from './dto/create-formato.dto';
import { UpdateFormatoDto } from './dto/update-formato.dto';
import { QueryFormatosDto } from './dto/query-formatos.dto';

interface AuthenticatedUser {
  id: string;
}

@ApiTags('Formatos institucionales')
@ApiBearerAuth('jwt')
@Controller('gestion/formatos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FormatosInstitucionalesController {
  constructor(
    private readonly formatosService: FormatosInstitucionalesService,
  ) {}

  // Consultar todos los formatos con filtros
  @Get()
  @Roles('administrador', 'asesor', 'auxiliar administrativo')
  findAll(@Query() query: QueryFormatosDto) {
    return this.formatosService.findAll(query);
  }

  // Consultar biblioteca de formatos
  @Get('biblioteca')
  @Roles('administrador', 'asesor', 'auxiliar administrativo')
  findBiblioteca(@Query() query: QueryFormatosDto) {
    return this.formatosService.findBiblioteca(query);
  }

  // Descargar formato por ID
  @Get(':id/descargar')
  @Roles('administrador', 'asesor', 'auxiliar administrativo')
  async descargar(@Param('id', ParseIntPipe) id: number, @Res() response: Response) {
    const { file, filename, contentType } = await this.formatosService.descargar(id);
    response.setHeader('Content-Type', contentType);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16))}`);
    await pipeline(file.stream, response);
  }

  // Consultar formato por ID
  @Get(':id')
  @Roles('administrador', 'asesor', 'auxiliar administrativo')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.formatosService.findOne(id);
  }

  @Post('archivo')
  @Roles('administrador')
  @UseInterceptors(FileInterceptor('archivo', { storage: memoryStorage(), limits: { fileSize: LIMITE_DOCUMENTO } }))
  @ApiOperation({ summary: 'RF-09 — Cargar formato PDF o Word' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['nombre', 'dependencia_id', 'tipo_formato', 'archivo'], properties: { nombre: { type: 'string' }, descripcion: { type: 'string' }, dependencia_id: { type: 'integer', minimum: 1 }, tipo_formato: { type: 'string', enum: ['pdf', 'word'] }, archivo: { type: 'string', format: 'binary' } } } })
  cargar(@Body() dto: CargarFormatoDto, @UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.formatosService.cargar(dto, file, user.id);
  }

  // Crear formato
  @Post()
  @Roles('administrador')
  create(
    @Body() dto: CreateFormatoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.formatosService.create(dto, user.id);
  }

  // Actualizar formato
  @Patch(':id')
  @Roles('administrador')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFormatoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.formatosService.update(id, dto, user.id);
  }

  // Eliminar formato (borrado lógico)
  @Delete(':id')
  @Roles('administrador')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.formatosService.remove(id, user.id);
  }
}
