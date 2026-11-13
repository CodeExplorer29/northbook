import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import type { ErrorCode, KybDraft } from '@northbook/shared';

export const role = pgEnum('user_role', ['client', 'staff']);
export const kybState = pgEnum('kyb_state', ['draft', 'submitted', 'approved', 'rejected']);
export const quoteState = pgEnum('quote_state', ['active', 'accepted', 'expired']);
export const tradeState = pgEnum('trade_state', [
  'awaiting_client_funds',
  'funds_received',
  'payout_sent',
  'settled',
  'cancelled',
]);
export const side = pgEnum('trade_side', ['BUY', 'SELL']);
export const fixedCurrency = pgEnum('fixed_currency', ['base', 'quote']);
export const currency = pgEnum('currency', ['BTC', 'ETH', 'USDC', 'USDT', 'CAD', 'USD']);
export const accountType = pgEnum('account_type', [
  'client_receivable',
  'client_payable',
  'desk_bank',
  'desk_wallet',
  'spread_revenue',
  'trading_position',
]);
export const entryDirection = pgEnum('entry_direction', ['debit', 'credit']);
export const quoteNumber = pgSequence('quote_number');
export const tradeNumber = pgSequence('trade_number');
const money = (name: string) => numeric(name, { precision: 60, scale: 18 });
const time = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const organisations = pgTable(
  'organisations',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    jurisdiction: text('jurisdiction').notNull(),
    tier: text('tier').notNull(),
    maxTradeSize: money('max_trade_size').notNull(),
    kybState: kybState('kyb_state').notNull().default('draft'),
  },
  (table) => [check('positive_max_trade_size', sql`${table.maxTradeSize} > 0`)],
);

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    role: role('role').notNull(),
    organisationId: text('organisation_id').references(() => organisations.id),
  },
  (table) => [
    check(
      'user_organisation_role',
      sql`(${table.role} = 'client' AND ${table.organisationId} IS NOT NULL) OR (${table.role} = 'staff' AND ${table.organisationId} IS NULL)`,
    ),
  ],
);

export const quotes = pgTable(
  'quotes',
  {
    id: text('id')
      .primaryKey()
      .default(sql`'NB-Q-' || lpad(nextval('quote_number')::text, 6, '0')`),
    organisationId: text('organisation_id')
      .notNull()
      .references(() => organisations.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    pair: text('pair').notNull(),
    side: side('side').notNull(),
    fixed: fixedCurrency('fixed').notNull(),
    requestedAmount: money('requested_amount').notNull(),
    baseAmount: money('base_amount').notNull(),
    quoteAmount: money('quote_amount').notNull(),
    clientPrice: money('client_price').notNull(),
    marketPrice: money('market_price').notNull(),
    spreadBps: numeric('spread_bps', { precision: 12, scale: 6 }).notNull(),
    route: jsonb('route').notNull().$type<Record<string, unknown>>(),
    status: quoteState('status').notNull().default('active'),
    createdAt: time('created_at').notNull().defaultNow(),
    expiresAt: time('expires_at').notNull(),
  },
  (table) => [
    unique('quote_id_organisation').on(table.id, table.organisationId),
    check(
      'quote_pair',
      sql`${table.pair} IN ('BTC/CAD','BTC/USD','ETH/CAD','ETH/USD','USDC/CAD','USDC/USD','USDT/CAD','USDT/USD')`,
    ),
    check(
      'quote_positive_amounts',
      sql`${table.requestedAmount} > 0 AND ${table.baseAmount} > 0 AND ${table.quoteAmount} > 0 AND ${table.clientPrice} > 0 AND ${table.marketPrice} > 0 AND ${table.spreadBps} >= 0`,
    ),
    check('quote_lifetime', sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);

export const trades = pgTable(
  'trades',
  {
    id: text('id')
      .primaryKey()
      .default(sql`'NB-T-' || lpad(nextval('trade_number')::text, 6, '0')`),
    quoteId: text('quote_id').notNull().unique(),
    organisationId: text('organisation_id')
      .notNull()
      .references(() => organisations.id),
    pair: text('pair').notNull(),
    side: side('side').notNull(),
    baseAmount: money('base_amount').notNull(),
    quoteAmount: money('quote_amount').notNull(),
    clientPrice: money('client_price').notNull(),
    state: tradeState('state').notNull().default('awaiting_client_funds'),
    cancellationReason: text('cancellation_reason'),
    createdAt: time('created_at').notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.quoteId, table.organisationId],
      foreignColumns: [quotes.id, quotes.organisationId],
    }),
    check(
      'trade_positive_amounts',
      sql`${table.baseAmount} > 0 AND ${table.quoteAmount} > 0 AND ${table.clientPrice} > 0`,
    ),
    check(
      'trade_cancel_reason',
      sql`${table.state} <> 'cancelled' OR length(trim(${table.cancellationReason})) > 0 AND ${table.cancellationReason} IS NOT NULL`,
    ),
  ],
);

