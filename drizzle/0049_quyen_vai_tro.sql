-- Quyền của từng vai trò chuyển từ code xuống database, để chủ tài khoản tự sửa
-- trong app thay vì phải nhờ sửa code mỗi lần thêm bớt một quyền.
--
-- Chỉ chứa vai trò dựng sẵn và vai trò tự tạo. "owner" luôn toàn quyền nên không
-- có ở đây, "custom" là quyền riêng từng người nên nằm ở user_permissions.

CREATE TABLE IF NOT EXISTS role_permissions (
  role        text PRIMARY KEY,
  label       text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Vai trò dựng sẵn thì sửa được quyền nhưng không xóa được, tránh xóa nhầm
  -- rồi những người đang mang vai trò đó mất sạch quyền.
  builtin     boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO role_permissions (role, label, permissions, builtin)
VALUES ('manager', 'Manager', '{"products":["view","edit","delete"],"secondary-sales":["view","edit","delete"],"revenues":["view","edit","delete"],"costs":["view","edit","delete"],"costs-report":["view","edit"],"invoices":["view","edit","delete"],"partners":["view","edit","delete"],"departments":["view","edit","delete"],"employees":["view","edit","delete"],"finance":["view"],"periods":["view","edit"],"documents":["view","edit"],"reports.overview":["view"],"reports.profit-detail":["view"],"reports.cash-flow":["view"],"reports.ar-aging":["view"],"reports.ap-aging":["view"],"reports.balance-sheet":["view"],"reports.sales":["view"],"reports.commissions":["view"],"reports.project-profitability":["view"],"reports.expenses":["view"],"reports.kpi-dashboard":["view"],"reports.people":["view"],"reports.obligations":["view"],"reports.unit-profitability":["view"],"reports.segments":["view"],"alerts":["view"],"help":["view"]}'::jsonb, true)
ON CONFLICT (role) DO NOTHING;

INSERT INTO role_permissions (role, label, permissions, builtin)
VALUES ('admin', 'Sale Admin', '{"products":["view","edit"],"revenues":["view","edit"],"costs":["view","edit"],"costs-report":["view","edit"],"invoices":["view","edit"],"partners":["view","edit"],"periods":["view","edit"],"documents":["view","edit"],"reports.ar-aging":["view"],"alerts":["view"],"help":["view"]}'::jsonb, true)
ON CONFLICT (role) DO NOTHING;

INSERT INTO role_permissions (role, label, permissions, builtin)
VALUES ('hr', 'HR', '{"products":["view"],"revenues":["view"],"departments":["view"],"employees":["view"],"costs":["view","edit"],"costs-report":["view"],"invoices":["view"],"partners":["view"],"periods":["view","edit"],"payroll.commissions":["view","edit"],"documents":["view"],"alerts":["view"],"help":["view"]}'::jsonb, true)
ON CONFLICT (role) DO NOTHING;

