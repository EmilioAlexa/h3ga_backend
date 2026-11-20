import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../roles/decorators/roles.decorator';
import { RolesGuard } from '../../roles/guards/roles.guard';
import { QueryProcesoFinalClientesDto } from './dto/query-proceso-final-clientes.dto';
import { UpdateProcesoFinalEtapaDto } from './dto/update-proceso-final-etapa.dto';
import { UpsertProcesoFinalDatosInstitucionalesDto } from './dto/upsert-proceso-final-datos-institucionales.dto';
import { ProcesoFinalService } from './proceso-final.service';
import type { UsuarioProcesoFinal } from './proceso-final.service';

@Controller('gestion/proceso-final')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('asesor')
@ApiTags('Gestión — Proceso Final')
@ApiBearerAuth('jwt')
export class ProcesoFinalController {
  constructor(private readonly service: ProcesoFinalService) {}

  @Get('clientes')
  findClientes(@Query() query: QueryProcesoFinalClientesDto, @CurrentUser() user: UsuarioProcesoFinal) {
    return this.service.findClientes(query, user);
  }

  @Get('compromisos')
  findCompromisos(@CurrentUser() user: UsuarioProcesoFinal) {
    return this.service.findCompromisos(user);
  }

  @Get('clientes/:clienteId')
  findCliente(@Param('clienteId', ParseUUIDPipe) clienteId: string, @CurrentUser() user: UsuarioProcesoFinal) {
    return this.service.findCliente(clienteId, user);
  }

  @Get('clientes/:clienteId/compromisos')
  findCompromisosCliente(@Param('clienteId', ParseUUIDPipe) clienteId: string, @CurrentUser() user: UsuarioProcesoFinal) {
    return this.service.findCompromisosCliente(clienteId, user);
  }

  @Get('clientes/:clienteId/cobranza-final')
  findCobranzaFinal(@Param('clienteId', ParseUUIDPipe) clienteId: string, @CurrentUser() user: UsuarioProcesoFinal) {
    return this.service.findCobranzaFinal(clienteId, user);
  }

  @Get('clientes/:clienteId/etapas/:etapaTramiteId')
  findEtapa(@Param('clienteId', ParseUUIDPipe) clienteId: string, @Param('etapaTramiteId', ParseUUIDPipe) etapaTramiteId: string, @CurrentUser() user: UsuarioProcesoFinal) {
    return this.service.findEtapa(clienteId, etapaTramiteId, user);
  }

  @Patch('clientes/:clienteId/etapas/:etapaTramiteId')
  updateEtapa(@Param('clienteId', ParseUUIDPipe) clienteId: string, @Param('etapaTramiteId', ParseUUIDPipe) etapaTramiteId: string, @Body() dto: UpdateProcesoFinalEtapaDto, @CurrentUser() user: UsuarioProcesoFinal) {
    return this.service.updateEtapa(clienteId, etapaTramiteId, dto, user);
  }

  @Get('clientes/:clienteId/etapas/:etapaTramiteId/documentos')
  findDocumentos(@Param('clienteId', ParseUUIDPipe) clienteId: string, @Param('etapaTramiteId', ParseUUIDPipe) etapaTramiteId: string, @CurrentUser() user: UsuarioProcesoFinal) {
    return this.service.findDocumentos(clienteId, etapaTramiteId, user);
  }

  @Get('clientes/:clienteId/etapas/:etapaTramiteId/datos-institucionales')
  findDatosInstitucionales(@Param('clienteId', ParseUUIDPipe) clienteId: string, @Param('etapaTramiteId', ParseUUIDPipe) etapaTramiteId: string, @CurrentUser() user: UsuarioProcesoFinal) {
    return this.service.findDatosInstitucionales(clienteId, etapaTramiteId, user);
  }

  @Put('clientes/:clienteId/etapas/:etapaTramiteId/datos-institucionales')
  upsertDatosInstitucionales(@Param('clienteId', ParseUUIDPipe) clienteId: string, @Param('etapaTramiteId', ParseUUIDPipe) etapaTramiteId: string, @Body() dto: UpsertProcesoFinalDatosInstitucionalesDto, @CurrentUser() user: UsuarioProcesoFinal) {
    return this.service.upsertDatosInstitucionales(clienteId, etapaTramiteId, dto, user);
  }
}