export const tradeEvents = pgTable(
  'trade_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tradeId: text('trade_id')
      .notNull()
      .references(() => trades.id),
    action: text('action').notNull(),
    fromState: tradeState('from_state'),
    toState: tradeState('to_state').notNull(),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id),
    simulated: boolean('simulated').notNull(),
    reason: text('reason'),
    createdAt: time('created_at').notNull().defaultNow(),
  },
  (table) => [
    unique('trade_event_once').on(table.tradeId, table.action),
    unique('trade_event_id_trade').on(table.id, table.tradeId),
    check(
      'trade_event_action',
      sql`${table.action} IN ('booked','funds_received','payout_sent','payout_confirmed','cancel')`,
    ),
  ],
);

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    scope: text('scope').notNull(),
    endpoint: text('endpoint').notNull(),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    reservation: uuid('reservation').notNull().defaultRandom(),
    state: text('state').notNull().$type<'pending' | 'completed'>().default('pending'),
    statusCode: integer('status_code'),
    response: jsonb('response').$type<unknown>(),
    failure: jsonb('failure').$type<{ code: ErrorCode; message: string }>(),
    createdAt: time('created_at').notNull().defaultNow(),
    expiresAt: time('expires_at')
      .notNull()
      .default(sql`now() + interval '24 hours'`),
  },
  (table) => [
    primaryKey({ columns: [table.scope, table.endpoint, table.key] }),
    check('idempotency_state', sql`${table.state} IN ('pending', 'completed')`),
    check('idempotency_completed', sql`${table.state} = 'pending' OR ${table.statusCode} IS NOT NULL`),
  ],
);

export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    type: accountType('type').notNull(),
    currency: currency('currency').notNull(),
    organisationId: text('organisation_id').references(() => organisations.id),
  },
  (table) => [
    unique('account_identity').on(table.type, table.currency, table.organisationId).nullsNotDistinct(),
    unique('account_id_currency').on(table.id, table.currency),
    check(
      'account_owner',
      sql`(${table.type} IN ('client_receivable','client_payable') AND ${table.organisationId} IS NOT NULL) OR (${table.type} NOT IN ('client_receivable','client_payable') AND ${table.organisationId} IS NULL)`,
    ),
  ],
);

export const ledgerTransactions = pgTable(
  'ledger_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceEventId: uuid('source_event_id').notNull().unique(),
    tradeId: text('trade_id')
      .notNull()
      .references(() => trades.id),
    reversesTransactionId: uuid('reverses_transaction_id').references(
      (): AnyPgColumn => ledgerTransactions.id,
    ),
    postingXid: numeric('posting_xid', { precision: 20, scale: 0 })
      .notNull()
      .default(sql`pg_current_xact_id()::text::numeric`),
    createdAt: time('created_at').notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.sourceEventId, table.tradeId],
      foreignColumns: [tradeEvents.id, tradeEvents.tradeId],
    }),
  ],
);

export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => ledgerTransactions.id),
    accountId: text('account_id').notNull(),
    currency: currency('currency').notNull(),
    direction: entryDirection('direction').notNull(),
    amount: money('amount').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.accountId, table.currency],
      foreignColumns: [accounts.id, accounts.currency],
    }),
    check('ledger_positive_amount', sql`${table.amount} > 0 AND ${table.amount} < 1e36`),
    check(
      'ledger_currency_precision',
      sql`${table.amount} = trunc(${table.amount}, CASE WHEN ${table.currency} IN ('CAD','USD') THEN 2 WHEN ${table.currency} IN ('USDC','USDT') THEN 6 WHEN ${table.currency} = 'BTC' THEN 8 ELSE 18 END)`,
    ),
  ],
);

