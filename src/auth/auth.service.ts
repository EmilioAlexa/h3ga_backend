import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomInt, createHmac, timingSafeEqual } from 'node:crypto';

import { PrismaService } from '../database/prisma.service';
import { LoginDto } from './dto/login.dto';
import { MailService } from './mail.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  // ==========================================
  // LOGIN
  // ==========================================
  async login(loginDto: LoginDto) {
    const { correo_electronico, contrasena } = loginDto;

    const usuario = await this.prisma.usuarios.findUnique({
      where: { correo_electronico },
    });

    if (!usuario || !usuario.password_hash || !usuario.activo) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const passwordValida = await bcrypt.compare(
      contrasena,
      usuario.password_hash,
    );

    if (!passwordValida) {
      throw new UnauthorizedException('Credenciales inválidas');
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

  // ==========================================
  // SOLICITAR CÓDIGO DE RECUPERACIÓN
  // ==========================================
  async forgotPassword(correo_electronico: string) {
    const mensaje = {
      message:
        'Si el correo está registrado, recibirás un código de recuperación.',
    };

    const usuario = await this.prisma.usuarios.findUnique({
      where: { correo_electronico },
    });

    if (!usuario || !usuario.activo) {
      return mensaje;
    }

    const ultimoCodigo = await this.prisma.password_reset_codes.findFirst({
      where: { usuario_id: usuario.id },
      orderBy: { fecha_creacion: 'desc' },
    });

    if (ultimoCodigo) {
      const diferencia = Date.now() - ultimoCodigo.fecha_creacion.getTime();

      if (diferencia < 60_000) {
        return mensaje;
      }
    }

    const codigo = randomInt(0, 1_000_000).toString().padStart(6, '0');

    const secreto = this.configService.getOrThrow<string>('RESET_CODE_SECRET');

    const codigoHash = createHmac('sha256', secreto)
      .update(`${usuario.id}:${codigo}`)
      .digest('hex');

    await this.prisma.$transaction(async (tx) => {
      await tx.password_reset_codes.updateMany({
        where: {
          usuario_id: usuario.id,
          usado: false,
        },
        data: { usado: true },
      });

      return tx.password_reset_codes.create({
        data: {
          usuario_id: usuario.id,
          codigo_hash: codigoHash,
          fecha_creacion: new Date(),
          expira_en: new Date(Date.now() + 10 * 60_000),
          intentos: 0,
          usado: false,
        },
      });
    });

    await this.mailService.sendResetCode(usuario.correo_electronico, codigo);

    return mensaje;
  }

  // ==========================================
  // RESTABLECER CONTRASEÑA
  // ==========================================
  async resetPassword(
    correo_electronico: string,
    codigo: string,
    nueva_contrasena: string,
  ) {
    const errorCodigo = () =>
      new BadRequestException('Código inválido o expirado');

    if (!/^\d{6}$/.test(codigo) || nueva_contrasena.length < 8) {
      throw new BadRequestException('Datos de recuperación inválidos');
    }

    const usuario = await this.prisma.usuarios.findUnique({
      where: { correo_electronico },
    });

    if (!usuario || !usuario.activo) {
      throw errorCodigo();
    }

    const registro = await this.prisma.password_reset_codes.findFirst({
      where: {
        usuario_id: usuario.id,
        usado: false,
        intentos: { lt: 5 },
        expira_en: { gt: new Date() },
      },
      orderBy: {
        fecha_creacion: 'desc',
      },
    });

    if (!registro) {
      throw errorCodigo();
    }

    if (registro.usado) {
      throw errorCodigo();
    }

    if (registro.intentos >= 5) {
      throw errorCodigo();
    }

    if (registro.expira_en <= new Date()) {
      throw errorCodigo();
    }

    const secreto = this.configService.getOrThrow<string>('RESET_CODE_SECRET');

    const hash = createHmac('sha256', secreto)
      .update(`${usuario.id}:${codigo}`)
      .digest();

    const esperado = Buffer.from(registro.codigo_hash, 'hex');

    const codigoValido =
      hash.length === esperado.length && timingSafeEqual(hash, esperado);

    if (!codigoValido) {
      await this.prisma.password_reset_codes.updateMany({
        where: {
          id: registro.id,
          usado: false,
          intentos: { lt: 5 },
        },
        data: {
          intentos: { increment: 1 },
        },
      });

      throw errorCodigo();
    }

    const password_hash = await bcrypt.hash(nueva_contrasena, 12);

    await this.prisma.$transaction(async (tx) => {
      const resultado = await tx.password_reset_codes.updateMany({
        where: {
          id: registro.id,
          usado: false,
          expira_en: { gt: new Date() },
          intentos: { lt: 5 },
        },
        data: {
          usado: true,
        },
      });

      if (resultado.count !== 1) {
        throw errorCodigo();
      }

      await tx.usuarios.update({
        where: { id: usuario.id },
        data: { password_hash },
      });
    });

    return {
      message: 'Contraseña actualizada correctamente',
    };
  }
}
