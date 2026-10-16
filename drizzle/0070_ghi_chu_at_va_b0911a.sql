-- Ghi chú ba mục doanh thu không khớp tiến độ, theo giải trình của Admin Thúy
-- ngày 13/10/2026.
--
-- B-09-11A (căn 977), hụt 1.090.909, ĐÃ CHỐT, không còn đợt nào bù.
--   Cùng khoản thưởng nóng NVKD 10.000.000 nhưng hai bên quy đổi khác nhau:
--     BRE  bóc VAT:  10.000.000 / 1,1  = 9.090.909
--     Opus lấy 80%:  10.000.000 x 0,8  = 8.000.000
--     chênh                            = 1.090.909
--   Khớp đúng con số hụt, không lệch đồng nào.
--
-- A-05-07 (căn 973) và A-29-12 (căn 979) cùng pattern với bốn căn A&T kia:
--   đợt 1 về nhẹ khoảng 10%, đợt cuối bù lại cho tròn trần. Bốn căn đã có đợt
--   cuối đều chốt đúng trần 100%, lệch 0đ. Hai căn này chưa xuất được hóa đơn
--   đợt cuối nên còn treo. Thúy đang hỏi DXMD lịch xuất.
--
-- Mã mục do lib/soat-du-lieu.ts sinh, dạng td-dt-<id căn>.

INSERT INTO soat_ghi_chu (ma_phat_hien, trang_thai, ghi_chu, updated_at) VALUES
  ('td-dt-977', 'de_sau',
   'Đã giải trình, không phải lỗi nhập. Thưởng nóng NVKD 10.000.000 quy đổi hai kiểu: BRE bóc VAT ra 9.090.909, Opus lấy 80% ra 8.000.000, chênh đúng 1.090.909. Căn đã chốt 100%, không còn đợt nào bù. Cần chốt cách quy đổi thưởng nóng trong hợp đồng Opus lần sau.',
   now()),
  ('td-dt-973', 'dang_xu_ly',
   'Chưa xuất được hóa đơn đợt cuối nên chưa ghi đủ. Cùng pattern bốn căn A&T đã xong, các căn đó chốt đúng trần. Thu đủ 100% thì còn 66.807.712. Thúy đang hỏi DXMD lịch xuất hóa đơn.',
   now()),
  ('td-dt-979', 'dang_xu_ly',
   'Chưa xuất được hóa đơn đợt cuối nên chưa ghi đủ. Cùng pattern bốn căn A&T đã xong, các căn đó chốt đúng trần. Thu đủ 100% thì còn 73.377.448. Thúy đang hỏi DXMD lịch xuất hóa đơn.',
   now())
ON CONFLICT (ma_phat_hien) DO UPDATE
  SET trang_thai = EXCLUDED.trang_thai,
      ghi_chu = EXCLUDED.ghi_chu,
      updated_at = now();