export const venues = pgTable(
  'venues',
  {
    id: text('id').primaryKey().$type<'kraken' | 'coinbase' | 'binance'>(),
    enabled: boolean('enabled').notNull().default(true),
    feeRate: numeric('fee_rate', { precision: 12, scale: 9 }).notNull(),
  },
  (table) => [
    check('venue_id', sql`${table.id} IN ('kraken','coinbase','binance')`),
    check('venue_fee', sql`${table.feeRate} >= 0 AND ${table.feeRate} < 1`),
  ],
);

export const settings = pgTable(
  'settings',
  {
    id: text('id').primaryKey().default('default'),
    staleAfterMs: integer('stale_after_ms').notNull().default(5000),
    quoteLifetimeSeconds: integer('quote_lifetime_seconds').notNull().default(15),
    minimumTradeCad: money('minimum_trade_cad').notNull().default('10000'),
    referenceSpreadBps: numeric('reference_spread_bps', { precision: 12, scale: 6 }).notNull().default('50'),
  },
  (table) => [
    check('settings_singleton', sql`${table.id} = 'default'`),
    check('settings_staleness', sql`${table.staleAfterMs} BETWEEN 1000 AND 60000`),
    check('settings_quote_lifetime', sql`${table.quoteLifetimeSeconds} BETWEEN 5 AND 120`),
    check('settings_minimum', sql`${table.minimumTradeCad} > 0 AND ${table.minimumTradeCad} < 1e36`),
    check(
      'settings_reference_spread',
      sql`${table.referenceSpreadBps} >= 0 AND ${table.referenceSpreadBps} < 10000`,
    ),
  ],
);

export const spreadBands = pgTable(
  'spread_bands',
  {
    tier: text('tier').notNull(),
    band: integer('band').notNull(),
    bps: numeric('bps', { precision: 12, scale: 6 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tier, table.band] }),
    check('spread_band', sql`${table.band} BETWEEN 0 AND 2`),
    check('spread_bps', sql`${table.bps} >= 0 AND ${table.bps} < 10000`),
  ],
);

export const kybApplications = pgTable(
  'kyb_applications',
  {
    workEmail: text('work_email').notNull().default(''),
    monthlyVolume: text('monthly_volume').notNull().default(''),
    id: uuid('id').primaryKey().defaultRandom(),
    organisationId: text('organisation_id')
      .notNull()
      .unique()
      .references(() => organisations.id),
    legalName: text('legal_name').notNull().default(''),
    registrationNumber: text('registration_number').notNull().default(''),
    jurisdiction: text('jurisdiction').notNull().default(''),
    natureOfBusiness: text('nature_of_business').notNull().default(''),
    beneficialOwners: jsonb('beneficial_owners').notNull().$type<KybDraft['beneficialOwners']>().default([]),
    state: kybState('state').notNull().default('draft'),
    submissionCount: integer('submission_count').notNull().default(0),
    submittedAt: time('submitted_at'),
    decidedAt: time('decided_at'),
    decisionBy: text('decision_by').references(() => users.id),
    decisionReason: text('decision_reason'),
    createdAt: time('created_at').notNull().defaultNow(),
    updatedAt: time('updated_at').notNull().defaultNow(),
  },
  (table) => [
    check('kyb_owners_array', sql`jsonb_typeof(${table.beneficialOwners}) = 'array'`),
    check(
      'kyb_submission',
      sql`(${table.state} = 'draft' AND ${table.submissionCount} = 0 AND ${table.submittedAt} IS NULL) OR (${table.state} <> 'draft' AND ${table.submissionCount} = 1 AND ${table.submittedAt} IS NOT NULL)`,
    ),
    check(
      'kyb_decision',
      sql`(${table.state} IN ('draft','submitted') AND ${table.decidedAt} IS NULL AND ${table.decisionBy} IS NULL AND ${table.decisionReason} IS NULL) OR (${table.state} = 'approved' AND ${table.decidedAt} IS NOT NULL AND ${table.decisionBy} IS NOT NULL AND ${table.decisionReason} IS NULL) OR (${table.state} = 'rejected' AND ${table.decidedAt} IS NOT NULL AND ${table.decisionBy} IS NOT NULL AND ${table.decisionReason} IS NOT NULL AND length(trim(${table.decisionReason})) > 0)`,
    ),
  ],
);

export const rateLimits = pgTable(
  'rate_limits',
  {
    key: text('key').primaryKey(),
    count: integer('count').notNull(),
    expiresAt: time('expires_at').notNull(),
  },
  (table) => [
    check('rate_limit_count', sql`${table.count} > 0`),
    index('rate_limit_expiry').on(table.expiresAt),
  ],
);
