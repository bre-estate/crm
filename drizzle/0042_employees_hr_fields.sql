-- Trường nhân sự từ Danh Sách Nhân Viên (Drive 3-Nhân Sự), đồng bộ 12/09/2026.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS contract_type text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS start_date text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS end_date text;
CREATE UNIQUE INDEX IF NOT EXISTS employees_code_uniq ON employees (code) WHERE code IS NOT NULL;
