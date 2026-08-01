-- Phase 2 notifications: track read state per user per alert.
-- Key = `${alert_id}::${period}` — VD "below-be-3m::2026-08". Reset khi period đổi
-- (VD sang tháng mới), user lại thấy notification chưa read.

CREATE TABLE IF NOT EXISTS notification_reads (
  id serial PRIMARY KEY,
  email text NOT NULL,
  notification_key text NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_reads_email_key_idx
  ON notification_reads (email, notification_key);

CREATE INDEX IF NOT EXISTS notification_reads_email_idx
  ON notification_reads (email);
