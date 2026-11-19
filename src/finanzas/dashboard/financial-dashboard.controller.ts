import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../roles/decorators/roles.decorator';
import { RolesGuard } from '../../roles/guards/roles.guard';
import { QueryFinancialDashboardDto } from './dto/query-financial-dashboard.dto';
import { FinancialDashboardService } from './financial-dashboard.service';

type AuthUser = { id: string; activo: boolean; roles: { nombre: string } };

@Controller('finanzas/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador', 'administrador financiero', 'asesor')
@ApiTags('Finanzas — Dashboard')
@ApiBearerAuth('jwt')
export class FinancialDashboardController {
  constructor(private readonly dashboard: FinancialDashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Dashboard financiero semanal por alcance JWT', description: 'Ingresos: pagos Validados por fecha_pago en semana viernes–viernes America/Cancun. Cobranza: saldo operativo a la fecha de consulta. Comisiones: snapshots por fecha_calculo. El asesor solo ve sus contratos y comisión Asesor; los importes son strings decimales. Las listas tienen límite y los saldos desconocidos quedan nulos.' })
  @ApiOkResponse({ description: 'Lectura semanal consistente. Importes Decimal como string de dos decimales; nulos indican regla o dato no disponible. Los bloques de listas exponen hay_mas y limite.', schema: {
    type: 'object', required: ['periodo', 'calculado_en', 'alcance', 'indicadores', 'ingresos_por_servicio', 'cobranza', 'comisiones', 'proximos_cobros', 'actividad_reciente', 'no_disponibles'],
    properties: {
      periodo: { type: 'object', properties: { inicio_local: { type: 'string', format: 'date' }, fin_exclusivo_local: { type: 'string', format: 'date' }, zona: { type: 'string', example: 'America/Cancun' } } },
      calculado_en: { type: 'string', format: 'date-time' }, alcance: { type: 'string', enum: ['global', 'asesor'] },
      indicadores: { type: 'object', properties: { ingresos_periodo: { type: 'string', pattern: '^\\d+\\.\\d{2}$' }, ingresos_periodo_anterior: { type: 'string' }, variacion_periodo_porcentaje: { type: 'string', nullable: true }, pagos_pendientes_validacion: { type: 'object' }, contratos_activos: { type: 'integer' }, por_cobrar_conocido: { type: 'string' }, por_cobrar_completo: { type: 'boolean' }, comisiones_generadas: { type: 'string', nullable: true } } },
      ingresos_por_servicio: { type: 'object' }, contratos_por_servicio: { type: 'array', items: { type: 'object' } },
      cobranza: { type: 'object', properties: { saldo_conocido: { type: 'string' }, saldo_vencido_conocido: { type: 'string' }, saldos_no_disponibles: { type: 'integer' }, anomalias: { type: 'integer' }, total_completo: { type: 'boolean' } } },
      comisiones: { type: 'object' }, cortes: { type: 'array', nullable: true, items: { type: 'object' } },
      proximos_cobros: { type: 'object' }, actividad_reciente: { type: 'object' }, no_disponibles: { type: 'array', items: { type: 'string' } },
    },
  } })
  @ApiBadRequestResponse({ description: 'Viernes, fecha o límite inválido.' })
  @ApiUnauthorizedResponse({ description: 'Falta JWT válido.' })
  @ApiForbiddenResponse({ description: 'Rol sin acceso a Finanzas o usuario inactivo.' })
  get(@Query() query: QueryFinancialDashboardDto, @CurrentUser() user: AuthUser) {
    return this.dashboard.get(query, user);
  }
}
