CREATE TABLE IF NOT EXISTS "activity_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" integer NOT NULL,
  "action" text NOT NULL,
  "product_id" integer,
  "actor_email" text,
  "actor_ip" text,
  "changes" jsonb,
  "summary" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_activity_logs_entity" ON "activity_logs" ("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "idx_activity_logs_product" ON "activity_logs" ("product_id");
CREATE INDEX IF NOT EXISTS "idx_activity_logs_created" ON "activity_logs" ("created_at" DESC);
