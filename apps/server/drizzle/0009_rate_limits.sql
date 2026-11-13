CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rate_limit_count" CHECK ("rate_limits"."count" > 0)
);
--> statement-breakpoint
CREATE INDEX "rate_limit_expiry" ON "rate_limits" USING btree ("expires_at");