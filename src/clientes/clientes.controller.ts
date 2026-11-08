import {
  Body,
  Controller,
  Get,
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
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { ClientesService } from './clientes.service';
import {
  ClienteDetalleRespuestaDto,
  ClientesPaginadosRespuestaDto,
} from '../openapi/response-models.dto';

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
  @ApiOperation({ summary: 'Listar clientes', description: 'Administrador y administrador financiero consultan la lista global. El asesor solo consulta sus propios clientes.' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Página desde 1.' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Resultados por página (máximo 100).' })
  @ApiQuery({ name: 'q', required: false, type: String, description: 'Busca por nombre, apellidos o correo.' })
  @ApiOkResponse({ description: 'Página de clientes; la lista omite CURP, RFC y datos internos.', type: ClientesPaginadosRespuestaDto })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'El rol no tiene acceso a clientes.' })
  @ApiBadRequestResponse({ description: 'Los parámetros de paginación o búsqueda no son válidos.' })
  findAll(
    @Query() query: QueryClientesDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.clientesService.findAll(query, currentUser);
  }

  @Get(':id')
  @Roles('administrador', 'administrador financiero', 'asesor')
  @ApiOperation({ summary: 'Consultar un cliente', description: 'El asesor solo puede consultar clientes asignados. La respuesta personal se limita según el rol.' })
  @ApiParam({ name: 'id', description: 'UUID del cliente.' })
  @ApiOkResponse({ description: 'Detalle permitido para el rol autenticado.', type: ClienteDetalleRespuestaDto })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'El rol no tiene acceso a clientes.' })
  @ApiNotFoundResponse({ description: 'Cliente inexistente o fuera del alcance del asesor.' })
  @ApiBadRequestResponse({ description: 'El identificador no es un UUID válido.' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.clientesService.findOne(id, currentUser);
  }

  @Post()
  @Roles('asesor')
  @ApiOperation({ summary: 'Registrar un cliente', description: 'Solo el asesor autenticado puede registrar clientes; asesor_id se toma del JWT.' })
  @ApiCreatedResponse({ description: 'Cliente registrado y asignado al asesor autenticado.', type: ClienteDetalleRespuestaDto })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'Solo un asesor puede registrar clientes.' })
  @ApiBadRequestResponse({ description: 'Los datos del cliente no cumplen las validaciones.' })
  create(
    @Body() createClienteDto: CreateClienteDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.clientesService.create(createClienteDto, currentUser);
  }

  @Patch(':id')
  @Roles('administrador', 'asesor')
  @ApiOperation({ summary: 'Actualizar datos de un cliente', description: 'Administrador puede actualizar cualquier cliente; asesor solo al cliente asignado. No reasigna el asesor.' })
  @ApiParam({ name: 'id', description: 'UUID del cliente.' })
  @ApiOkResponse({ description: 'Cliente actualizado según el alcance del rol.', type: ClienteDetalleRespuestaDto })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'El rol no puede actualizar clientes.' })
  @ApiNotFoundResponse({ description: 'Cliente inexistente o fuera del alcance del asesor.' })
  @ApiBadRequestResponse({ description: 'No se enviaron campos editables o hay datos inválidos.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateClienteDto: UpdateClienteDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.clientesService.update(id, updateClienteDto, currentUser);
  }
}
