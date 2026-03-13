import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { appConfig } from './config/app-config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      bodyLimit: appConfig.heartbeat.maxPayloadBytes,
    }),
    {
      rawBody: true,
      bufferLogs: true,
    },
  );

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
  app.enableShutdownHooks();

  await app.listen({
    host: '0.0.0.0',
    port: appConfig.port,
  });

  const logger = new Logger('Bootstrap');
  logger.log(`Monitor-Pfsense API listening on 0.0.0.0:${appConfig.port}`);
}

void bootstrap();
