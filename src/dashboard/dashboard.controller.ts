import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../roles/decorators/roles.decorator';
import { RolesGuard } from '../roles/guards/roles.guard';
import { DashboardService } from './dashboard.service';
import type { AuthenticatedUser } from './dashboard.service';
import { DashboardQueryDto, LIMITE_POR_OMISION } from './dto/dashboard-query.dto';
import { DashboardRespuesta } from './dto/dashboard-respuesta.dto';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador', 'asesor', 'auxiliar administrativo')
@ApiTags('dashboard')
@ApiBearerAuth('jwt')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}
  @Get()
  @ApiOperation({ summary: 'Dashboard operativo según el alcance del usuario' })
  @ApiOkResponse({ type: DashboardRespuesta })
  @ApiBadRequestResponse({ description: 'limite debe ser un entero entre 1 y 50.' })
  @ApiUnauthorizedResponse({ description: 'JWT requerido.' })
  @ApiForbiddenResponse({ description: 'Rol sin acceso al Dashboard.' })
  obtener(@CurrentUser() usuario: AuthenticatedUser, @Query() consulta: DashboardQueryDto): Promise<DashboardRespuesta> {
    return this.service.obtener(usuario, consulta.limite ?? LIMITE_POR_OMISION);
  }
}
