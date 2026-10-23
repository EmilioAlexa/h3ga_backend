import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../database/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto) {
    const { correo_electronico, contrasena } = loginDto;

    const usuario = await this.prisma.usuarios.findUnique({
      where: {
        correo_electronico,
      },
    });

    if (!usuario || !usuario.password_hash) {
      throw new UnauthorizedException(
        'Credenciales inválidas',
      );
    }

    if (!usuario.activo) {
      throw new UnauthorizedException(
        'Credenciales inválidas',
      );
    }

    const passwordValida = await bcrypt.compare(
      contrasena,
      usuario.password_hash,
    );

    if (!passwordValida) {
      throw new UnauthorizedException(
        'Credenciales inválidas',
      );
    }

    const payload = {
      sub: usuario.id,
      rol_id: usuario.rol_id,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      access_token: accessToken,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        apellido_paterno: usuario.apellido_paterno,
        apellido_materno: usuario.apellido_materno,
        correo_electronico: usuario.correo_electronico,
        rol_id: usuario.rol_id,
      },
    };
  }
}