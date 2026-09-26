-- CEO thêm ba mảng: yêu cầu chi, duyệt chi, xuất bảng hoa hồng.
--
-- Sao kê ngân hàng không cần thêm gì: trang đó kiểm theo quyền "finance" mà CEO
-- đã có sẵn. Tài nguyên "finance.bank-review" từng khai báo trong bảng phân quyền
-- nhưng không trang nào kiểm theo nó, nên đã bỏ khỏi danh sách.
--
-- Không cho quyền xóa yêu cầu chi: duyệt và từ chối là đủ, xóa hẳn chứng từ thì
-- để chủ tài khoản làm.

UPDATE positions
SET permissions = permissions
      || '{"expenses": ["view","edit"]}'::jsonb
      || '{"expenses.approve": ["view","edit"]}'::jsonb
      || '{"payroll.commissions": ["view","edit"]}'::jsonb,
    updated_at = now()
WHERE code = 'ceo';
