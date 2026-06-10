import 'reflect-metadata';
import { Readable } from 'stream';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { appConfig } from './config/app-config';

async function bootstrap(): Promise<void> {
  const fastifyAdapter = new FastifyAdapter({
    bodyLimit: Math.max(
      appConfig.heartbeat.maxPayloadBytes,
      appConfig.configBackup.maxBytes,
    ),
  });

  // POST/DELETE com application/json e body vazio: Fastify rejeita. Injetar '{}' para evitar erro.
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
  instance.addHook('preParsing', (request, _reply, payload, done) => {
    const contentType = request.headers['content-type']?.toLowerCase();
    const contentLength = request.headers['content-length'];
    const noBody = contentLength === '0' || contentLength === undefined;
    if (
      (request.method === 'POST' || request.method === 'DELETE') &&
      contentType?.startsWith('application/json') &&
      noBody
    ) {
      done(null, Readable.from([Buffer.from('{}', 'utf8')]));
      return;
    }
    done(null, payload);
  });

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
