import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { deskSchema, Money, type Currency, type Desk } from '@northbook/shared';
import type { Database } from './db/client.js';
import { AppError } from './errors.js';
import type { PricedBook } from './pricing/depth.js';
import { mid } from './pricing/indicative.js';
import type { PricingService } from './pricing/service.js';

type Amount = InstanceType<typeof Money>;
const plain = (value: Amount) => (value.isZero() ? '0' : value.toFixed());

function cadPrice(books: readonly PricedBook[], currency: Currency) {
  if (currency === 'CAD') return new Money(1);
  try {
    return mid(books, currency, 'CAD').price;
  } catch (error) {
    if (error instanceof AppError && error.code === 'price_unavailable') return null;
    throw error;
  }
}

// The position account is credited with what the desk takes in and debited with
// what it gives out, both at market value, so credits minus debits is the
// desk's inventory and its value at current prices is the unrealised result.
export async function readDesk(database: Database, books: readonly PricedBook[]): Promise<Desk> {
  const signed = sql`CASE e.direction WHEN 'credit' THEN e.amount ELSE -e.amount END`;
  const { positions, revenue, clients } = await database.db.transaction(
    async (tx) => ({
      positions: (
        await tx.execute(sql`
        SELECT e.currency, sum(${signed})::text AS quantity
        FROM ledger_entries e JOIN accounts a ON a.id = e.account_id
        WHERE a.type = 'trading_position' GROUP BY e.currency ORDER BY e.currency`)
      ).rows as { currency: Currency; quantity: string }[],
      revenue: (
        await tx.execute(sql`
        SELECT e.currency, sum(${signed})::text AS total,
          coalesce(sum(${signed}) FILTER (
            WHERE t.created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'), 0)::text AS today
        FROM ledger_entries e JOIN accounts a ON a.id = e.account_id
        JOIN ledger_transactions t ON t.id = e.transaction_id
        WHERE a.type = 'spread_revenue' GROUP BY e.currency ORDER BY e.currency`)
      ).rows as { currency: Currency; total: string; today: string }[],
      clients: (
        await tx.execute(sql`
        SELECT o.id AS "organisationId", o.name, e.currency,
          (count(DISTINCT d.id) FILTER (WHERE d.state <> 'cancelled'))::int AS trades,
          sum(${signed})::text AS revenue
        FROM ledger_entries e JOIN accounts a ON a.id = e.account_id
        JOIN ledger_transactions t ON t.id = e.transaction_id
        JOIN trades d ON d.id = t.trade_id JOIN organisations o ON o.id = d.organisation_id
        WHERE a.type = 'spread_revenue' GROUP BY o.id, o.name, e.currency ORDER BY o.name, e.currency`)
      ).rows as Desk['clients'],
    }),
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
  const prices = new Map<Currency, Amount | null>();
  const price = (currency: Currency) => {
    if (!prices.has(currency)) prices.set(currency, cadPrice(books, currency));
    return prices.get(currency)!;
  };
  const total = (items: { currency: Currency; amount: string }[]) =>
    items.reduce<Amount | null>((sum, item) => {
      const rate = price(item.currency);
      return sum && rate ? sum.plus(new Money(item.amount).mul(rate)) : null;
    }, new Money(0));
  const unrealised = total(positions.map((item) => ({ currency: item.currency, amount: item.quantity })));
  const revenueCad = total(revenue.map((item) => ({ currency: item.currency, amount: item.total })));
  return {
    asOf: new Date().toISOString(),
    positions: positions.map((item) => {
      const rate = price(item.currency);
      return {
        ...item,
        priceCad: rate ? rate.toDecimalPlaces(8).toFixed() : null,
        valueCad: rate ? plain(new Money(item.quantity).mul(rate).toDecimalPlaces(2)) : null,
      };
    }),
    unrealisedCad: unrealised ? plain(unrealised.toDecimalPlaces(2)) : null,
    revenue,
    revenueCad: revenueCad ? plain(revenueCad.toDecimalPlaces(2)) : null,
    clients,
  };
}

export function registerDesk(
  app: FastifyInstance,
  database: Database,
  pricing?: Pick<PricingService, 'freshBooks'>,
) {
  app.get('/api/staff/desk', { config: { access: 'staff' } }, async (_request, reply) => {
    reply.header('cache-control', 'no-store');
    return deskSchema.parse(await readDesk(database, pricing?.freshBooks() ?? []));
  });
}
