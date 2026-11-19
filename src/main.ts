import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { setupSwagger } from './config/swagger.config';
import { PrismaService } from './database/prisma.service';

function localIntegrationPort(value: string | undefined, name: string): number {
  if (!value || !/^\d{1,5}$/.test(value)) {
    throw new Error(`${name} debe ser un puerto explícito válido`);
  }
  const port = Number(value);
  if (port < 1 || port > 65535) {
    throw new Error(`${name} debe estar entre 1 y 65535`);
  }
  return port;
}

function assertLocalIntegrationUrl(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('La integración local requiere NODE_ENV=test');
  }
  let url: URL;
  try {
    url = new URL(process.env.DATABASE_URL ?? '');
  } catch {
    throw new Error('DATABASE_URL de integración inválida');
  }
  if (
    !['postgresql:', 'postgres:'].includes(url.protocol) ||
    url.hostname !== 'localhost' ||
    url.port !== '5433' ||
    url.pathname !== '/h3ga_finanzas_test' ||
    url.searchParams.get('schema') !== 'public'
  ) {
    throw new Error('La integración local solo admite PostgreSQL Test en localhost:5433/public');
  }
}

async function bootstrap() {
  const localIntegration = process.env.H3GA_LOCAL_INTEGRATION === '1';
  if (localIntegration) assertLocalIntegrationUrl();
  const port = localIntegration
    ? localIntegrationPort(process.env.PORT, 'PORT')
    : process.env.PORT ?? 3000;
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (localIntegration) {
    const webPort = localIntegrationPort(process.env.FLUTTER_WEB_PORT, 'FLUTTER_WEB_PORT');
    app.enableCors({
      origin: [
        `http://localhost:${webPort}`,
        `http://127.0.0.1:${webPort}`,
      ],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Accept', 'Authorization', 'Content-Type'],
      credentials: false,
    });
    await app.init();
    const [identity] = await app.get(PrismaService).$queryRaw<
      { database: string; schema: string; port: number; address: string }[]
    >`SELECT current_database() AS database, current_schema() AS schema,
      inet_server_port() AS port, host(inet_server_addr()) AS address`;
    if (
      identity?.database !== 'h3ga_finanzas_test' ||
      identity.schema !== 'public' ||
      identity.port !== 5433 ||
      !['127.0.0.1', '::1'].includes(identity.address)
    ) {
      await app.close();
      throw new Error('La identidad efectiva de PostgreSQL no coincide con Test');
    }
  }

  const configService = app.get(ConfigService);
  if (configService.get<boolean>('swagger.enabled', false)) {
    setupSwagger(app);
  }

  if (localIntegration) {
    await app.listen(port, '127.0.0.1');
  } else {
    await app.listen(port);
  }
}
void bootstrap();

