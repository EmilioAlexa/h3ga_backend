import { Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../roles/decorators/roles.decorator';
import { RolesGuard } from '../../roles/guards/roles.guard';
import { ChangeEstadoComisionDto } from './dto/change-estado-comision.dto';
import { CreateReceptorDispersionDto } from './dto/create-receptor-dispersion.dto';
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
  @ApiOperation({ summary: 'Registrar receptor para un concepto de dispersión' })
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
  saveConfig(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveConfiguracionDispersionDto, @CurrentUser() user: UsuarioAutenticado) { return this.service.saveConfiguracion(id, dto, user); }

  @Get('contratos/:id/comisiones/historial')
  @Roles('administrador', 'administrador financiero')
  configHistory(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UsuarioAutenticado) { return this.service.historyConfiguracion(id, user); }

  @Get('comisiones')
  list(@Query() query: QueryComisionesDto, @CurrentUser() user: UsuarioAutenticado) { return this.service.findComisiones(query, user); }

  @Put('comisiones/:id/dispersar')
  @Roles('administrador', 'administrador financiero')
  disperse(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeEstadoComisionDto, @CurrentUser() user: UsuarioAutenticado) { return this.service.disperse(id, dto, user); }
}
