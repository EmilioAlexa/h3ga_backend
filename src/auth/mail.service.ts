
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  constructor(private readonly config: ConfigService) {}

  async sendResetCode(to: string, code: string): Promise<void> {
    const transporter = nodemailer.createTransport({
      host: this.config.getOrThrow<string>('SMTP_HOST'),
      port: Number(this.config.getOrThrow<string>('SMTP_PORT')),
      secure: this.config.get<string>('SMTP_SECURE') === 'true',
      auth: {
        user: this.config.getOrThrow<string>('SMTP_USER'),
        pass: this.config.getOrThrow<string>('SMTP_PASSWORD'),
      },
    });

    try {
      await transporter.sendMail({
        from: this.config.getOrThrow<string>('SMTP_FROM'),
        to,
        subject: 'RUTA H3GA - Recuperación de contraseña',
        text: `Tu código de recuperación es: ${code}. Expira en 10 minutos. Si no solicitaste este cambio, ignora este correo.`,
      });
    } catch {
      throw new InternalServerErrorException(
        'No fue posible enviar el correo de recuperación',
      );
    }
  }
}
