-- Cho phép tự chọn màu thẻ của từng phòng ban.
--
-- Lưu khóa màu (do, xanh_duong, ...) chứ không lưu lớp CSS, để sau này đổi
-- bảng màu thì không phải sửa dữ liệu. Danh sách khóa ở MAU_PHONG_CHON trong
-- lib/to-chuc.ts.
--
-- Để trống thì phòng nhận màu tự động theo thứ tự cây, đúng như hiện nay, nên
-- không cần đặt lại màu cho bảy phòng đang có.
ALTER TABLE departments ADD COLUMN IF NOT EXISTS color text;
