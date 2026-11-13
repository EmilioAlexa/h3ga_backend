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

import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

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
@UseGuards(ThrottlerGuard)
@ApiOperation({ summary: 'Solicitar recuperación de contraseña' })
@ApiOkResponse({ description: 'Solicitud de recuperación procesada' })
@Throttle({ default: { limit: 3, ttl: 600000 } })
async forgotPassword(@Body() dto: ForgotPasswordDto) {
  return this.authService.forgotPassword(dto.correo_electronico);
}

@Post('reset-password')
@UseGuards(ThrottlerGuard)
@ApiOperation({ summary: 'Restablecer contraseña' })
@Throttle({ default: { limit: 5, ttl: 600000 } })
@ApiOkResponse({ description: 'Contraseña actualizada correctamente' })
async resetPassword(@Body() dto: ResetPasswordDto) {
  return this.authService.resetPassword(
    dto.correo_electronico,
    dto.codigo,
    dto.nueva_contrasena,
  );
}
}
