-- Kho tài liệu chung: sao kê, hợp đồng, hóa đơn, chính sách.
-- Bản chính nằm ở Supabase Storage. Google Drive là nơi chứa bản sao, bật sau ở phần Tích hợp.
-- Ảnh scan được nén ngay trên trình duyệt trước khi tải lên, giữ dung lượng trong hạn mức gói miễn phí.

CREATE TABLE IF NOT EXISTS documents (
  id serial PRIMARY KEY,

  doc_type text NOT NULL,              -- sao_ke | hop_dong | hoa_don | chinh_sach | khac
  title text NOT NULL,
  note text,
  period text,                         -- kỳ liên quan: 2026, 2026-Q3, 2026-08

  storage_path text NOT NULL UNIQUE,   -- đường dẫn trong bucket tai-lieu
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,          -- dung lượng bản đang lưu
  original_size_bytes bigint,          -- dung lượng trước khi nén, null nếu không nén
  compressed boolean NOT NULL DEFAULT false,

  -- Gắn tài liệu vào đối tượng trong CRM. Để trống được, một tài liệu chỉ gắn một chỗ.
  product_id integer REFERENCES products(id) ON DELETE SET NULL,
  partner_id integer REFERENCES partners(id) ON DELETE SET NULL,
  invoice_id integer REFERENCES invoices(id) ON DELETE SET NULL,
  employee_id integer REFERENCES employees(id) ON DELETE SET NULL,

  -- Bản sao trên Google Drive, điền khi đã bật tích hợp
  drive_file_id text,
  drive_url text,
  drive_synced_at timestamptz,

  uploaded_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documents_doc_type_idx ON documents (doc_type, created_at DESC);
CREATE INDEX IF NOT EXISTS documents_period_idx ON documents (period);
CREATE INDEX IF NOT EXISTS documents_product_idx ON documents (product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS documents_partner_idx ON documents (partner_id) WHERE partner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS documents_invoice_idx ON documents (invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS documents_employee_idx ON documents (employee_id) WHERE employee_id IS NOT NULL;

-- Nơi khai báo các dịch vụ ngoài được nối vào CRM. Hiện mới có Google Drive.
-- secrets để riêng khỏi config vì sau này sẽ mã hóa cột này.
CREATE TABLE IF NOT EXISTS integrations (
  provider text PRIMARY KEY,           -- google_drive
  enabled boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  secrets jsonb,
  connected_by text,
  connected_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO integrations (provider, enabled) VALUES ('google_drive', false)
ON CONFLICT (provider) DO NOTHING;

-- Kho file riêng tư. Mọi lượt đọc đều phải qua link có hạn do máy chủ cấp.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('tai-lieu', 'tai-lieu', false, 52428800)
ON CONFLICT (id) DO NOTHING;

-- Người đã đăng nhập mới đụng được kho file. Việc ai được tải lên, ai chỉ được xem
-- thì chặn ở tầng ứng dụng bằng quyền "documents", giống mọi khu vực khác trong CRM.
DROP POLICY IF EXISTS "tai_lieu_doc" ON storage.objects;
CREATE POLICY "tai_lieu_doc" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'tai-lieu');

DROP POLICY IF EXISTS "tai_lieu_tai_len" ON storage.objects;
CREATE POLICY "tai_lieu_tai_len" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'tai-lieu');

DROP POLICY IF EXISTS "tai_lieu_sua" ON storage.objects;
CREATE POLICY "tai_lieu_sua" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'tai-lieu');

DROP POLICY IF EXISTS "tai_lieu_xoa" ON storage.objects;
CREATE POLICY "tai_lieu_xoa" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'tai-lieu');
