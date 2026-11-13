CREATE TABLE "demo_state" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"interval_ms" integer DEFAULT 0 NOT NULL,
	"last_reset_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_reset_at" timestamp with time zone,
	CONSTRAINT "demo_state_singleton" CHECK ("demo_state"."id" = 'default'),
	CONSTRAINT "demo_reset_interval" CHECK ("demo_state"."interval_ms" >= 0),
	CONSTRAINT "demo_reset_schedule" CHECK (("demo_state"."interval_ms" = 0 AND "demo_state"."next_reset_at" IS NULL) OR ("demo_state"."interval_ms" > 0 AND "demo_state"."next_reset_at" > "demo_state"."last_reset_at"))
);
