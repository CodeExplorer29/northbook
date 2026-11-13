import type { FastifyInstance } from 'fastify';

export function registerStreamTest(app: FastifyInstance) {
  app.get('/api/test/echo', { config: { access: 'public' } }, async (request) => ({
    source: 'server',
    requestId: request.id,
    forwardedAddress: request.headers['x-forwarded-for'] ?? null,
  }));
  app.get('/api/test/stream', { config: { access: 'public' } }, (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
      'x-request-id': request.id,
    });
    reply.raw.write(`data: ${JSON.stringify({ sequence: 1, requestId: request.id })}\n\n`);
    const timer = setTimeout(() => {
      reply.raw.end(`data: ${JSON.stringify({ sequence: 2, requestId: request.id })}\n\n`);
    }, 500);
    reply.raw.once('close', () => {
      clearTimeout(timer);
    });
  });
}
