import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') || 3000;
  const apiPrefix = configService.get<string>('apiPrefix') || 'api/v1';

  // Security Headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: [`'self'`],
          styleSrc: [`'self'`, `'unsafe-inline'`],
          imgSrc: [`'self'`, 'data:', 'blob:', 'validator.swagger.io'],
          scriptSrc: [`'self'`, `'unsafe-inline'`],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Cookie parser
  app.use(cookieParser());

  // CORS Configuration
  const corsOrigin = configService.get<string | string[]>('corsOrigin');
  app.enableCors({
    origin: corsOrigin === '*' ? true : corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  // Global Prefix (e.g. /api/v1)
  app.setGlobalPrefix(apiPrefix);

  // Global DTO Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Swagger OpenAPI Setup
  const config = new DocumentBuilder()
    .setTitle('CarePath Health Vault API')
    .setDescription(
      'CarePath Milestone 1: Patient Health Vault - Enterprise-grade secure healthcare record management API with server-side RBAC, encrypted private storage, and OCR metadata extraction.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter your JWT access token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('Auth', 'Authentication, registration, sessions, and password recovery')
    .addTag('Users', 'Current user identity and account status')
    .addTag('Patients', 'Patient profile and health vault information')
    .addTag('Documents', 'Medical records upload, metadata, and signed temporary URLs')
    .addTag('Doctor Platform', 'Physician profiles, verification, and clinical consultations')
    .addTag('Consents & Secure Sharing', 'Granular consent authorization and access management')
    .addTag('Laboratory Platform', 'Diagnostic lab onboarding, test catalog, orders, specimen tracking, and reports')
    .addTag('Audit', 'Immutable compliance and security audit logs')
    .addTag('Health', 'System and database health checks')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  await app.listen(port);
  logger.log(`=======================================================`);
  logger.log(` CarePath Backend (Milestone 1) is running on port ${port}`);
  logger.log(` REST API Base:      http://localhost:${port}/${apiPrefix}`);
  logger.log(` Swagger Docs:       http://localhost:${port}/${apiPrefix}/docs`);
  logger.log(` Health Check:       http://localhost:${port}/${apiPrefix}/health`);
  logger.log(`=======================================================`);
}

bootstrap();
