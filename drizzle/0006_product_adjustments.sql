-- Migration bù cho product_adjustments (bị bỏ sót trong drizzle history)
-- Prod đã có table này (chắc do push trực tiếp qua Studio). Migration này
-- idempotent: chỉ tạo nếu chưa tồn tại → an toàn re-run.

CREATE TABLE IF NOT EXISTS "product_adjustments" (
  "id" serial PRIMARY KEY NOT NULL,
  "product_id" integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  "effective_date" text NOT NULL,
  "note" text,
  "pmg_base_price" double precision,
  "pmg_rate" double precision,
  "pmg_sale_rate" double precision,
  "admin_fee" double precision,
  "admin_fee_sale" double precision,
  "sale_commission_rate" double precision,
  "kpi_ceo_rate" double precision,
  "kpi_tpkd_rate" double precision,
  "kpi_admin_rate" double precision,
  "cdt_bonus_sale" double precision,
  "cdt_bonus_manager" double precision,
  "bonus_sale" double precision,
  "bonus_manager" double precision,
  "customer_support" double precision,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_product_adjustments_product_id" ON "product_adjustments" ("product_id");
CREATE INDEX IF NOT EXISTS "idx_product_adjustments_effective_date" ON "product_adjustments" ("effective_date");
