
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
} from '@nestjs/common';

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

@Controller('gestion/formatos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FormatosInstitucionalesController {
  constructor(
    private readonly formatosService: FormatosInstitucionalesService,
  ) {}

  // Consultar todos los formatos con filtros
  @Get()
  @Roles('administrador', 'asesor', 'auxiliar_administrativo')
  findAll(@Query() query: QueryFormatosDto) {
    return this.formatosService.findAll(query);
  }

  // Consultar biblioteca de formatos
  @Get('biblioteca')
  @Roles('administrador', 'asesor', 'auxiliar_administrativo')
  findBiblioteca(@Query() query: QueryFormatosDto) {
    return this.formatosService.findBiblioteca(query);
  }

  // Descargar formato por ID
  @Get(':id/descargar')
  @Roles('administrador', 'asesor', 'auxiliar_administrativo')
  descargar(@Param('id', ParseIntPipe) id: number) {
    return this.formatosService.descargar(id);
  }

  // Consultar formato por ID
  @Get(':id')
  @Roles('administrador', 'asesor', 'auxiliar_administrativo')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.formatosService.findOne(id);
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
