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
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
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
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../roles/decorators/roles.decorator';
import { RolesGuard } from '../../roles/guards/roles.guard';
import { CatalogoFinancieroDto } from './dto/catalogo-financiero.dto';
import { QueryCatalogosDto } from './dto/query-catalogos.dto';
import { CatalogosService } from './catalogos.service';
import {
  CatalogoPaginadoRespuestaDto,
  CatalogoRetiroRespuestaDto,
} from '../../openapi/response-models.dto';

interface UsuarioAutenticado {
  id: string;
  roles: { nombre: string };
}

@Controller('finanzas/catalogos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador', 'administrador financiero', 'asesor')
@ApiTags('Finanzas — Catálogos')
@ApiBearerAuth('jwt')
export class CatalogosController {
  constructor(private readonly catalogosService: CatalogosService) {}

  @Get()
  @ApiOperation({ summary: 'Listar catálogos financieros', description: 'Describe los catálogos que cada rol puede consultar y las acciones disponibles.' })
  @ApiOkResponse({
    description: 'Claves de catálogo visibles para el usuario.',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          clave: { type: 'string' },
          editable: { type: 'boolean' },
          permite_desactivar: { type: 'boolean' },
          solo_administracion: { type: 'boolean' },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'El rol no tiene acceso a Finanzas.' })
  getCatalogos(@CurrentUser() usuario: UsuarioAutenticado) {
    return this.catalogosService.getCatalogos(usuario);
  }

  @Get(':catalogo')
  @ApiOperation({ summary: 'Consultar registros de un catálogo', description: 'Lista paginada. Los registros inactivos se excluyen por defecto; administración puede solicitarlos con activo=false.' })
  @ApiParam({ name: 'catalogo', description: 'Clave devuelta por GET /finanzas/catalogos.', example: 'formas-pago' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Página desde 1.' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Resultados por página (máximo 100).' })
  @ApiQuery({ name: 'q', required: false, type: String, description: 'Búsqueda por nombre.' })
  @ApiQuery({ name: 'activo', required: false, type: Boolean, description: 'Filtra estado activo; los asesores solo reciben registros activos.' })
  @ApiOkResponse({ description: 'Registros y metadatos de paginación.', type: CatalogoPaginadoRespuestaDto })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'El rol no puede consultar este catálogo.' })
  @ApiNotFoundResponse({ description: 'Clave de catálogo inexistente.' })
  @ApiBadRequestResponse({ description: 'Los filtros de consulta no son válidos.' })
  findAll(
    @Param('catalogo') catalogo: string,
    @Query() query: QueryCatalogosDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.catalogosService.findAll(catalogo, query, usuario);
  }

  @Get(':catalogo/:id')
  @ApiOperation({ summary: 'Consultar un registro de catálogo', description: 'Para esquemas de dispersión incluye sus detalles; solo roles administrativos pueden consultarlos.' })
  @ApiParam({ name: 'catalogo', description: 'Clave del catálogo.' })
  @ApiParam({ name: 'id', description: 'Identificador numérico del registro.' })
  @ApiOkResponse({ description: 'Registro de catálogo solicitado.', schema: { type: 'object', additionalProperties: true } })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'El rol no puede consultar este catálogo.' })
  @ApiNotFoundResponse({ description: 'Catálogo o registro inexistente.' })
  @ApiBadRequestResponse({ description: 'El identificador no es un entero válido.' })
  findOne(
    @Param('catalogo') catalogo: string,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.catalogosService.findOne(catalogo, String(id), usuario);
  }

  @Post(':catalogo')
  @Roles('administrador', 'administrador financiero')
  @ApiOperation({ summary: 'Crear un registro de catálogo', description: 'Solo administración. Disponible para servicios, formas de pago, tipos de cobro, tipos de evidencia y tipos de asesor.' })
  @ApiParam({ name: 'catalogo', description: 'Clave de catálogo editable.' })
  @ApiCreatedResponse({ description: 'Registro creado.', schema: { type: 'object', additionalProperties: true } })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'Solo administración puede crear catálogos.' })
  @ApiBadRequestResponse({ description: 'Catálogo de solo lectura o cuerpo inválido.' })
  @ApiConflictResponse({ description: 'Ya existe un registro con ese nombre.' })
  create(
    @Param('catalogo') catalogo: string,
    @Body() dto: CatalogoFinancieroDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.catalogosService.create(catalogo, dto, usuario);
  }

  @Patch(':catalogo/:id')
  @Roles('administrador', 'administrador financiero')
  @ApiOperation({ summary: 'Actualizar un registro de catálogo', description: 'Solo administración y solo campos admitidos para el catálogo indicado.' })
  @ApiParam({ name: 'catalogo', description: 'Clave de catálogo editable.' })
  @ApiParam({ name: 'id', description: 'Identificador numérico del registro.' })
  @ApiOkResponse({ description: 'Registro actualizado.', schema: { type: 'object', additionalProperties: true } })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'Solo administración puede modificar catálogos.' })
  @ApiBadRequestResponse({ description: 'Catálogo de solo lectura, cuerpo vacío o campos no permitidos.' })
  @ApiConflictResponse({ description: 'Ya existe un registro con ese nombre.' })
  @ApiNotFoundResponse({ description: 'Registro inexistente.' })
  update(
    @Param('catalogo') catalogo: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CatalogoFinancieroDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.catalogosService.update(catalogo, String(id), dto, usuario);
  }

  @Delete(':catalogo/:id')
  @Roles('administrador', 'administrador financiero')
  @ApiOperation({ summary: 'Retirar un registro de catálogo', description: 'Solo administración. Desactiva registros con campo activo; elimina físicamente un estado o tipo solo si no tiene referencias.' })
  @ApiParam({ name: 'catalogo', description: 'Clave del catálogo.' })
  @ApiParam({ name: 'id', description: 'Identificador numérico del registro.' })
  @ApiOkResponse({ description: 'Indica explícitamente si se desactivó, ya estaba desactivado o se eliminó físicamente.', type: CatalogoRetiroRespuestaDto })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'Solo administración puede retirar catálogos.' })
  @ApiBadRequestResponse({ description: 'El identificador no es válido.' })
  @ApiNotFoundResponse({ description: 'Catálogo o registro inexistente.' })
  @ApiConflictResponse({ description: 'El registro tiene referencias y se conserva para proteger la integridad histórica.' })
  remove(
    @Param('catalogo') catalogo: string,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.catalogosService.remove(catalogo, String(id), usuario);
  }
}
