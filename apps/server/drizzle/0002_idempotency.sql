CREATE TABLE "idempotency_keys" (
	"scope" text NOT NULL,
	"endpoint" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"reservation" uuid DEFAULT gen_random_uuid() NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"status_code" integer,
	"response" jsonb,
	"failure" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '24 hours' NOT NULL,
	CONSTRAINT "idempotency_keys_scope_endpoint_key_pk" PRIMARY KEY("scope","endpoint","key"),
	CONSTRAINT "idempotency_state" CHECK ("idempotency_keys"."state" IN ('pending', 'completed')),
	CONSTRAINT "idempotency_completed" CHECK ("idempotency_keys"."state" = 'pending' OR "idempotency_keys"."status_code" IS NOT NULL)
);
