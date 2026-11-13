import {
  pairSchema,
  positiveAmountSchema,
  sideSchema,
  type Pair,
  type PublicPriceEvent,
  type Side,
} from '@northbook/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ServerResponse } from 'node:http';
import { z } from 'zod';
import type { Database } from './db/client.js';
import { settings } from './db/schema.js';
import { AppError } from './errors.js';
import { indicativePrice } from './pricing/indicative.js';
import type { PricingService } from './pricing/service.js';

const querySchema = z.strictObject({
  side: sideSchema.default('SELL'),
  amount: positiveAmountSchema.optional(),
});
const streamQuerySchema = querySchema.extend({ pair: pairSchema.optional() });

export function registerPublicPrices(
  app: FastifyInstance,
  database: Database,
  pricing?: Pick<PricingService, 'freshBooks'>,
) {
  const streams = new Set<ServerResponse>();
  app.addHook('preClose', async () => {
    for (const stream of streams) stream.end();
  });
  async function snapshot(pairs: readonly Pair[], side: Side): Promise<PublicPriceEvent[]> {
    const [config] = await database.db.select().from(settings).where(eq(settings.id, 'default'));
    const books = pricing?.freshBooks() ?? [];
    return pairs.map((pair) => {
      try {
        if (!config) throw new AppError('price_unavailable', 'Waiting for price updates.');
        return {
          status: 'ready',
          ...indicativePrice(books, pair, side, {
            spreadBps: config.referenceSpreadBps,
            minimumTradeCad: config.minimumTradeCad,
          }),
        };
      } catch (error) {
        if (!(error instanceof AppError) || error.code !== 'price_unavailable') throw error;
        return {
          status: 'unavailable',
          pair,
          side,
          indicative: true,
          code: 'price_unavailable',
          message: 'Waiting for price updates',
        };
      }
    });
  }
  app.get('/api/public/pairs', { config: { access: 'public' } }, async () => pairSchema.options);
  app.get('/api/public/prices/:pair', { config: { access: 'public' } }, async (request, reply) => {
    const { pair } = z.strictObject({ pair: pairSchema }).parse(request.params);
    const { side } = querySchema.parse(request.query);
    const [price] = await snapshot([pair], side);
    const { status, ...result } = price!;
    if (status === 'unavailable') throw new AppError('price_unavailable', 'Waiting for price updates.');
    reply.header('cache-control', 'no-store');
    return result;
  });
  app.get('/api/public/prices/stream', { config: { access: 'public' } }, (request, reply) => {
    const { pair, side } = streamQuerySchema.parse(request.query);
    const pairs = pair ? [pair] : pairSchema.options;
    reply.hijack();
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
      'x-request-id': request.id,
    });
    streams.add(reply.raw);
    let running = false;
    let closed = false;
    let backpressure = false;
    reply.raw.on('drain', () => {
      backpressure = false;
    });
    async function send() {
      if (running || closed || backpressure) return;
      running = true;
      try {
        let events: PublicPriceEvent[];
        try {
          events = await snapshot(pairs, side);
        } catch (error) {
          request.log.error({ err: error }, 'Indicative price snapshot failed');
          events = pairs.map((pair) => ({
            status: 'unavailable',
            pair,
            side,
            indicative: true,
            code: 'price_unavailable',
            message: 'Waiting for price updates',
          }));
        }
        if (closed) return;
        backpressure = !reply.raw.write(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''));
      } finally {
        running = false;
      }
    }
    const timer = setInterval(() => {
      void send();
    }, 2000);
    reply.raw.once('close', () => {
      closed = true;
      clearInterval(timer);
      streams.delete(reply.raw);
    });
    void send();
  });
}
