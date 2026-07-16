-- Migration: Project Deep Dive fields for market intelligence.
-- Idempotent.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS "total_units" integer,
  ADD COLUMN IF NOT EXISTS "launch_phases" jsonb,
  ADD COLUMN IF NOT EXISTS "price_range_min" double precision,
  ADD COLUMN IF NOT EXISTS "price_range_max" double precision,
  ADD COLUMN IF NOT EXISTS "handover_expected" text,
  ADD COLUMN IF NOT EXISTS "developer_website" text,
  ADD COLUMN IF NOT EXISTS "batdongsan_url" text,
  ADD COLUMN IF NOT EXISTS "cafeland_url" text,
  ADD COLUMN IF NOT EXISTS "district" text,
  ADD COLUMN IF NOT EXISTS "city" text,
  ADD COLUMN IF NOT EXISTS "data_source_note" text,
  ADD COLUMN IF NOT EXISTS "data_updated_at" timestamptz;

COMMENT ON COLUMN public.projects.total_units IS 'Tổng số căn dự án theo giấy phép (public data từ CĐT/Sở XD)';
COMMENT ON COLUMN public.projects.launch_phases IS 'JSON array: [{phase, units, launch_date, sold_pct, note}]';
COMMENT ON COLUMN public.projects.price_range_min IS 'Giá bán tối thiểu (VND) — thường là căn 1PN nhỏ nhất';
COMMENT ON COLUMN public.projects.price_range_max IS 'Giá bán tối đa (VND) — căn penthouse/lớn nhất';
COMMENT ON COLUMN public.projects.handover_expected IS 'Ngày bàn giao dự kiến (YYYY-MM hoặc quý YYYY-Q?)';

CREATE INDEX IF NOT EXISTS "projects_district_idx" ON public.projects ("district");
CREATE INDEX IF NOT EXISTS "projects_city_idx" ON public.projects ("city");
