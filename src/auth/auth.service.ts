
import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import {
  randomInt,
  createHmac,
  timingSafeEqual,
} from 'node:crypto';

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
    console.log('[FORGOT] Entró a forgotPassword');

    const mensaje = {
      message:
        'Si el correo está registrado, recibirás un código de recuperación.',
    };

    const usuario = await this.prisma.usuarios.findUnique({
      where: { correo_electronico },
    });

    if (!usuario || !usuario.activo) {
      console.log('[FORGOT] Usuario inexistente o inactivo');
      return mensaje;
    }

    console.log('[FORGOT] Usuario activo encontrado');

    const ultimoCodigo =
      await this.prisma.password_reset_codes.findFirst({
        where: { usuario_id: usuario.id },
        orderBy: { fecha_creacion: 'desc' },
      });

    if (ultimoCodigo) {
      const diferencia =
        Date.now() - ultimoCodigo.fecha_creacion.getTime();

      console.log('[FORGOT] Hora Node:', new Date().toISOString());
      console.log(
        '[FORGOT] Última creación Prisma:',
        ultimoCodigo.fecha_creacion.toISOString(),
      );
      console.log(
        '[FORGOT] Diferencia entre solicitudes (ms):',
        diferencia,
      );

      // Diagnóstico local: no bloquear por una fecha futura.
      // No conservar esta excepción en producción.
      if (diferencia >= 0 && diferencia < 60_000) {
        console.log('[FORGOT] Solicitud limitada a 60 segundos');
        return mensaje;
      }
    }

    const codigo = randomInt(0, 1_000_000)
      .toString()
      .padStart(6, '0');

    const secreto =
      this.configService.getOrThrow<string>('RESET_CODE_SECRET');

    const codigoHash = createHmac('sha256', secreto)
      .update(`${usuario.id}:${codigo}`)
      .digest('hex');

    console.log('[FORGOT] Guardando código en PostgreSQL');

    const nuevoRegistro = await this.prisma.$transaction(
      async (tx) => {
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
      },
    );

    console.log('[FORGOT] Código guardado');
    console.log(
      '[FORGOT] Creación Prisma:',
      nuevoRegistro.fecha_creacion.toISOString(),
    );
    console.log(
      '[FORGOT] Expiración Prisma:',
      nuevoRegistro.expira_en.toISOString(),
    );

    console.log('[FORGOT] Intentando enviar correo');

    await this.mailService.sendResetCode(
      usuario.correo_electronico,
      codigo,
    );

    console.log('[FORGOT] Solicitud SMTP completada');

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
    console.log('[RESET] Entró a resetPassword');

    const errorCodigo = () =>
      new BadRequestException('Código inválido o expirado');

    if (!/^\d{6}$/.test(codigo) || nueva_contrasena.length < 8) {
      throw new BadRequestException(
        'Datos de recuperación inválidos',
      );
    }

    const usuario = await this.prisma.usuarios.findUnique({
      where: { correo_electronico },
    });

    if (!usuario || !usuario.activo) {
      console.log('[RESET] Usuario inexistente o inactivo');
      throw errorCodigo();
    }

    // Consultar el último registro para diagnosticar su estado.
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

    console.log('[RESET] Hora Node:', new Date().toISOString());
    console.log(
      '[RESET] Expiración Prisma:',
      registro?.expira_en.toISOString(),
    );
    console.log(
      '[RESET] Creación Prisma:',
      registro?.fecha_creacion.toISOString(),
    );
    console.log('[RESET] Código usado:', registro?.usado);
    console.log('[RESET] Intentos:', registro?.intentos);

    if (!registro) {
      console.log('[RESET] No existe registro de recuperación');
      throw errorCodigo();
    }

    if (registro.usado) {
      console.log('[RESET] El código ya fue utilizado');
      throw errorCodigo();
    }

    if (registro.intentos >= 5) {
      console.log('[RESET] Se alcanzó el límite de intentos');
      throw errorCodigo();
    }

    if (registro.expira_en <= new Date()) {
      console.log('[RESET] El código está expirado');
      throw errorCodigo();
    }

    const secreto =
      this.configService.getOrThrow<string>('RESET_CODE_SECRET');

    const hash = createHmac('sha256', secreto)
      .update(`${usuario.id}:${codigo}`)
      .digest();

    const esperado = Buffer.from(registro.codigo_hash, 'hex');

    const codigoValido =
      hash.length === esperado.length &&
      timingSafeEqual(hash, esperado);

    console.log('[RESET] ¿Coincide el código?', codigoValido);

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

    const password_hash = await bcrypt.hash(
      nueva_contrasena,
      12,
    );

    await this.prisma.$transaction(async (tx) => {
      const resultado =
        await tx.password_reset_codes.updateMany({
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
        console.log('[RESET] No se pudo consumir el código');
        throw errorCodigo();
      }

      await tx.usuarios.update({
        where: { id: usuario.id },
        data: { password_hash },
      });
    });

    console.log('[RESET] Contraseña actualizada correctamente');

    return {
      message: 'Contraseña actualizada correctamente',
    };
  }
}
