-- 2026-08-10: Audit log cho mọi import script (yêu cầu Chủ tịch).
-- Mỗi lần chạy import → log vào bảng này để trace ai/khi nào/tạo gì.

CREATE TABLE IF NOT EXISTS import_logs (
  id serial PRIMARY KEY,
  script_name text NOT NULL,             -- 'import-accounting-journal', 'backfill-invoices'...
  source_file text,                      -- file Excel/CSV nguồn (nếu có)
  target_table text,                     -- table đích chính
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',  -- running / success / failed
  records_created integer DEFAULT 0,
  records_updated integer DEFAULT 0,
  records_skipped integer DEFAULT 0,
  records_error integer DEFAULT 0,
  run_by text,                           -- User email hoặc "cron" nếu tự động
  error_message text,
  details jsonb                          -- Info chi tiết per script (VD list new IDs)
);

CREATE INDEX IF NOT EXISTS idx_import_logs_script ON import_logs(script_name);
CREATE INDEX IF NOT EXISTS idx_import_logs_started ON import_logs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_logs_status ON import_logs(status);
