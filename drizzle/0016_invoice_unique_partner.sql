-- Fix: mỗi CĐT có sổ HĐ riêng, số HĐ trùng giữa các CĐT là hợp lệ,
-- nhưng CÙNG (số HĐ, ngày HĐ, CĐT) thì phải UNIQUE — nếu không sẽ nhầm
-- gộp 2 HĐ khác CĐT thành 1 khi trùng số + ngày.
--
-- Cần: PostgreSQL treat NULL != NULL trong UNIQUE constraint mặc định,
-- nên với invoice_date NULL cần expr riêng. Dùng partial + expr UNIQUE index
-- để cover cả 4 tổ hợp NULL của (invoice_date, partner_id).

CREATE UNIQUE INDEX IF NOT EXISTS invoices_number_date_partner_uniq
  ON invoices (
    invoice_number,
    COALESCE(invoice_date, ''),
    COALESCE(partner_id, 0)
  );
