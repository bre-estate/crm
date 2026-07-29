-- Add payment_progress_pct to revenue_reconciliations (2026-07-29)
-- N = "Tỷ lệ % thu PMG LK đợt này" — tiến độ khách trả CĐT thực sự.
-- Trước: em nhầm dùng pmg_cumulative_pct (=% PMG_LK M rate snapshot).
-- Sau: thêm field riêng cho N, import từ Excel sheet 2.2 cột P.

ALTER TABLE revenue_reconciliations
  ADD COLUMN IF NOT EXISTS payment_progress_pct double precision NOT NULL DEFAULT 0;
