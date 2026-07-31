-- Phase 1a: Add JSONB column `notes` cho revenue_reconciliations
-- Support merge model: 1 record chứa nhiều loại (hoa hồng + thưởng nóng sale + QL),
-- mỗi loại có note riêng lưu trong JSONB dạng { "commission": "...", "bonus_sale": "...", "bonus_manager": "..." }.
--
-- Field `note` cũ (text) giữ nguyên cho backward compat + hiển thị fallback nếu notes JSONB rỗng.
-- Sau khi migrate populate xong, field `note` chứa "primary note" (thường của loại chính).

ALTER TABLE revenue_reconciliations
  ADD COLUMN IF NOT EXISTS notes jsonb DEFAULT '{}'::jsonb NOT NULL;

-- Index GIN để query notes theo key nhanh (nếu cần trong tương lai)
CREATE INDEX IF NOT EXISTS idx_revenue_recon_notes_gin
  ON revenue_reconciliations USING gin (notes);
