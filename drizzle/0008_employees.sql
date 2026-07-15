-- Migration: bảng employees (nhân viên/CTV) + backfill từ text field cũ
-- Idempotent — safe re-run

CREATE TABLE IF NOT EXISTS "employees" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text,
  "phone" text,
  "position" text NOT NULL DEFAULT 'nvkd',
  "department_id" integer REFERENCES "departments"("id"),
  "active" boolean DEFAULT true,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "employees_active_idx" ON "employees" ("active");
CREATE INDEX IF NOT EXISTS "employees_position_idx" ON "employees" ("position");
CREATE UNIQUE INDEX IF NOT EXISTS "employees_name_unique_ci" ON "employees" (LOWER("name"));
