-- Migration: thêm unit_type để phân biệt căn hộ thường / penthouse / shophouse.
-- Bedrooms integer vẫn giữ cho căn hộ thường (studio-4PN); penthouse/shophouse
-- có unit_type riêng, bedrooms có thể null hoặc để tham khảo.
-- Idempotent.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS "unit_type" text DEFAULT 'apartment';

COMMENT ON COLUMN public.products.unit_type IS 'apartment (mặc định) | penthouse | shophouse';

-- Backfill: mọi căn hiện có → apartment (default đã set)
UPDATE public.products SET unit_type = 'apartment' WHERE unit_type IS NULL;

CREATE INDEX IF NOT EXISTS "products_unit_type_idx" ON public.products ("unit_type");
