-- Techcombank dùng lại cùng số bút toán cho lệnh nộp và lệnh hoàn (BHXH 05/03 và 17/03/2026),
-- nên khóa duy nhất theo reference_number làm rơi dòng nộp. Khóa mới: số bút toán + số tiền nợ + số tiền có.
-- statement_seq: thứ tự dòng trên sao kê (lớn = mới), để lấy đúng số dư đầu/cuối kỳ khi nhiều dòng cùng ngày.
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS statement_seq INTEGER;
ALTER TABLE bank_transactions DROP CONSTRAINT IF EXISTS bank_transactions_reference_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS bank_transactions_ref_amount_uq
  ON bank_transactions (reference_number, coalesce(debit_amount, 0), coalesce(credit_amount, 0));
CREATE INDEX IF NOT EXISTS bt_statement_seq_idx ON bank_transactions (statement_seq);
