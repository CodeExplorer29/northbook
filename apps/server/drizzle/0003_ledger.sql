ALTER TABLE "trade_events" ADD CONSTRAINT "trade_event_id_trade" UNIQUE("id","trade_id");
--> statement-breakpoint
CREATE TYPE "public"."account_type" AS ENUM('client_receivable', 'client_payable', 'desk_bank', 'desk_wallet', 'spread_revenue', 'trading_position');--> statement-breakpoint
CREATE TYPE "public"."currency" AS ENUM('BTC', 'ETH', 'USDC', 'USDT', 'CAD', 'USD');--> statement-breakpoint
CREATE TYPE "public"."entry_direction" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "account_type" NOT NULL,
	"currency" "currency" NOT NULL,
	"organisation_id" text,
	CONSTRAINT "account_identity" UNIQUE NULLS NOT DISTINCT("type","currency","organisation_id"),
	CONSTRAINT "account_id_currency" UNIQUE("id","currency"),
	CONSTRAINT "account_owner" CHECK (("accounts"."type" IN ('client_receivable','client_payable') AND "accounts"."organisation_id" IS NOT NULL) OR ("accounts"."type" NOT IN ('client_receivable','client_payable') AND "accounts"."organisation_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"currency" "currency" NOT NULL,
	"direction" "entry_direction" NOT NULL,
	"amount" numeric(60, 18) NOT NULL,
	CONSTRAINT "ledger_positive_amount" CHECK ("ledger_entries"."amount" > 0 AND "ledger_entries"."amount" < 1e36),
	CONSTRAINT "ledger_currency_precision" CHECK ("ledger_entries"."amount" = trunc("ledger_entries"."amount", CASE WHEN "ledger_entries"."currency" IN ('CAD','USD') THEN 2 WHEN "ledger_entries"."currency" IN ('USDC','USDT') THEN 6 WHEN "ledger_entries"."currency" = 'BTC' THEN 8 ELSE 18 END))
);
--> statement-breakpoint
CREATE TABLE "ledger_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_event_id" uuid NOT NULL,
	"trade_id" text NOT NULL,
	"reverses_transaction_id" uuid,
	"posting_xid" numeric(20, 0) DEFAULT pg_current_xact_id()::text::numeric NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_transactions_source_event_id_unique" UNIQUE("source_event_id")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_currency_accounts_id_currency_fk" FOREIGN KEY ("account_id","currency") REFERENCES "public"."accounts"("id","currency") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_reverses_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("reverses_transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_source_event_id_trade_id_trade_events_id_trade_id_fk" FOREIGN KEY ("source_event_id","trade_id") REFERENCES "public"."trade_events"("id","trade_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

