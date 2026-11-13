CREATE TABLE "kyb_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"legal_name" text DEFAULT '' NOT NULL,
	"registration_number" text DEFAULT '' NOT NULL,
	"jurisdiction" text DEFAULT '' NOT NULL,
	"nature_of_business" text DEFAULT '' NOT NULL,
	"beneficial_owners" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"state" "kyb_state" DEFAULT 'draft' NOT NULL,
	"submission_count" integer DEFAULT 0 NOT NULL,
	"submitted_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"decision_by" text,
	"decision_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kyb_applications_organisation_id_unique" UNIQUE("organisation_id"),
	CONSTRAINT "kyb_owners_array" CHECK (jsonb_typeof("kyb_applications"."beneficial_owners") = 'array'),
	CONSTRAINT "kyb_submission" CHECK (("kyb_applications"."state" = 'draft' AND "kyb_applications"."submission_count" = 0 AND "kyb_applications"."submitted_at" IS NULL) OR ("kyb_applications"."state" <> 'draft' AND "kyb_applications"."submission_count" = 1 AND "kyb_applications"."submitted_at" IS NOT NULL)),
	CONSTRAINT "kyb_decision" CHECK (("kyb_applications"."state" IN ('draft','submitted') AND "kyb_applications"."decided_at" IS NULL AND "kyb_applications"."decision_by" IS NULL AND "kyb_applications"."decision_reason" IS NULL) OR ("kyb_applications"."state" = 'approved' AND "kyb_applications"."decided_at" IS NOT NULL AND "kyb_applications"."decision_by" IS NOT NULL AND "kyb_applications"."decision_reason" IS NULL) OR ("kyb_applications"."state" = 'rejected' AND "kyb_applications"."decided_at" IS NOT NULL AND "kyb_applications"."decision_by" IS NOT NULL AND "kyb_applications"."decision_reason" IS NOT NULL AND length(trim("kyb_applications"."decision_reason")) > 0))
);
--> statement-breakpoint
ALTER TABLE "kyb_applications" ADD CONSTRAINT "kyb_applications_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyb_applications" ADD CONSTRAINT "kyb_applications_decision_by_users_id_fk" FOREIGN KEY ("decision_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Preserve existing demo identities on upgrades. New empty databases instead
-- seed approved identities through the actual submission and decision functions.
INSERT INTO kyb_applications (organisation_id, legal_name, registration_number, jurisdiction, nature_of_business, beneficial_owners, state, submission_count, submitted_at, decided_at, decision_by, decision_reason)
SELECT o.id, o.name, CASE WHEN o.kyb_state = 'draft' THEN '' ELSE 'DEMO-' || upper(o.id) END, o.jurisdiction,
  CASE WHEN o.kyb_state = 'draft' THEN '' ELSE 'Demonstration payments and treasury services' END,
  CASE WHEN o.kyb_state = 'draft' THEN '[]'::jsonb ELSE '[{"name":"Sample beneficial owner","ownership":"100"}]'::jsonb END,
  o.kyb_state, CASE WHEN o.kyb_state = 'draft' THEN 0 ELSE 1 END,
  CASE WHEN o.kyb_state <> 'draft' THEN now() END,
  CASE WHEN o.kyb_state IN ('approved','rejected') THEN now() END,
  CASE WHEN o.kyb_state IN ('approved','rejected') THEN (SELECT id FROM users WHERE role = 'staff' ORDER BY id LIMIT 1) END,
  CASE WHEN o.kyb_state = 'rejected' THEN 'Existing demonstration rejection preserved during migration.' END
FROM organisations o;
