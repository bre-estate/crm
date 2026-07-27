-- Phase A: accrual method support (2026-07-27)
-- Thêm accrual_month + product_id để hỗ trợ báo cáo dồn tích (matching principle).
--
-- - accrual_month: 'YYYY-MM'. Với row HH sale/thưởng gắn deal → tháng phát sinh recon (ngày ĐC).
--   Row không gắn deal → giữ = transaction_month.
-- - product_id: link tới căn (nullable). Cho phép reconciliation + drill-down.
--
-- Toggle trong report: [Tiền mặt = transaction_month | Dồn tích = accrual_month].

ALTER TABLE financial_transactions
  ADD COLUMN IF NOT EXISTS accrual_month text,
  ADD COLUMN IF NOT EXISTS product_id integer REFERENCES products(id);

-- Default accrual_month = transaction_month cho toàn bộ rows hiện tại.
UPDATE financial_transactions
   SET accrual_month = transaction_month
 WHERE accrual_month IS NULL;

ALTER TABLE financial_transactions
  ALTER COLUMN accrual_month SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fintx_accrual_month
  ON financial_transactions (accrual_month);
CREATE INDEX IF NOT EXISTS idx_fintx_product
  ON financial_transactions (product_id);

-- Thêm field group_bctc vào accounting_categories để phân nhóm 641/642/811 theo BCTC Kim.
ALTER TABLE accounting_categories
  ADD COLUMN IF NOT EXISTS group_bctc text;

-- Backfill group_bctc theo classifier cũ (sau Phase C sẽ update lại chính xác).
UPDATE accounting_categories SET group_bctc = '641' WHERE code IN ('632', '6417');
UPDATE accounting_categories SET group_bctc = '642'
 WHERE code IN ('6421', '6425', '6427-rent', '6427-svc', '6428');
UPDATE accounting_categories SET group_bctc = 'other' WHERE group_bctc IS NULL;
