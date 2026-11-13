CREATE TABLE "settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"stale_after_ms" integer DEFAULT 5000 NOT NULL,
	CONSTRAINT "settings_singleton" CHECK ("settings"."id" = 'default'),
	CONSTRAINT "settings_staleness" CHECK ("settings"."stale_after_ms" BETWEEN 1000 AND 60000)
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"fee_rate" numeric(12, 9) NOT NULL,
	CONSTRAINT "venue_id" CHECK ("venues"."id" IN ('kraken','coinbase','binance')),
	CONSTRAINT "venue_fee" CHECK ("venues"."fee_rate" >= 0 AND "venues"."fee_rate" < 1)
);
--> statement-breakpoint
INSERT INTO venues(id, enabled, fee_rate) VALUES
  ('kraken', true, 0.0026), ('coinbase', true, 0.006), ('binance', true, 0.001);
INSERT INTO settings(id, stale_after_ms) VALUES ('default', 5000);
