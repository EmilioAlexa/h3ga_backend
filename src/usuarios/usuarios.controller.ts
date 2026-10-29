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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../roles/decorators/roles.decorator';
import { RolesGuard } from '../roles/guards/roles.guard';
import { ChangeUsuarioRoleDto } from './dto/change-usuario-role.dto';
import { ChangeUsuarioStatusDto } from './dto/change-usuario-status.dto';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { UsuariosService } from './usuarios.service';

interface AuthenticatedUser {
  id: string;
}

@Controller('usuarios')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Get()
  findAll() {
    return this.usuariosService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usuariosService.findOne(id);
  }

  @Post()
  create(@Body() createUsuarioDto: CreateUsuarioDto) {
    return this.usuariosService.create(createUsuarioDto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUsuarioDto: UpdateUsuarioDto,
  ) {
    return this.usuariosService.update(id, updateUsuarioDto);
  }

  @Patch(':id/rol')
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
