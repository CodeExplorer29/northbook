CREATE TABLE "spread_bands" (
	"tier" text NOT NULL,
	"band" integer NOT NULL,
	"bps" numeric(12, 6) NOT NULL,
	CONSTRAINT "spread_bands_tier_band_pk" PRIMARY KEY("tier","band"),
	CONSTRAINT "spread_band" CHECK ("spread_bands"."band" BETWEEN 0 AND 2),
	CONSTRAINT "spread_bps" CHECK ("spread_bands"."bps" >= 0 AND "spread_bands"."bps" < 10000)
);
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "quote_lifetime_seconds" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "minimum_trade_cad" numeric(60, 18) DEFAULT '10000' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "reference_spread_bps" numeric(12, 6) DEFAULT '50' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_quote_lifetime" CHECK ("settings"."quote_lifetime_seconds" BETWEEN 5 AND 120);--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_minimum" CHECK ("settings"."minimum_trade_cad" > 0 AND "settings"."minimum_trade_cad" < 1e36);--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_reference_spread" CHECK ("settings"."reference_spread_bps" >= 0 AND "settings"."reference_spread_bps" < 10000);
--> statement-breakpoint
INSERT INTO spread_bands(tier,band,bps) VALUES
  ('Tier 1',0,45), ('Tier 1',1,35), ('Tier 1',2,25),
  ('Standard',0,60), ('Standard',1,50), ('Standard',2,40);
