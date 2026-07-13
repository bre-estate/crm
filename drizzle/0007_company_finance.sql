-- Migration: Tài chính công ty (vốn đầu tư + chi phí + cấu hình)
-- Idempotent — safe re-run

CREATE TABLE IF NOT EXISTS "company_investments" (
  "id" serial PRIMARY KEY NOT NULL,
  "invested_at" text NOT NULL,
  "category" text NOT NULL,
  "description" text NOT NULL,
  "amount" double precision NOT NULL,
  "amortization_months" integer,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "company_expenses" (
  "id" serial PRIMARY KEY NOT NULL,
  "expense_month" text NOT NULL,
  "category" text NOT NULL,
  "amount" double precision NOT NULL,
  "description" text,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "company_settings" (
  "id" serial PRIMARY KEY NOT NULL,
  "tax_rate" double precision NOT NULL DEFAULT 0.20,
  "business_start_date" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Seed single row for settings (nếu chưa có)
INSERT INTO company_settings (id, tax_rate)
VALUES (1, 0.20)
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS "idx_company_investments_invested_at" ON "company_investments" ("invested_at");
CREATE INDEX IF NOT EXISTS "idx_company_expenses_month" ON "company_expenses" ("expense_month");
