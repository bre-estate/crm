-- Thêm cột projects.default_sale_type: phân loại sơ cấp / thứ cấp cho dự án.
-- Null = chưa phân loại (hiện ở cả 2 tab trong form thêm giao dịch).
-- Backfill được apply riêng qua scripts/add-default-sale-type.ts.
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "default_sale_type" text;
