-- Log conversation chatbot để phân tích câu hỏi thường gặp + rate success + tối ưu tools.
CREATE TABLE IF NOT EXISTS chat_logs (
  id SERIAL PRIMARY KEY,
  user_email TEXT NOT NULL,
  user_role TEXT,
  question TEXT NOT NULL,
  answer TEXT,
  tools_used JSONB DEFAULT '[]'::jsonb,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_logs_created ON chat_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_logs_user ON chat_logs(user_email);
CREATE INDEX IF NOT EXISTS idx_chat_logs_success ON chat_logs(success);

-- RLS default deny (server bypass qua postgres role)
ALTER TABLE chat_logs ENABLE ROW LEVEL SECURITY;
