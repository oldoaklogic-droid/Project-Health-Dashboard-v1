CREATE TABLE IF NOT EXISTS "leads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "who" text NOT NULL,
  "what" text NOT NULL,
  "where" text NOT NULL,
  "source" text NOT NULL,
  "spotter" text NOT NULL,
  "status" text DEFAULT 'New' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "leads_status_idx" ON "leads" ("status");

CREATE TABLE IF NOT EXISTS "intakes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "lead_id" uuid,
  "client" text NOT NULL,
  "contact" text,
  "phone" text,
  "email" text,
  "address" text,
  "parcel" text,
  "referral_source" text,
  "primary_request" text,
  "property_plans" text,
  "disciplines" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "drivers" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "step_flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "contract_type" text,
  "payment_terms" text,
  "start_date" date,
  "target_completion" date,
  "pm_by_discipline" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "estimate_approved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "intakes_lead_id_leads_id_fk"
    FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "intakes_lead_id_idx" ON "intakes" ("lead_id");
CREATE INDEX IF NOT EXISTS "intakes_created_at_idx" ON "intakes" ("created_at");

CREATE TABLE IF NOT EXISTS "local_projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "intake_id" uuid NOT NULL,
  "bqe_parent_project_id" uuid,
  "bqe_child_project_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "project_number" text NOT NULL,
  "name" text NOT NULL,
  "client" text NOT NULL,
  "pm" text NOT NULL,
  "address" text,
  "disciplines" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "original_hours" numeric DEFAULT 0 NOT NULL,
  "approved_hours" numeric DEFAULT 0 NOT NULL,
  "rate" numeric DEFAULT 220 NOT NULL,
  "fee" numeric DEFAULT 0 NOT NULL,
  "due_date" date,
  "status" text DEFAULT 'Draft' NOT NULL,
  "phases" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "activities" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "change_orders" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "closeout" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "adjustment_logs" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "local_projects_intake_id_intakes_id_fk"
    FOREIGN KEY ("intake_id") REFERENCES "public"."intakes"("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "local_projects_project_number_uidx"
  ON "local_projects" ("project_number");
CREATE INDEX IF NOT EXISTS "local_projects_intake_id_idx"
  ON "local_projects" ("intake_id");

CREATE TABLE IF NOT EXISTS "question_tree" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "section" text NOT NULL,
  "discipline" text,
  "trigger" text,
  "prompt" text NOT NULL,
  "answer_type" text NOT NULL,
  "options" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "maps_to" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "sort_order" numeric DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL
);

CREATE INDEX IF NOT EXISTS "question_tree_section_sort_idx"
  ON "question_tree" ("section", "sort_order");

CREATE TABLE IF NOT EXISTS "uuid_cache" (
  "entity_type" text NOT NULL,
  "human_key" text NOT NULL,
  "bqe_uuid" uuid NOT NULL,
  "resolved_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "uuid_cache_entity_type_human_key_pk"
    PRIMARY KEY ("entity_type", "human_key")
);