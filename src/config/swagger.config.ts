import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('H3GA API')
    .setDescription(
      'API REST de H3GA. Los permisos por rol indicados en cada operación se aplican también al probarla desde Swagger.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'jwt',
    )
    .build();

  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, documentFactory, {
    useGlobalPrefix: true,
    jsonDocumentUrl: 'docs-json',
    ui: true,
    raw: ['json'],
  });
}
