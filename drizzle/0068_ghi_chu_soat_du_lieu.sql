-- Ghi chú và trạng thái cho từng mục trên trang Soát dữ liệu.
--
-- Trước đây mọi mục trông giống hệt nhau nên mỗi lần mở trang lại phải hỏi
-- lại "cái này xử lý tới đâu rồi". Giờ ghi thẳng lên trang.
--
-- Không lưu tên người, không lưu ai sửa. Đây là sổ theo dõi việc, không
-- phải sổ theo dõi người.
--
-- Khoá là mã phát hiện do lib/soat-du-lieu.ts sinh ra, dạng "dt-975" hoặc
-- "gv-1012-sale_commission". Dữ liệu được sửa đúng thì mục tự biến mất khỏi
-- danh sách, nhưng ghi chú vẫn nằm lại để sau này truy.

CREATE TABLE IF NOT EXISTS soat_ghi_chu (
  ma_phat_hien  text PRIMARY KEY,
  trang_thai    text NOT NULL DEFAULT 'moi',
  ghi_chu       text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE soat_ghi_chu ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE soat_ghi_chu FROM anon, authenticated;
DROP POLICY IF EXISTS "service_role only" ON soat_ghi_chu;
CREATE POLICY "service_role only" ON soat_ghi_chu
  AS RESTRICTIVE FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
