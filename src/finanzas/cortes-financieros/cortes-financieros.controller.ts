import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../roles/decorators/roles.decorator';
import { RolesGuard } from '../../roles/guards/roles.guard';
import { ChangeEstadoCorteDto } from './dto/change-estado-corte.dto';
import { CreateCorteFinancieroDto } from './dto/create-corte-financiero.dto';
import { QueryCortesFinancierosDto } from './dto/query-cortes-financieros.dto';
import { CortesFinancierosService } from './cortes-financieros.service';

type UsuarioAutenticado = {
  id: string;
  activo: boolean;
  roles: { nombre: string };
};

@Controller('finanzas/cortes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador', 'administrador financiero')
@ApiTags('Finanzas — Cortes financieros')
@ApiBearerAuth('jwt')
export class CortesFinancierosController {
  constructor(private readonly cortesService: CortesFinancierosService) {}

  @Get()
  @ApiOperation({
    summary: 'Consultar cortes financieros',
    description:
      'Lista paginada con filtros opcionales de estado e intervalo de fechas.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'fecha_desde',
    required: false,
    type: String,
    format: 'date-time',
  })
  @ApiQuery({
    name: 'fecha_hasta',
    required: false,
    type: String,
    format: 'date-time',
  })
  @ApiQuery({ name: 'estado_id', required: false, type: Number })
  @ApiOkResponse({
    description:
      'Cortes paginados; incluye folio, estado y conteos de pagos/prenóminas.',
  })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({
    description: 'Solo administración puede consultar cortes financieros.',
  })
  @ApiBadRequestResponse({
    description: 'Los filtros o el periodo no son válidos.',
  })
  findAll(
    @Query() query: QueryCortesFinancierosDto,
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    return this.cortesService.findAll(query, user);
  }

  @Post()
  @ApiOperation({ summary: 'Crear un corte semanal en preparación' })
  @ApiCreatedResponse({ description: 'Corte creado y periodo reservado.' })
  @ApiBadRequestResponse({
    description: 'El inicio del periodo no es un viernes válido.',
  })
  @ApiConflictResponse({
    description:
      'El periodo ya tiene un corte no cancelado o falta un estado configurado.',
  })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({
    description: 'Solo administración puede crear cortes.',
  })
  create(
    @Body() dto: CreateCorteFinancieroDto,
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    return this.cortesService.create(dto, user);
  }

  @Get(':id/preparacion')
  @ApiOperation({
    summary: 'Revisar pagos incluidos y excluidos antes de generar el corte',
  })
  @ApiOkResponse({
    description:
      'Vista previa calculada con pagos y comisiones históricas del periodo.',
  })
  @ApiConflictResponse({
    description:
      'La preparación está disponible solo en estado En preparación.',
  })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({
    description: 'Solo administración puede consultar la preparación.',
  })
  @ApiNotFoundResponse({ description: 'No se encontró el corte.' })
  preview(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    return this.cortesService.preview(id, user);
  }

  @Post(':id/generar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generar los detalles de pagos validados y abrir el corte',
  })
  @ApiOkResponse({
    description:
      'Detalles monetarios y reservas creados transaccionalmente; estado Abierto.',
  })
  @ApiConflictResponse({
    description: 'El corte cambió o algún pago está reservado en otro corte.',
  })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({
    description: 'Solo administración puede generar cortes.',
  })
  @ApiNotFoundResponse({ description: 'No se encontró el corte.' })
  generate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeEstadoCorteDto,
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    return this.cortesService.generate(id, dto, user);
  }

  @Post(':id/cerrar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cerrar un corte abierto de forma terminal' })
  @ApiOkResponse({
    description: 'Corte cerrado; fecha, usuario e historial registrados.',
  })
  @ApiConflictResponse({
    description: 'Solo se puede cerrar un corte Abierto.',
  })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({
    description: 'Solo administración puede cerrar cortes.',
  })
  @ApiNotFoundResponse({ description: 'No se encontró el corte.' })
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeEstadoCorteDto,
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    return this.cortesService.close(id, dto, user);
  }

  @Post(':id/cancelar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar un corte en preparación o abierto' })
  @ApiOkResponse({
    description: 'Corte cancelado; detalles conservados y reservas liberadas.',
  })
  @ApiConflictResponse({
    description: 'Solo se puede cancelar un corte En preparación o Abierto.',
  })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({
    description: 'Solo administración puede cancelar cortes.',
  })
  @ApiNotFoundResponse({ description: 'No se encontró el corte.' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeEstadoCorteDto,
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    return this.cortesService.cancel(id, dto, user);
  }

  @Get(':id/historial')
  @ApiOperation({ summary: 'Consultar el historial de estados del corte' })
  @ApiOkResponse({
    description:
      'Transiciones ordenadas cronológicamente, con estados y usuario.',
  })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({
    description: 'Solo administración puede consultar el historial.',
  })
  @ApiNotFoundResponse({ description: 'No se encontró el corte.' })
  history(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    return this.cortesService.history(id, user);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Consultar corte, pagos, comisiones relacionadas y totales separados',
  })
  @ApiOkResponse({
    description:
      'Corte con detalles históricos; el resumen de comisiones no se resta de ingresos.',
  })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({
    description: 'Solo administración puede consultar cortes.',
  })
  @ApiNotFoundResponse({ description: 'No se encontró el corte.' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    return this.cortesService.findOne(id, user);
  }
}
