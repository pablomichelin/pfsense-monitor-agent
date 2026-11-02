import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { appConfig } from './config/app-config';
import { registerJsonBodyParser } from './auth/json-body-parser';

async function bootstrap(): Promise<void> {
  // C5: trust proxy restrito ao proxy local. Quando TRUST_PROXY=true e ha lista
  // TRUSTED_PROXY_IPS, o Fastify so deriva request.ip de X-Forwarded-For para
  // conexoes vindas desses IPs; sem lista, confia no proxy configurado.
  const trustProxyOption: boolean | string[] = appConfig.trustProxy
    ? appConfig.trustedProxyIps.length > 0
      ? appConfig.trustedProxyIps
      : true
    : false;

  const fastifyAdapter = new FastifyAdapter({
    trustProxy: trustProxyOption,
    bodyLimit: Math.max(
      appConfig.heartbeat.maxPayloadBytes,
      appConfig.configBackup.maxBytes,
    ),
  });

  registerJsonBodyParser(fastifyAdapter);
  const instance = fastifyAdapter.getInstance();
  instance.addContentTypeParser(
    ['application/xml', 'application/gzip'],
    { parseAs: 'buffer' },
    (request, body, done) => {
      const rawBody = Buffer.isBuffer(body) ? body : Buffer.from(body);
      (request as { rawBody?: Buffer }).rawBody = rawBody;
      done(null, rawBody);
    },
  );

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    fastifyAdapter,
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
