import { z } from 'zod';
import type { FastifyInstance } from 'fastify';

export function registerDemoReset(app: FastifyInstance, reset: () => Promise<void>) {
  app.post('/api/demo/reset', { config: { access: 'public' } }, async (request) => {
    z.strictObject({}).parse(request.body ?? {});
    z.strictObject({}).parse(request.query);
    await reset();
    request.log.info(
      { event: 'demo_reset', actorId: request.persona?.user.id ?? 'visitor' },
      'Demo seed restored',
    );
    return { reset: true };
  });
}
