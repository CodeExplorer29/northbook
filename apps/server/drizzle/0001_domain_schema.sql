CREATE TYPE "public"."fixed_currency" AS ENUM('base', 'quote');--> statement-breakpoint
CREATE TYPE "public"."kyb_state" AS ENUM('draft', 'submitted', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."quote_state" AS ENUM('active', 'accepted', 'expired');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('client', 'staff');--> statement-breakpoint
CREATE TYPE "public"."trade_side" AS ENUM('BUY', 'SELL');--> statement-breakpoint
CREATE TYPE "public"."trade_state" AS ENUM('awaiting_client_funds', 'funds_received', 'payout_sent', 'settled', 'cancelled');--> statement-breakpoint
CREATE SEQUENCE "public"."quote_number" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."trade_number" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "organisations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"jurisdiction" text NOT NULL,
	"tier" text NOT NULL,
	"max_trade_size" numeric(60, 18) NOT NULL,
	"kyb_state" "kyb_state" DEFAULT 'draft' NOT NULL,
	CONSTRAINT "positive_max_trade_size" CHECK ("organisations"."max_trade_size" > 0)
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" text PRIMARY KEY DEFAULT 'NB-Q-' || lpad(nextval('quote_number')::text, 6, '0') NOT NULL,
	"organisation_id" text NOT NULL,
	"user_id" text NOT NULL,
	"pair" text NOT NULL,
	"side" "trade_side" NOT NULL,
	"fixed" "fixed_currency" NOT NULL,
	"requested_amount" numeric(60, 18) NOT NULL,
	"base_amount" numeric(60, 18) NOT NULL,
	"quote_amount" numeric(60, 18) NOT NULL,
	"client_price" numeric(60, 18) NOT NULL,
	"market_price" numeric(60, 18) NOT NULL,
	"spread_bps" numeric(12, 6) NOT NULL,
	"route" jsonb NOT NULL,
	"status" "quote_state" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "quote_id_organisation" UNIQUE("id","organisation_id"),
	CONSTRAINT "quote_pair" CHECK ("quotes"."pair" IN ('BTC/CAD','BTC/USD','ETH/CAD','ETH/USD','USDC/CAD','USDC/USD','USDT/CAD','USDT/USD')),
	CONSTRAINT "quote_positive_amounts" CHECK ("quotes"."requested_amount" > 0 AND "quotes"."base_amount" > 0 AND "quotes"."quote_amount" > 0 AND "quotes"."client_price" > 0 AND "quotes"."market_price" > 0 AND "quotes"."spread_bps" >= 0),
	CONSTRAINT "quote_lifetime" CHECK ("quotes"."expires_at" > "quotes"."created_at")
);
--> statement-breakpoint
CREATE TABLE "trade_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trade_id" text NOT NULL,
	"action" text NOT NULL,
	"from_state" "trade_state",
	"to_state" "trade_state" NOT NULL,
	"actor_id" text NOT NULL,
	"simulated" boolean NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trade_event_once" UNIQUE("trade_id","action"),
	CONSTRAINT "trade_event_action" CHECK ("trade_events"."action" IN ('booked','funds_received','payout_sent','payout_confirmed','cancel'))
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" text PRIMARY KEY DEFAULT 'NB-T-' || lpad(nextval('trade_number')::text, 6, '0') NOT NULL,
	"quote_id" text NOT NULL,
	"organisation_id" text NOT NULL,
	"pair" text NOT NULL,
	"side" "trade_side" NOT NULL,
	"base_amount" numeric(60, 18) NOT NULL,
	"quote_amount" numeric(60, 18) NOT NULL,
	"client_price" numeric(60, 18) NOT NULL,
	"state" "trade_state" DEFAULT 'awaiting_client_funds' NOT NULL,
	"cancellation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trades_quote_id_unique" UNIQUE("quote_id"),
	CONSTRAINT "trade_positive_amounts" CHECK ("trades"."base_amount" > 0 AND "trades"."quote_amount" > 0 AND "trades"."client_price" > 0),
	CONSTRAINT "trade_cancel_reason" CHECK ("trades"."state" <> 'cancelled' OR length(trim("trades"."cancellation_reason")) > 0 AND "trades"."cancellation_reason" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" "user_role" NOT NULL,
	"organisation_id" text,
	CONSTRAINT "user_organisation_role" CHECK (("users"."role" = 'client' AND "users"."organisation_id" IS NOT NULL) OR ("users"."role" = 'staff' AND "users"."organisation_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_events" ADD CONSTRAINT "trade_events_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_events" ADD CONSTRAINT "trade_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_quote_id_organisation_id_quotes_id_organisation_id_fk" FOREIGN KEY ("quote_id","organisation_id") REFERENCES "public"."quotes"("id","organisation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;