import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../roles/decorators/roles.decorator';
import { RolesGuard } from '../../roles/guards/roles.guard';
import { QueryReportesFinancierosDto } from './dto/query-reportes.dto';
import { ReportesFinancierosService } from './reportes.service';

type AuthUser = { id: string; activo: boolean; roles: { nombre: string } };

@Controller('finanzas/reportes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador', 'administrador financiero')
@ApiTags('Finanzas — Reportes')
@ApiBearerAuth('jwt')
export class ReportesFinancierosController {
  constructor(private readonly reports: ReportesFinancierosService) {}

  @Get('ingresos')
  @ApiOperation({ summary: 'Consultar ingresos por periodo' })
  @ApiOkResponse({ description: 'Pagos con estado Validado, agregados por semana viernes-jueves, mes o año.' })
  @ApiBadRequestResponse({ description: 'Fechas, granularidad o filtros inválidos.' })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'Solo administración puede consultar reportes.' })
  ingresos(@Query() query: QueryReportesFinancierosDto, @CurrentUser() user: AuthUser) {
    return this.reports.ingresos(query, user);
  }

  @Get('comisiones-destino')
  @ApiOperation({ summary: 'Consultar comisiones por destino, beneficiario y estado de dispersión' })
  @ApiOkResponse({ description: 'Comisiones históricas con importe, porcentaje del total y estado de dispersión.' })
  @ApiBadRequestResponse({ description: 'Fechas, granularidad o filtros inválidos.' })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'Solo administración puede consultar reportes.' })
  comisionesPorDestino(@Query() query: QueryReportesFinancierosDto, @CurrentUser() user: AuthUser) {
    return this.reports.comisionesPorDestino(query, user);
  }

  @Get('comisiones-tipo-venta')
  @ApiOperation({ summary: 'Consultar comisiones agrupadas por tipo de venta' })
  @ApiOkResponse({ description: 'El tipo de venta se obtiene de seguimiento APD; otros contratos aparecen sin tipo registrado.' })
  @ApiBadRequestResponse({ description: 'Fechas, granularidad o filtros inválidos.' })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'Solo administración puede consultar reportes.' })
  comisionesPorTipoVenta(@Query() query: QueryReportesFinancierosDto, @CurrentUser() user: AuthUser) {
    return this.reports.comisionesPorTipoVenta(query, user);
  }

  @Get('imss')
  @ApiOperation({ summary: 'Consultar comisiones destinadas al IMSS' })
  @ApiOkResponse({ description: 'Importe efectivamente dispersado, pendiente y en otros estados; solo contratos M10, M40 y M40 Retroactiva.' })
  @ApiBadRequestResponse({ description: 'Fechas, granularidad o filtros inválidos.' })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'Solo administración puede consultar reportes.' })
  pagosImss(@Query() query: QueryReportesFinancierosDto, @CurrentUser() user: AuthUser) {
    return this.reports.pagosImss(query, user);
  }

  @Get('pagos-metodo')
  @ApiOperation({ summary: 'Consultar pagos validados por método de pago' })
  @ApiOkResponse({ description: 'Importe, cantidad y porcentaje por método, agrupados por periodo.' })
  @ApiBadRequestResponse({ description: 'Fechas, granularidad o filtros inválidos.' })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'Solo administración puede consultar reportes.' })
  pagosPorMetodo(@Query() query: QueryReportesFinancierosDto, @CurrentUser() user: AuthUser) {
    return this.reports.pagosPorMetodo(query, user);
  }
}
