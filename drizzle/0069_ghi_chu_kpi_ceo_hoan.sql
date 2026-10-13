-- Đánh dấu tám mục KPI CEO chi dư là đang xử lý.
--
-- HR Nga xác nhận ngày 13/10/2026: tất cả KPI CEO đều chi dư do lúc chi
-- tính trần ở mức 100% trong khi căn chưa thu đủ tiền. Cuối tháng 10/2026
-- sẽ làm lệnh hoàn lại.
--
-- Tổng tám mục: 1.842.810.
--
-- Mã mục do lib/soat-du-lieu.ts sinh ra theo dạng gv-<id căn>-<loại>.
-- Khi tiền hoàn về, lũy kế tụt xuống dưới trần thì mục tự biến mất khỏi
-- danh sách, còn ghi chú vẫn nằm lại để sau này truy.

INSERT INTO soat_ghi_chu (ma_phat_hien, trang_thai, ghi_chu, updated_at) VALUES
  ('gv-945-kpi_ceo', 'dang_xu_ly', 'B2-11.17 chi dư 908.250. Nga xác nhận 13/10/2026, làm lệnh hoàn cuối tháng 10/2026.', now()),
  ('gv-947-kpi_ceo', 'dang_xu_ly', 'A.05.03 chi dư 362.349. Nga xác nhận 13/10/2026, làm lệnh hoàn cuối tháng 10/2026.', now()),
  ('gv-968-kpi_ceo', 'dang_xu_ly', 'B.26.20 chi dư 350.000. Nga xác nhận 13/10/2026, làm lệnh hoàn cuối tháng 10/2026.', now()),
  ('gv-946-kpi_ceo', 'dang_xu_ly', 'A.05.09 chi dư 95.328. Nga xác nhận 13/10/2026, làm lệnh hoàn cuối tháng 10/2026.', now()),
  ('gv-952-kpi_ceo', 'dang_xu_ly', 'B.06.07 chi dư 44.579. Nga xác nhận 13/10/2026, làm lệnh hoàn cuối tháng 10/2026.', now()),
  ('gv-954-kpi_ceo', 'dang_xu_ly', 'B.23.24 chi dư 39.608. Nga xác nhận 13/10/2026, làm lệnh hoàn cuối tháng 10/2026.', now()),
  ('gv-953-kpi_ceo', 'dang_xu_ly', 'B.06.11 chi dư 32.642. Nga xác nhận 13/10/2026, làm lệnh hoàn cuối tháng 10/2026.', now()),
  ('gv-951-kpi_ceo', 'dang_xu_ly', 'A.25.26 chi dư 10.054. Nga xác nhận 13/10/2026, làm lệnh hoàn cuối tháng 10/2026.', now())
ON CONFLICT (ma_phat_hien) DO UPDATE
  SET trang_thai = EXCLUDED.trang_thai,
      ghi_chu = EXCLUDED.ghi_chu,
      updated_at = now();
