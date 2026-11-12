import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../database/prisma.service';
import { LoginDto } from './dto/login.dto';

import { randomInt, createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

import { BadRequestException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
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
  async forgotPassword(correo_electronico: string) {
  const mensaje = {
    message: 'Si el correo está registrado, recibirás un código de recuperación.',
  };

  const usuario = await this.prisma.usuarios.findUnique({
    where: { correo_electronico },
  });

  if (!usuario || !usuario.activo) {
    return mensaje;
  }

  const codigo = randomInt(0, 1_000_000)
    .toString()
    .padStart(6, '0');

  const secreto = this.configService.getOrThrow<string>('RESET_CODE_SECRET');

  const codigoHash = createHmac('sha256', secreto)
    .update(`${usuario.id}:${codigo}`)
    .digest('hex');

  await this.prisma.password_reset_codes.deleteMany({
    where: { usuario_id: usuario.id },
  });

  await this.prisma.password_reset_codes.create({
    data: {
      usuario_id: usuario.id,
      codigo_hash: codigoHash,
      expira_en: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  await this.mailService.sendResetCode(
    usuario.correo_electronico,
    codigo,
  );

  return mensaje;
}
async resetPassword(
  correo_electronico: string,
  codigo: string,
  nueva_contrasena: string,
) {
  if (!/^\d{6}$/.test(codigo) || nueva_contrasena.length < 8) {
    throw new BadRequestException('Datos de recuperación inválidos');
  }

  const usuario = await this.prisma.usuarios.findUnique({
    where: { correo_electronico },
  });

  if (!usuario || !usuario.activo) {
    throw new BadRequestException('Código inválido o expirado');
  }

  const registro = await this.prisma.password_reset_codes.findFirst({
    where: {
      usuario_id: usuario.id,
      usado: false,
      expira_en: { gt: new Date() },
      intentos: { lt: 5 },
    },
    orderBy: { fecha_creacion: 'desc' },
  });

  if (!registro) {
    throw new BadRequestException('Código inválido o expirado');
  }

  const secreto = this.configService.getOrThrow<string>('RESET_CODE_SECRET');

  const hash = createHmac('sha256', secreto)
    .update(`${usuario.id}:${codigo}`)
    .digest();

  const esperado = Buffer.from(registro.codigo_hash, 'hex');

  if (
    hash.length !== esperado.length ||
    !timingSafeEqual(hash, esperado)
  ) {
    await this.prisma.password_reset_codes.update({
      where: { id: registro.id },
      data: { intentos: { increment: 1 } },
    });

    throw new BadRequestException('Código inválido o expirado');
  }

  const password_hash = await bcrypt.hash(nueva_contrasena, 12);

  await this.prisma.$transaction([
    this.prisma.usuarios.update({
      where: { id: usuario.id },
      data: { password_hash },
    }),
    this.prisma.password_reset_codes.update({
      where: { id: registro.id },
      data: { usado: true },
    }),
  ]);

  return { message: 'Contraseña actualizada correctamente' };
}
}