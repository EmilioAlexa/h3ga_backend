import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import {
  LoginRespuestaDto,
  UsuarioActualRespuestaDto,
} from '../openapi/response-models.dto';

@Controller('auth')
@ApiTags('Autenticación')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({
    summary: 'Iniciar sesión',
    description: 'Autentica con correo y contraseña; operación pública.',
  })
  @ApiOkResponse({
    description:
      'Credenciales válidas; devuelve access_token y perfil público.',
    type: LoginRespuestaDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Credenciales inválidas o cuenta inactiva.',
  })
  @ApiBadRequestResponse({
    description: 'El correo o la contraseña no cumplen las validaciones.',
  })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'Consultar la sesión actual',
    description: 'Requiere un JWT válido.',
  })
  @ApiOkResponse({
    description: 'Usuario autenticado y rol actual.',
    type: UsuarioActualRespuestaDto,
  })
  @ApiUnauthorizedResponse({ description: 'Falta un JWT válido.' })
  getCurrentUser(@CurrentUser() usuario: unknown) {
    return usuario;
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Solicitar recuperación de contraseña' })
  @ApiOkResponse({ description: 'Solicitud de recuperación procesada' })
  async forgotPassword(@Body('correo_electronico') correo_electronico: string) {
    return this.authService.forgotPassword(correo_electronico);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Restablecer contraseña' })
  @ApiOkResponse({ description: 'Contraseña actualizada correctamente' })
  async resetPassword(
    @Body('correo_electronico') correo_electronico: string,
    @Body('codigo') codigo: string,
    @Body('nueva_contrasena') nueva_contrasena: string,
  ) {
    return this.authService.resetPassword(
      correo_electronico,
      codigo,
      nueva_contrasena,
    );
  }
}
