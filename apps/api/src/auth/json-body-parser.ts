import { FastifyAdapter } from '@nestjs/platform-fastify';

/** Keep the actual bytes (including chunked/HMAC bodies); normalize only EOF at zero bytes. */
export function registerJsonBodyParser(adapter: FastifyAdapter): void {
  // Register Nest's other parsers and prevent initialization from replacing ours.
  adapter.registerParserMiddleware('', true);
  const instance = adapter.getInstance();
  const parser = instance.getDefaultJsonParser('error', 'error');
  instance.removeContentTypeParser('application/json');
  instance.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
    (request as typeof request & { rawBody?: Buffer }).rawBody = bytes;
    if (bytes.length === 0 && (request.method === 'POST' || request.method === 'DELETE')) {
      done(null, {});
      return;
    }
    parser(request, bytes.toString('utf8'), done);
  });
}
