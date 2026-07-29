-- Add other_costs to products (2026-07-29)
-- Excel sheet 2.1 col AL "CP giá vốn khác" — chi phí giá vốn không thuộc loại
-- nào (HH/support/bonus/KPI). Dùng trong công thức Excel R sheet 3 (giá vốn
-- tương ứng) cho hr-checks.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS other_costs double precision NOT NULL DEFAULT 0;
