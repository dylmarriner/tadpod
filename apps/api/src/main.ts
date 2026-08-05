import 'reflect-metadata';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { loadEnvironment } from '@tadpods/config';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const environment = loadEnvironment(process.env);
  const adapter = new FastifyAdapter({ logger: environment.nodeEnv !== 'test', bodyLimit: 2 * 1024 * 1024 });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, { bufferLogs: true });
  await app.register(cookie, { secret: environment.authSecret });
  await app.register(cors, { origin: environment.corsOrigin, credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] });
  await app.register(helmet, { contentSecurityPolicy: false });
  app.getHttpAdapter().getInstance().addHook('onRequest', (request, reply, done) => {
    reply.header('x-request-id', request.id);
    done();
  });
  app.enableShutdownHooks();
  await app.listen(environment.apiPort, '0.0.0.0');
}

bootstrap().catch((error: unknown) => {
  console.error('TADPODS API failed to start', error);
  process.exitCode = 1;
});
