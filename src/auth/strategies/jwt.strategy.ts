import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret')!,
    });
  }

  async validate(payload: {
    sub: string;
    rol_id: number;
  }) {
    const usuario = await this.prisma.usuarios.findUnique({
      where: {
        id: payload.sub,
      },
      select: {
        id: true,
        rol_id: true,
        nombre: true,
        apellido_paterno: true,
        apellido_materno: true,
        correo_electronico: true,
        activo: true,
      },
    });

    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException(
        'Sesión no válida',
      );
    }

    return usuario;
  }
}