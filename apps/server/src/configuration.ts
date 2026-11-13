import { createHash } from 'node:crypto';
import { configurationSchema, configurationUpdateSchema, emptyRequestSchema, Money } from '@northbook/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Database, Transaction } from './db/client.js';
import { organisations, settings, spreadBands, venues } from './db/schema.js';
import { AppError } from './errors.js';
import type { PricingService } from './pricing/service.js';

async function readConfiguration(tx: Transaction) {
  const [config] = await tx.select().from(settings).where(eq(settings.id, 'default'));
  if (!config) throw new AppError('internal_error', 'Pricing settings are unavailable.');
  const spreadRows = await tx.select().from(spreadBands).orderBy(spreadBands.tier, spreadBands.band);
  const orgRows = await tx.select().from(organisations).orderBy(organisations.id);
  const venueRows = await tx
    .select({ id: venues.id, enabled: venues.enabled })
    .from(venues)
    .orderBy(venues.id);
  const values = {
    settings: {
      quoteLifetimeSeconds: config.quoteLifetimeSeconds,
      minimumTradeCad: new Money(config.minimumTradeCad).toFixed(),
      referenceSpreadBps: new Money(config.referenceSpreadBps).toFixed(),
    },
    spreadBands: spreadRows.map((row) => ({ ...row, bps: new Money(row.bps).toFixed() })),
    organisations: orgRows.map((row) => ({ ...row, maxTradeSize: new Money(row.maxTradeSize).toFixed() })),
    venues: venueRows,
  };
  // Names and KYB status may change independently; this save never writes them.
  const revision = createHash('sha256')
    .update(
      JSON.stringify({
        ...values,
        organisations: values.organisations.map(({ id, tier, maxTradeSize }) => ({ id, tier, maxTradeSize })),
      }),
    )
    .digest('hex');
  return configurationSchema.parse({ ...values, revision });
}
export function registerConfiguration(
  app: FastifyInstance,
  database: Database,
  pricing?: Pick<PricingService, 'refreshConfiguration'>,
) {
  app.get('/api/staff/config', { config: { access: 'staff' } }, () =>
    database.db.transaction(readConfiguration, {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    }),
  );
  app.put('/api/staff/config', { config: { access: 'staff' } }, async (request) => {
    emptyRequestSchema.parse(request.query);
    const input = configurationUpdateSchema.parse(request.body);
    const result = await database.db.transaction(async (tx) => {
      await tx.select().from(settings).where(eq(settings.id, 'default')).for('update');
      const current = await readConfiguration(tx);
      if (current.revision !== input.revision)
        throw new AppError(
          'configuration_conflict',
          'Configuration changed since you loaded it. Discard your draft to load the current values before editing again.',
        );
      if (
        current.organisations
          .map((org) => org.id)
          .sort()
          .join('|') !==
        input.organisations
          .map((org) => org.id)
          .sort()
          .join('|')
      )
        throw new AppError('validation_failed', 'Provide every existing organisation exactly once.');
      await tx.update(settings).set(input.settings).where(eq(settings.id, 'default'));
      for (const row of input.spreadBands)
        await tx
          .update(spreadBands)
          .set({ bps: row.bps })
          .where(and(eq(spreadBands.tier, row.tier), eq(spreadBands.band, row.band)));
      for (const { id, ...values } of input.organisations)
        await tx.update(organisations).set(values).where(eq(organisations.id, id));
      for (const row of input.venues)
        await tx.update(venues).set({ enabled: row.enabled }).where(eq(venues.id, row.id));
      return readConfiguration(tx);
    });
    // Finish a pre-write poll before starting a new read of the committed save.
    // A transient feed refresh failure cannot undo the committed configuration.
    await pricing?.refreshConfiguration().catch(() => {});
    await pricing
      ?.refreshConfiguration()
      .catch((err: unknown) => request.log.error({ err }, 'Saved configuration; venue refresh will retry'));
    request.log.info(
      { event: 'pricing_configured', revision: result.revision },
      'Pricing configuration saved',
    );
    return result;
  });
}
