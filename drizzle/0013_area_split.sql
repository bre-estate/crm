-- Migration: tách diện tích thành thông thủy + tim tường,
-- thêm flag has_bonus_room cho căn dạng "1PN+" / "2PN+".
-- area_m2 hiện tại đang trống toàn bộ (chưa ai nhập) → rename an toàn.
-- Idempotent.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='products' AND column_name='area_m2') THEN
    ALTER TABLE public.products RENAME COLUMN "area_m2" TO "area_m2_net";
  END IF;
END $$;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS "area_m2_gross" double precision,
  ADD COLUMN IF NOT EXISTS "has_bonus_room" boolean DEFAULT false;

COMMENT ON COLUMN public.products.area_m2_net IS 'Diện tích thông thủy (m²) — chuẩn pháp lý + sổ đỏ, phần khách dùng thực.';
COMMENT ON COLUMN public.products.area_m2_gross IS 'Diện tích tim tường (m²) — gross/built-up, tính đến giữa tường chung. Thường lớn hơn net 5-10%.';
COMMENT ON COLUMN public.products.has_bonus_room IS 'True nếu căn có phòng phụ (VD "1PN+" = 1 phòng ngủ chính + 1 phòng phụ ~5-8m²).';

CREATE INDEX IF NOT EXISTS "products_bonus_idx" ON public.products ("has_bonus_room");
