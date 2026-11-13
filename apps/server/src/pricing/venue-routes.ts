import { z } from 'zod';
import {
  venueConfigurationSchema,
  venueHealthSchema,
  venueIdSchema,
  venueUpdateSchema,
} from '@northbook/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../db/client.js';
import { settings, venues } from '../db/schema.js';
import { AppError } from '../errors.js';
import type { PricingService } from './service.js';

export function registerVenueRoutes(
  app: FastifyInstance,
  database: Database,
  pricing?: Pick<PricingService, 'health' | 'refreshConfiguration'>,
) {
  app.get('/api/staff/venues', { config: { access: 'staff' } }, async () =>
    venueHealthSchema.array().parse(
      pricing
        ? pricing.health()
        : (await database.db.select().from(venues)).map((venue) => ({
            ...venue,
            status: venue.enabled ? 'disconnected' : 'disabled',
            lastUpdate: null,
            markets: 0,
            readyMarkets: 0,
            replayed: false,
            staleAfterMs: 5000,
          })),
    ),
  );
  app.put('/api/staff/venues/:id', { config: { access: 'staff' } }, async (request) => {
    const { id } = z.strictObject({ id: venueIdSchema }).parse(request.params);
    z.strictObject({}).parse(request.query);
    const input = venueUpdateSchema.parse(request.body);
    const [row] = await database.db.transaction(async (tx) => {
      await tx.select().from(settings).where(eq(settings.id, 'default')).for('update');
      return tx.update(venues).set(input).where(eq(venues.id, id)).returning();
    });
    if (!row) throw new AppError('not_found', 'Venue not found.');
    await pricing?.refreshConfiguration();
    request.log.info(
      { event: 'venue_configured', venue: id, enabled: input.enabled },
      'Venue configuration changed',
    );
    return venueConfigurationSchema.parse(row);
  });
}
