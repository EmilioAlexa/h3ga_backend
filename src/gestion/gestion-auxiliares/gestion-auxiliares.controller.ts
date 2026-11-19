import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser as CurrentUserDecorator } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../roles/decorators/roles.decorator';
import { RolesGuard } from '../../roles/guards/roles.guard';
import { CreateAsignacionDto } from './dto/create-asignacion.dto';
import { CreateTareaDto } from './dto/create-tarea.dto';
import { QueryAsignacionesDto } from './dto/query-asignaciones.dto';
import { QueryTareasDto } from './dto/query-tareas.dto';
import { RevisarEnvioDto } from './dto/revisar-envio.dto';
import { UpdateAsignacionDto } from './dto/update-asignacion.dto';
import { UpdateTareaEstadoDto } from './dto/update-tarea-estado.dto';
import { GestionAuxiliaresService } from './gestion-auxiliares.service';
import type { CurrentUser } from './gestion-auxiliares.service';
@Controller('gestion/auxiliares')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('Gestión de auxiliares')
@ApiBearerAuth('jwt')
export class GestionAuxiliaresController {
  constructor(private readonly service: GestionAuxiliaresService) {}

  @Get('disponibles')
  @Roles('asesor')
  listAuxiliares(@CurrentUserDecorator() user: CurrentUser) { return this.service.listAuxiliares(user); }

  @Post('asignaciones')
  @Roles('asesor')
  createAsignacion(@Body() dto: CreateAsignacionDto, @CurrentUserDecorator() user: CurrentUser) { return this.service.createAsignacion(dto, user); }

  @Get('asignaciones')
  @Roles('asesor', 'auxiliar administrativo')
  findAsignaciones(@Query() query: QueryAsignacionesDto, @CurrentUserDecorator() user: CurrentUser) { return this.service.findAsignaciones(query, user); }

  @Patch('asignaciones/:id')
  @Roles('asesor')
  updateAsignacion(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAsignacionDto, @CurrentUserDecorator() user: CurrentUser) { return this.service.updateAsignacion(id, dto.activo, user); }

  @Post('tareas')
  @Roles('asesor')
  createTarea(@Body() dto: CreateTareaDto, @CurrentUserDecorator() user: CurrentUser) { return this.service.createTarea(dto, user); }

  @Get('tareas')
  @Roles('asesor', 'auxiliar administrativo')
  findTareas(@Query() query: QueryTareasDto, @CurrentUserDecorator() user: CurrentUser) { return this.service.findTareas(query, user); }

  @Patch('tareas/:id/estado')
  @Roles('asesor', 'auxiliar administrativo')
  updateEstado(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTareaEstadoDto, @CurrentUserDecorator() user: CurrentUser) { return this.service.updateEstadoTarea(id, dto.estatus, user); }

  @Get('tareas/:id/envios')
  @Roles('asesor', 'auxiliar administrativo')
  findEnvios(@Param('id', ParseUUIDPipe) id: string, @CurrentUserDecorator() user: CurrentUser) { return this.service.findEnviosTarea(id, user); }

  @Patch('envios/:id/revision')
  @Roles('asesor')
  revisar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RevisarEnvioDto, @CurrentUserDecorator() user: CurrentUser) { return this.service.revisarEnvio(id, dto.resultado, dto.comentario ?? dto.observacion, user); }
}
