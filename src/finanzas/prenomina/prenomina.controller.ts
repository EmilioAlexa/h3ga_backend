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
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../roles/decorators/roles.decorator';
import { RolesGuard } from '../../roles/guards/roles.guard';
import { CreatePrenominaDto } from './dto/create-prenomina.dto';
import { QueryPrenominasDto } from './dto/query-prenominas.dto';
import { PrenominasService } from './prenomina.service';

type AuthUser = { id: string; activo: boolean; roles: { nombre: string } };

@Controller('finanzas')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador', 'administrador financiero')
@ApiTags('Finanzas — Prenómina')
@ApiBearerAuth('jwt')
export class PrenominasController {
  constructor(private readonly prenominas: PrenominasService) {}

  @Get('prenominas')
  @ApiOperation({ summary: 'Consultar prenóminas con filtros de corte, estado y receptor' })
  @ApiOkResponse({ description: 'Lista paginada de prenóminas y concentrados por receptor.' })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'Solo administración puede consultar prenóminas.' })
  findAll(@Query() query: QueryPrenominasDto, @CurrentUser() user: AuthUser) {
    return this.prenominas.findAll(query, user);
  }

  @Get('cortes/:corteId/prenomina/preparacion')
  @ApiOperation({ summary: 'Previsualizar comisiones personales del corte para prenómina' })
  @ApiOkResponse({ description: 'Movimientos elegibles agrupados por concepto y receptor, con pagos origen.' })
  @ApiNotFoundResponse({ description: 'No se encontró el corte.' })
  @ApiConflictResponse({ description: 'El corte ya cuenta con una prenómina.' })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'Solo administración puede revisar prenómina.' })
  preview(@Param('corteId', ParseUUIDPipe) corteId: string, @CurrentUser() user: AuthUser) {
    return this.prenominas.preview(corteId, user);
  }

  @Post('cortes/:corteId/prenomina/generar')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generar una prenómina a partir de un corte financiero' })
  @ApiCreatedResponse({ description: 'Concentrado por receptor y relaciones de comisiones creados en una transacción.' })
  @ApiConflictResponse({ description: 'El corte ya tiene prenómina, fue cancelado o cambiaron comisiones elegibles.' })
  @ApiNotFoundResponse({ description: 'No se encontró el corte.' })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'Solo administración puede generar prenómina.' })
  generate(
    @Param('corteId', ParseUUIDPipe) corteId: string,
    @Body() dto: CreatePrenominaDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.prenominas.generate(corteId, dto, user);
  }

  @Get('prenominas/:id')
  @ApiOperation({ summary: 'Consultar prenómina, receptores y movimientos origen' })
  @ApiOkResponse({ description: 'Prenómina con pagos y contratos que originan cada comisión.' })
  @ApiNotFoundResponse({ description: 'No se encontró la prenómina.' })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'Solo administración puede consultar prenóminas.' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.prenominas.findOne(id, user);
  }
}
