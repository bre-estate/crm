-- Migration: thêm bedrooms + area_m2 vào products để phân tích phân khúc.
-- Idempotent.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS "bedrooms" integer,
  ADD COLUMN IF NOT EXISTS "area_m2" double precision,
  ADD COLUMN IF NOT EXISTS "parse_note" text;

COMMENT ON COLUMN public.products.bedrooms IS '0=studio, 1=1PN, 2=2PN,... null=chưa xác định';
COMMENT ON COLUMN public.products.area_m2 IS 'Diện tích m² — nhập tay từ HĐMB';
COMMENT ON COLUMN public.products.parse_note IS 'Note khi parse tự động không chắc chắn — cần user review';

CREATE INDEX IF NOT EXISTS "products_bedrooms_idx" ON public.products ("bedrooms");
