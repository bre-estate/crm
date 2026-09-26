-- Tách quyền TPKD ra khỏi CEO.
--
-- Migration 0050 chép chung một bộ quyền cho cả hai vì vai trò cũ "manager" gộp
-- lẫn hai cấp. Thực tế khác: trưởng phòng kinh doanh quản đội bán hàng, không
-- dính tới tiền của công ty.
--
-- Bỏ khỏi TPKD: dòng tiền, lãi lỗ quản trị, cân đối kế toán, phân tích chi phí,
-- KPI dashboard, nghĩa vụ tài chính, tuổi nợ phải trả, vốn góp và tài sản. Bỏ cả
-- lãi lỗ theo dự án và theo căn vì hai cái đó lộ cơ cấu giá vốn.
--
-- Hạ luôn quyền xóa: trưởng phòng sửa được giao dịch của đội mình nhưng không
-- xóa, và chỉ xem chứ không sửa danh sách nhân sự với phòng ban.

UPDATE positions SET permissions = '{
  "products":            ["view","edit"],
  "revenues":            ["view","edit"],
  "costs":               ["view","edit"],
  "costs-report":        ["view","edit"],
  "invoices":            ["view","edit"],
  "secondary-sales":     ["view","edit"],
  "partners":            ["view"],
  "departments":         ["view"],
  "employees":           ["view"],
  "periods":             ["view"],
  "documents":           ["view"],
  "reports.overview":    ["view"],
  "reports.sales":       ["view"],
  "reports.commissions": ["view"],
  "reports.people":      ["view"],
  "reports.segments":    ["view"],
  "reports.ar-aging":    ["view"],
  "alerts":              ["view"],
  "help":                ["view"]
}'::jsonb, updated_at = now()
WHERE code = 'tpkd';
