import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import 'reflect-metadata';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const configService = app.get(ConfigService);

  const apiPrefix = configService.get<string>('API_PREFIX', 'api/v1');
  const apiPort = configService.get<number>('API_PORT', 3001);
  const corsOrigins = configService
    .get<string>('CORS_ORIGINS', 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.setGlobalPrefix(apiPrefix);
  app.use(helmet());
  app.use(cookieParser());

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  if (configService.get<string>('NODE_ENV') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Client Document Chaser API')
      .setDescription(
        'Multi-tenant document collection, review, and reminder workflow API',
      )
      .setVersion('1.0.0')
      .addCookieAuth('cdc_access')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(apiPort, '0.0.0.0');
  console.warn(
    `Client Document Chaser API listening on http://0.0.0.0:${apiPort}/${apiPrefix}`,
  );
}

bootstrap().catch((err: unknown) => {
  console.error('Failed to bootstrap API:', err);
  process.exit(1);
});
