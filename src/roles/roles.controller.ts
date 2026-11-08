import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolRespuestaDto } from '../openapi/response-models.dto';
import { Roles } from './decorators/roles.decorator';
import { RolesGuard } from './guards/roles.guard';
import { RolesService } from './roles.service';

@Controller('roles')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('Roles')
@ApiBearerAuth('jwt')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @Roles('administrador')
  @ApiOperation({ summary: 'Listar roles', description: 'Acceso exclusivo para el rol administrador.' })
  @ApiOkResponse({ description: 'Roles disponibles.', type: [RolRespuestaDto] })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'El usuario no tiene el rol administrador.' })
  findAll() {
    return this.rolesService.findAll();
  }
}
