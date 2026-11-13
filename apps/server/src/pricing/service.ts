import type { FastifyBaseLogger } from 'fastify';
import { eq } from 'drizzle-orm';
import type { QuoteRequest } from '@northbook/shared';
import type { Database } from '../db/client.js';
import { settings, venues } from '../db/schema.js';
import { createKrakenAdapter } from './kraken.js';
import { createCoinbaseAdapter } from './coinbase.js';
import { createBinanceAdapter } from './binance.js';
import { readRecording } from './recording.js';
import { selectRoute } from './routes.js';
import type { VenueAdapter, VenueId } from './venue.js';
import type { PricedBook } from './depth.js';

export type PricingMode = 'live' | 'replay';
export type AdapterFactory = (id: VenueId, feeRate: string) => Promise<VenueAdapter>;
export function pricingMode(value: string | undefined): PricingMode {
  const mode = value ?? 'replay';
  if (mode !== 'live' && mode !== 'replay') throw new Error('PRICING_MODE must be live or replay.');
  return mode;
}
export function adapterFactory(mode: PricingMode): AdapterFactory {
  return async (id, feeRate) => {
    const recording =
      mode === 'replay'
        ? await readRecording(
            new URL(`../../fixtures/${id}.json${id === 'coinbase' ? '.gz' : ''}`, import.meta.url),
          )
        : undefined;
    const options = { feeRate, ...(recording ? { recording, loop: true } : {}) };
    if (id === 'kraken') return createKrakenAdapter(options);
    if (id === 'coinbase') return createCoinbaseAdapter(options);
    return createBinanceAdapter(options);
  };
}

export class PricingService {
  private configuration: (typeof venues.$inferSelect)[] = [];
  private active = new Map<VenueId, { adapter: VenueAdapter; feeRate: string }>();
  private staleAfterMs = 5000;
  private configurationAt = 0;
  private running = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private refreshing: Promise<void> | undefined;
  constructor(
    private readonly database: Database,
    readonly mode: PricingMode,
    private readonly factory: AdapterFactory = adapterFactory(mode),
    private readonly logger?: FastifyBaseLogger,
  ) {}

  async start() {
    if (this.running) throw new Error('Pricing service already started.');
    this.running = true;
    await this.refreshConfiguration();
    this.timer = setInterval(() => {
      void this.refreshConfiguration().catch((error: unknown) =>
        this.logger?.error(
          { err: error, event: 'venue_configuration_failed' },
          'Venue configuration refresh failed',
        ),
      );
    }, 2000);
    this.timer.unref();
  }
  async refreshAfterReset() {
    // A repeatable-read poll begun before TRUNCATE can retain the old snapshot.
    // Finish it (including a transient failure), then read the committed seed
    // through a new transaction before declaring the reset ready.
    await this.refreshing?.catch(() => {});
    await this.refreshConfiguration();
  }
  refreshConfiguration() {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.refresh().finally(() => {
      this.refreshing = undefined;
    });
    return this.refreshing;
  }
  private async refresh() {
    if (!this.running) return;
    const configuration = await this.database.db.transaction(
      async (tx) => {
        const [config] = await tx.select().from(settings).where(eq(settings.id, 'default'));
        if (!config) throw new Error('Pricing settings are missing.');
        return { config, venues: await tx.select().from(venues) };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
    if (!this.running) return;
    this.configuration = configuration.venues;
    this.staleAfterMs = configuration.config.staleAfterMs;
    this.configurationAt = Date.now();
    for (const [id, current] of this.active) {
      const next = this.configuration.find((row) => row.id === id);
      if (!next?.enabled || next.feeRate !== current.feeRate) {
        this.active.delete(id);
        await current.adapter.stop();
        this.logger?.info({ event: 'venue_stopped', venue: id }, 'Venue stopped');
      }
    }
    for (const config of this.configuration) {
      if (!this.running || !config.enabled || this.active.has(config.id)) continue;
      const adapter = await this.factory(config.id, config.feeRate);
      if (!this.running) {
        await adapter.stop();
        return;
      }
      this.active.set(config.id, { adapter, feeRate: config.feeRate });
      try {
        await adapter.start((event) => {
          if (event.type === 'health')
            this.logger?.info({ event: 'venue_state', ...event.health }, 'Venue state changed');
        });
      } catch (error) {
        this.active.delete(config.id);
        await adapter.stop();
        throw error;
      }
    }
  }
  freshBooks(now = Date.now()): PricedBook[] {
    // A failed DB poll must not leave a disabled venue usable indefinitely.
    if (!this.running || now - this.configurationAt > 5000) return [];
    return this.configuration
      .filter((config) => config.enabled)
      .flatMap((config) => {
        const current = this.active.get(config.id);
        if (!current) return [];
        return current.adapter
          .books()
          .filter((book) => book.receivedAt <= now && now - book.receivedAt <= this.staleAfterMs)
          .map((book) => ({ book, feeRate: current.feeRate }));
      });
  }
  price(request: QuoteRequest, now = Date.now()) {
    return selectRoute(this.freshBooks(now), request);
  }
  health(now = Date.now()) {
    const fresh = this.freshBooks(now);
    return this.configuration.map((config) => {
      const adapter = this.active.get(config.id)?.adapter;
      const health = adapter?.health();
      const status = !config.enabled
        ? 'disabled'
        : !health
          ? 'disconnected'
          : (health.status === 'connected' || health.status === 'polling') &&
              !fresh.some(({ book }) => book.venue === config.id)
            ? 'stale'
            : health.status;
      return {
        id: config.id,
        enabled: config.enabled,
        feeRate: config.feeRate,
        status,
        lastUpdate: health?.lastUpdate ?? null,
        markets: adapter?.markets.length ?? 0,
        readyMarkets: fresh.filter(({ book }) => book.venue === config.id).length,
        replayed: this.mode === 'replay',
        staleAfterMs: this.staleAfterMs,
      };
    });
  }
  async stop() {
    this.running = false;
    clearInterval(this.timer);
    await this.refreshing?.catch(() => {});
    const adapters = [...this.active.values()];
    this.active.clear();
    await Promise.all(adapters.map(({ adapter }) => adapter.stop()));
  }
}
