-- Sổ chi cá nhân của founder, nguồn Drive "0.2.6-Chi phí cá nhân - Vốn góp.xlsx".
-- Tiền hai founder bỏ ra ngoài tài khoản công ty. Dùng cho báo cáo dòng tiền (phần công ty đã tiêu)
-- và cho bảng tỷ lệ vốn góp (cột capital_note).
CREATE TABLE IF NOT EXISTS founder_spending (
  id SERIAL PRIMARY KEY,
  month TEXT NOT NULL,                 -- YYYY-MM
  spend_date DATE,                     -- ngày chi nếu file có ghi
  person TEXT NOT NULL,                -- Triết | Bách
  title TEXT NOT NULL,                 -- Hạng mục
  detail TEXT,                         -- Chi tiết
  note TEXT,
  payee TEXT,                          -- Người nhận / NCC
  amount NUMERIC(15, 0) NOT NULL,
  capital_note TEXT NOT NULL,          -- "Có" | "Không (thứ cấp)" | "Không (công ty đã trả)" | "Không (tiền sale nạp quảng cáo)"
  is_deposit BOOLEAN NOT NULL,         -- nộp vào tài khoản công ty, sao kê đã có
  is_company_spend BOOLEAN NOT NULL,   -- có tính vào chi phí công ty trong báo cáo dòng tiền không
  category TEXT NOT NULL,              -- nhóm chi phí đã phân loại
  source_row TEXT,                     -- dấu vết dòng gốc
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fs_month_idx ON founder_spending (month);
CREATE INDEX IF NOT EXISTS fs_date_idx ON founder_spending (spend_date);
CREATE INDEX IF NOT EXISTS fs_person_idx ON founder_spending (person);
