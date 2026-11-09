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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../roles/decorators/roles.decorator';
import { RolesGuard } from '../roles/guards/roles.guard';
import {
  ContratoRespuestaDto,
  ContratosPaginadosRespuestaDto,
} from '../openapi/response-models.dto';
import { CreateContratoDto } from './dto/create-contrato.dto';
import { QueryContratosDto } from './dto/query-contratos.dto';
import { UpdateContratoDto } from './dto/update-contrato.dto';
import { ContratosService } from './contratos.service';

interface UsuarioAutenticado {
  id: string;
  activo: boolean;
  roles: { nombre: string };
}

@Controller('finanzas/contratos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador', 'administrador financiero', 'asesor')
@ApiTags('Finanzas — Contratos')
@ApiBearerAuth('jwt')
export class ContratosController {
  constructor(private readonly contratosService: ContratosService) {}

  @Get()
  @ApiOperation({
    summary: 'Consultar contratos',
    description:
      'Administrador y administrador financiero consultan el conjunto filtrado. El asesor solo recibe contratos cuyo contratos.asesor_id coincide con su usuario autenticado.',
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
    name: 'cliente_id',
    required: false,
    type: String,
    description: 'Filtra por UUID de cliente.',
  })
  @ApiQuery({
    name: 'servicio_id',
    required: false,
    type: Number,
    description: 'Filtra por servicio.',
  })
  @ApiQuery({
    name: 'estado_contrato_id',
    required: false,
    type: Number,
    description: 'Filtra por estado contractual.',
  })
  @ApiQuery({
    name: 'asesor_id',
    required: false,
    type: String,
    description:
      'Filtro administrativo por asesor. En asesores se ignora el parámetro y se usa el JWT.',
  })
  @ApiQuery({
    name: 'fecha_desde',
    required: false,
    type: String,
    format: 'date',
  })
  @ApiQuery({
    name: 'fecha_hasta',
    required: false,
    type: String,
    format: 'date',
  })
  @ApiQuery({
    name: 'q',
    required: false,
    type: String,
    description: 'Busca folios.',
  })
  @ApiOkResponse({
    description:
      'Página de contratos con datos mínimos del cliente, servicio, asesor y estado.',
    type: ContratosPaginadosRespuestaDto,
  })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'El rol no puede consultar contratos.' })
  @ApiBadRequestResponse({
    description:
      'Algún filtro es inválido o el rango de fechas está invertido.',
  })
  findAll(
    @Query() query: QueryContratosDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.contratosService.findAll(query, usuario);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Consultar un contrato por UUID',
    description:
      'El asesor solo obtiene contratos asignados directamente a su usuario mediante contratos.asesor_id.',
  })
  @ApiParam({ name: 'id', description: 'UUID del contrato.', format: 'uuid' })
  @ApiOkResponse({
    description: 'Contrato y relaciones de visualización seguras.',
    type: ContratoRespuestaDto,
  })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'El rol no puede consultar contratos.' })
  @ApiNotFoundResponse({
    description: 'Contrato inexistente o fuera del alcance del asesor.',
  })
  @ApiBadRequestResponse({
    description: 'El identificador no es un UUID válido.',
  })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.contratosService.findOne(id, usuario);
  }

  @Post()
  @Roles('administrador', 'administrador financiero', 'asesor')
  @ApiOperation({
    summary: 'Registrar un contrato',
    description:
      'Asesores, administradores y administradores financieros pueden registrar contratos. Al asesor se le asigna contratos.asesor_id desde el usuario autenticado; debe omitir asesor_id del cuerpo. Administración debe proporcionar asesor_id de un usuario activo con rol asesor.',
  })
  @ApiCreatedResponse({
    description: 'Contrato creado con sus relaciones de visualización.',
    type: ContratoRespuestaDto,
  })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({
    description: 'El rol no puede crear contratos o la cuenta no está activa.',
  })
  @ApiBadRequestResponse({
    description:
      'Datos inválidos, asesor_id enviado por un asesor, o una referencia no existe/no está activa.',
  })
  @ApiConflictResponse({
    description: 'Conflicto con una restricción única definida en la base.',
  })
  create(
    @Body() dto: CreateContratoDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.contratosService.create(dto, usuario);
  }

  @Patch(':id')
  @Roles('administrador', 'administrador financiero', 'asesor')
  @ApiOperation({
    summary: 'Actualizar observaciones del contrato',
    description:
      'Administración puede actualizar observaciones. El asesor solo puede actualizar contratos cuyo contratos.asesor_id coincide con su usuario autenticado. No cambia folio, relaciones, fecha, pagos ni estado.',
  })
  @ApiParam({ name: 'id', description: 'UUID del contrato.', format: 'uuid' })
  @ApiOkResponse({
    description: 'Contrato con observaciones actualizadas.',
    type: ContratoRespuestaDto,
  })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({
    description:
      'El rol no puede actualizar contratos o la cuenta no está activa.',
  })
  @ApiNotFoundResponse({ description: 'Contrato no encontrado.' })
  @ApiBadRequestResponse({
    description: 'UUID inválido o cuerpo vacío/no permitido.',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContratoDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.contratosService.update(id, dto, usuario);
  }
}
