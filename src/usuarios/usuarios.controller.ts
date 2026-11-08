import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../roles/decorators/roles.decorator';
import { RolesGuard } from '../roles/guards/roles.guard';
import { ChangeUsuarioRoleDto } from './dto/change-usuario-role.dto';
import { ChangeUsuarioStatusDto } from './dto/change-usuario-status.dto';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { UsuariosService } from './usuarios.service';
import { UsuarioRespuestaDto } from '../openapi/response-models.dto';

interface AuthenticatedUser {
  id: string;
}

@Controller('usuarios')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador')
@ApiTags('Usuarios')
@ApiBearerAuth('jwt')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Get()
  @ApiOperation({ summary: 'Listar usuarios', description: 'Acceso exclusivo para el administrador. La respuesta no incluye contraseñas ni hashes.' })
  @ApiOkResponse({ description: 'Usuarios ordenados por apellido y nombre.', type: [UsuarioRespuestaDto] })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'El usuario no tiene el rol administrador.' })
  findAll() {
    return this.usuariosService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar un usuario', description: 'Acceso exclusivo para el administrador. No expone credenciales.' })
  @ApiParam({ name: 'id', description: 'UUID del usuario.' })
  @ApiOkResponse({ description: 'Perfil público del usuario.', type: UsuarioRespuestaDto })
  @ApiNotFoundResponse({ description: 'Usuario no encontrado.' })
  @ApiBadRequestResponse({ description: 'El identificador no es un UUID válido.' })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'El usuario no tiene el rol administrador.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usuariosService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear un usuario', description: 'Acceso exclusivo para el administrador.' })
  @ApiCreatedResponse({ description: 'Usuario creado; no devuelve contraseña ni hash.', type: UsuarioRespuestaDto })
  @ApiConflictResponse({ description: 'El correo electrónico ya está registrado.' })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'El usuario no tiene el rol administrador.' })
  @ApiBadRequestResponse({ description: 'El cuerpo de la solicitud no cumple las validaciones.' })
  create(@Body() createUsuarioDto: CreateUsuarioDto) {
    return this.usuariosService.create(createUsuarioDto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar datos de un usuario', description: 'Acceso exclusivo para el administrador. No permite cambiar el rol ni el estado por esta ruta.' })
  @ApiParam({ name: 'id', description: 'UUID del usuario.' })
  @ApiOkResponse({ description: 'Perfil público actualizado.', type: UsuarioRespuestaDto })
  @ApiNotFoundResponse({ description: 'Usuario no encontrado.' })
  @ApiConflictResponse({ description: 'El correo electrónico ya está registrado.' })
  @ApiBadRequestResponse({ description: 'El identificador no es un UUID válido o el cuerpo no contiene campos válidos.' })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'El usuario no tiene el rol administrador.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUsuarioDto: UpdateUsuarioDto,
  ) {
    return this.usuariosService.update(id, updateUsuarioDto);
  }

  @Patch(':id/rol')
  @ApiOperation({ summary: 'Cambiar el rol de un usuario', description: 'Acceso exclusivo para el administrador. No permite cambiar el propio rol.' })
  @ApiParam({ name: 'id', description: 'UUID del usuario cuyo rol se actualizará.' })
  @ApiOkResponse({ description: 'Perfil público actualizado.', type: UsuarioRespuestaDto })
  @ApiNotFoundResponse({ description: 'Usuario o rol no encontrado.' })
  @ApiBadRequestResponse({ description: 'El identificador no es un UUID válido, el rol indicado no existe o se intenta cambiar el acceso propio.' })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'El usuario no tiene el rol administrador.' })
  changeRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changeUsuarioRoleDto: ChangeUsuarioRoleDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.usuariosService.changeRole(
      id,
      changeUsuarioRoleDto.rol_id,
      currentUser.id,
    );
  }

  @Patch(':id/estado')
  @ApiOperation({ summary: 'Cambiar el estado de un usuario', description: 'Acceso exclusivo para el administrador. No permite cambiar el propio estado.' })
  @ApiParam({ name: 'id', description: 'UUID del usuario cuyo estado se actualizará.' })
  @ApiOkResponse({ description: 'Perfil público actualizado.', type: UsuarioRespuestaDto })
  @ApiNotFoundResponse({ description: 'Usuario no encontrado.' })
  @ApiBadRequestResponse({ description: 'El identificador no es válido, el estado no cumple las validaciones o se intenta cambiar el estado propio.' })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  @ApiForbiddenResponse({ description: 'El usuario no tiene el rol administrador.' })
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changeUsuarioStatusDto: ChangeUsuarioStatusDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.usuariosService.changeStatus(
      id,
      changeUsuarioStatusDto.activo,
      currentUser.id,
    );
  }
}
