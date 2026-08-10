-- 2026-08-11: Structured PMG tiers for contracts.
-- Cột `pmg_structure` (text) đã có sẵn — giữ nguyên làm nguồn gốc từ Excel.
-- Thêm structured JSON để cross-check tier-aware + auto-fill rate khi tạo căn mới.

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS pmg_tiers jsonb,
  ADD COLUMN IF NOT EXISTS pmg_metric text,        -- 'count' | 'percent' | 'combined' | 'other'
  ADD COLUMN IF NOT EXISTS pmg_retroactive boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pmg_notes text;

-- pmg_tiers structure:
-- [
--   { "min": 0,   "max": 30,   "rate": 0.06,  "sale_rate": 0.06 },
--   { "min": 30,  "max": 60,   "rate": 0.0625, "sale_rate": 0.06 },
--   { "min": 60,  "max": null, "rate": 0.07,  "sale_rate": 0.05, "sale_cap": 0.05 }
-- ]
-- min/max: ngưỡng theo pmg_metric ('count' số căn / 'percent' %giỏ hàng)
-- sale_cap: trần rate cho NVKD nếu contract giới hạn
