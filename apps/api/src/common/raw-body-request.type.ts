import type { FastifyRequest } from 'fastify';

export type RawBodyRequest<TBody = unknown> = FastifyRequest<{ Body: TBody }> & {
  rawBody?: Buffer | string;
};

