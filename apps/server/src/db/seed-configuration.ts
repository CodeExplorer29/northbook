import type { Transaction } from './client.js';
import { settings, spreadBands, venues } from './schema.js';
import { sampleNumber, type readSample } from './sample-data.js';

export async function seedConfiguration(tx: Transaction, sample: Awaited<ReturnType<typeof readSample>>) {
  const config = sample.configuration;
  await tx
    .insert(settings)
    .values({
      id: 'default',
      quoteLifetimeSeconds: config.quoteLifetimeSeconds,
      minimumTradeCad: sampleNumber(config.minimumTrade),
      referenceSpreadBps: String(config.publicReferenceSpreadBps),
    })
    .onConflictDoUpdate({
      target: settings.id,
      set: {
        staleAfterMs: 5000,
        quoteLifetimeSeconds: config.quoteLifetimeSeconds,
        minimumTradeCad: sampleNumber(config.minimumTrade),
        referenceSpreadBps: String(config.publicReferenceSpreadBps),
      },
    });
  await tx.delete(spreadBands);
  await tx
    .insert(spreadBands)
    .values(
      config.spreadsBps.tiers.flatMap(({ tier, values }) =>
        values.map((bps, band) => ({ tier, band, bps: String(bps) })),
      ),
    );
  await tx
    .insert(venues)
    .values([
      { id: 'kraken', feeRate: '0.0026' },
      { id: 'coinbase', feeRate: '0.006' },
      { id: 'binance', feeRate: '0.001' },
    ])
    .onConflictDoUpdate({ target: venues.id, set: { enabled: true } });
}
