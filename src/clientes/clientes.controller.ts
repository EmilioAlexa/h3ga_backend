import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../roles/decorators/roles.decorator';
import { RolesGuard } from '../roles/guards/roles.guard';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { QueryClientesDto } from './dto/query-clientes.dto';
import { SetClientePausadoDto } from './dto/set-cliente-pausado.dto';
import { SetClienteReferidorDto } from './dto/set-cliente-referidor.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { ClientesService } from './clientes.service';
import {
  ClienteDetalleRespuestaDto,
} from '../openapi/response-models.dto';
import { ClientesDirectorioPaginadoRespuestaDto } from './dto/clientes-directorio-respuesta.dto';

interface AuthenticatedUser {
  id: string;
  roles: { nombre: string };
}

@Controller('clientes')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('Clientes')
@ApiBearerAuth('jwt')
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  @Get()
  @Roles('administrador', 'administrador financiero', 'asesor')
  @ApiOperation({
    summary: 'Listar clientes',
    description:
      'Administrador y administrador financiero consultan la lista global. El asesor solo consulta sus propios clientes.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Página desde 1.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Resultados por página (máximo 100).',
  })
  @ApiQuery({
    name: 'q',
    required: false,
    type: String,
    description: 'Busca por nombre, apellidos o correo.',
  })
  @ApiOkResponse({
    description:
      'Página de clientes; la lista omite CURP, RFC y datos internos.',
    type: ClientesDirectorioPaginadoRespuestaDto,
  })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'El rol no tiene acceso a clientes.' })
  @ApiBadRequestResponse({
    description: 'Los parámetros de paginación o búsqueda no son válidos.',
  })
  findAll(
    @Query() query: QueryClientesDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.clientesService.findAll(query, currentUser);
  }

  @Get(':id')
  @Roles('administrador', 'administrador financiero', 'asesor')
  @ApiOperation({
    summary: 'Consultar un cliente',
    description:
      'El asesor solo puede consultar clientes asignados. La respuesta personal se limita según el rol.',
  })
  @ApiParam({ name: 'id', description: 'UUID del cliente.' })
  @ApiOkResponse({
    description: 'Detalle permitido para el rol autenticado.',
    type: ClienteDetalleRespuestaDto,
  })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'El rol no tiene acceso a clientes.' })
  @ApiNotFoundResponse({
    description: 'Cliente inexistente o fuera del alcance del asesor.',
  })
  @ApiBadRequestResponse({
    description: 'El identificador no es un UUID válido.',
  })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.clientesService.findOne(id, currentUser);
  }

  @Post()
  @Roles('asesor', 'administrador', 'administrador financiero')
  @ApiOperation({
    summary: 'Registrar un cliente',
    description:
      'Asesor, administrador y administrador financiero pueden registrar clientes. Para el asesor, asesor_id se toma del JWT; administración registra sin asesor asignado. El UUID opcional del referidor debe pertenecer a un cliente asignado al actor y se audita.',
  })
  @ApiCreatedResponse({
    description: 'Cliente registrado; se asigna al actor únicamente si es asesor.',
    type: ClienteDetalleRespuestaDto,
  })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({
    description: 'Solo asesor, administrador y administrador financiero pueden registrar clientes.',
  })
  @ApiBadRequestResponse({
    description: 'Los datos del cliente no cumplen las validaciones.',
  })
  create(
    @Body() createClienteDto: CreateClienteDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.clientesService.create(createClienteDto, currentUser);
  }

  @Patch(':id')
  @Roles('administrador', 'asesor')
  @ApiOperation({
    summary: 'Actualizar datos de un cliente',
    description:
      'Administrador puede actualizar cualquier cliente; asesor solo al cliente asignado. No reasigna el asesor.',
  })
  @ApiParam({ name: 'id', description: 'UUID del cliente.' })
  @ApiOkResponse({
    description: 'Cliente actualizado según el alcance del rol.',
    type: ClienteDetalleRespuestaDto,
  })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'El rol no puede actualizar clientes.' })
  @ApiNotFoundResponse({
    description: 'Cliente inexistente o fuera del alcance del asesor.',
  })
  @ApiBadRequestResponse({
    description: 'No se enviaron campos editables o hay datos inválidos.',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateClienteDto: UpdateClienteDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.clientesService.update(id, updateClienteDto, currentUser);
  }

  @Patch(':id/estado-operativo')
  @Roles('administrador', 'administrador financiero')
  @ApiOperation({
    summary: 'Pausar o reactivar un cliente',
    description:
      'Solo administración. Requiere la migración I3 de clientes.pausado; conserva los datos y relaciones del cliente.',
  })
  @ApiParam({ name: 'id', description: 'UUID del cliente.', format: 'uuid' })
  @ApiOkResponse({
    description: 'Cliente con el estado operativo actualizado.',
    type: ClienteDetalleRespuestaDto,
  })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({
    description: 'Solo administración puede pausar o reactivar.',
  })
  @ApiNotFoundResponse({ description: 'Cliente inexistente.' })
  @ApiBadRequestResponse({ description: 'UUID o cuerpo inválido.' })
  setPaused(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetClientePausadoDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.clientesService.setPaused(id, dto.pausado, currentUser);
  }

  @Patch(':id/referidor')
  @Roles('administrador', 'administrador financiero')
  @ApiOperation({ summary: 'Asignar, cambiar o retirar el cliente referidor', description: 'Operación administrativa con motivo, actor, fecha y valores anterior/nuevo auditados. No cambia el texto histórico referido_por ni snapshots previos.' })
  @ApiOkResponse({ description: 'Cliente actualizado con referido_por_cliente_id.' })
  @ApiBadRequestResponse({ description: 'UUID, motivo o autorreferencia inválidos.' })
  @ApiNotFoundResponse({ description: 'Cliente titular o referidor inexistente.' })
  @ApiForbiddenResponse({ description: 'Solo administración.' })
  setReferidor(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetClienteReferidorDto,
    @CurrentUser() currentUser: AuthenticatedUser) {
    return this.clientesService.setReferidor(id, dto.referidor_cliente_id, dto.motivo, currentUser);
  }

  @Get(':id/referidor/historial')
  @Roles('administrador', 'administrador financiero')
  @ApiOperation({ summary: 'Consultar historial de asignaciones de referidor de un cliente' })
  @ApiOkResponse({ description: 'Eventos de asignación, cambio y retiro con actor y fecha.' })
  @ApiNotFoundResponse({ description: 'Cliente inexistente.' })
  @ApiForbiddenResponse({ description: 'Solo administración.' })
  historialReferidor(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() currentUser: AuthenticatedUser) {
    return this.clientesService.historialReferidor(id, currentUser);
  }

  @Get(':id/dependencias')
  @Roles('administrador', 'administrador financiero')
  @ApiOperation({ summary: 'Previsualizar dependencias directas e indirectas de un cliente', description: 'Cuenta todas las FK actuales hacia clientes, incluidas relaciones CASCADE y de Ruta. No reserva el cliente; DELETE vuelve a comprobar dentro de una transacción.' })
  @ApiOkResponse({ description: 'cliente_id, apto_para_eliminacion, dependencias [{tabla,columna,restriccion,on_delete,cantidad}], bloqueantes e indirectas. No incluye identidades de terceros.' })
  @ApiBadRequestResponse({ description: 'UUID inválido.' })
  @ApiUnauthorizedResponse({ description: 'Falta JWT válido.' })
  @ApiForbiddenResponse({ description: 'Solo administrador y administrador financiero.' })
  @ApiNotFoundResponse({ description: 'Cliente inexistente.' })
  dependencies(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() currentUser: AuthenticatedUser) {
    return this.clientesService.dependencies(id, currentUser);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('administrador', 'administrador financiero')
  @ApiOperation({ summary: 'Eliminar físicamente un cliente sin dependencias', description: 'Solo disponible después de aplicar la migración de auditoría aprobada. Bloquea la fila, cuenta todas las FK y registra actor y UUID en la misma transacción. No usa CASCADE ni borra historia.' })
  @ApiBadRequestResponse({ description: 'UUID inválido.' })
  @ApiUnauthorizedResponse({ description: 'Falta JWT válido.' })
  @ApiForbiddenResponse({ description: 'Solo administrador y administrador financiero.' })
  @ApiNotFoundResponse({ description: 'Cliente inexistente.' })
  @ApiConflictResponse({ description: 'Migración de auditoría pendiente, dependencias existentes o FK concurrente. Respuesta estructurada con código seguro.' })
  delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() currentUser: AuthenticatedUser) {
    return this.clientesService.deleteWithoutDependencies(id, currentUser);
  }
}
