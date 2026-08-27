/**
 * Permission model cho BRE CRM (2026-07-28).
 *
 * Cấu trúc:
 *   - RESOURCES: các khu vực trong app (products, revenues, costs, ...)
 *   - ACTIONS: view | edit | delete
 *   - ROLES: owner | manager | sale | admin | hr | viewer | custom
 *   - PRESETS: role → permissions map (default cho role, có thể override bằng custom)
 */

export type Action = "view" | "edit" | "delete";
export type Role = "owner" | "manager" | "admin" | "hr" | "custom";

/**
 * Actions mà mỗi resource thực sự HỖ TRỢ.
 * Các trang chỉ xem (báo cáo, log, help) chỉ nên có ["view"] — UI phân quyền
 * sẽ disable các checkbox không thuộc list này để tránh cấp quyền chết.
 */
export const RESOURCE_ACTIONS: Record<string, Action[]> = {
  // Full CRUD
  products: ["view", "edit", "delete"],
  "secondary-sales": ["view", "edit", "delete"],
  revenues: ["view", "edit", "delete"],
  costs: ["view", "edit", "delete"],
  invoices: ["view", "edit", "delete"],
  partners: ["view", "edit", "delete"],
  departments: ["view", "edit", "delete"],
  employees: ["view", "edit", "delete"],
  expenses: ["view", "edit", "delete"],
  "admin.users": ["view", "edit", "delete"],
  // View + Edit (không xóa)
  finance: ["view", "edit"],
  "finance.bank-review": ["view", "edit"],
  "costs-report": ["view", "edit"],
  // Duyệt chi — view = thấy queue duyệt, edit = approve/reject
  "expenses.approve": ["view", "edit"],
  // Payroll HH generator — view chỉ preview, edit = xuất Excel
  "payroll.commissions": ["view", "edit"],
  // View only (report / log / help)
  alerts: ["view"],
  "admin.activity": ["view"],
  "admin.import-logs": ["view"],
  help: ["view"],
  // reports.* — view only (mặc định phía dưới)
};

export const RESOURCES = {
  "products": "Danh sách căn (sơ cấp)",
  "secondary-sales": "Bán thứ cấp",
  "revenues": "Doanh thu",
  "costs": "Giá vốn",
  "invoices": "Hóa đơn",
  "partners": "Đối tác",
  "departments": "Phòng ban",
  "employees": "Nhân sự",
  "finance": "Tài chính (Vốn góp / Tài sản / Giao dịch)",
  "expenses": "Chi phí (Yêu cầu chi)",
  "expenses.approve": "Duyệt chi",
  "payroll.commissions": "Xuất bảng HH (Payroll)",
  "reports.overview": "Báo cáo Tổng quan",
  "reports.management": "Báo cáo Quản trị (P&L cũ)",
  "reports.profit-detail": "Lãi/lỗ quản trị (Management P&L)",
  "reports.cash-flow": "Dòng tiền",
  "reports.ar-aging": "Tuổi nợ phải thu (A/R aging)",
  "reports.ap-aging": "Tuổi nợ phải trả (A/P aging)",
  "reports.sales": "Báo cáo bán hàng (Sales report)",
  "reports.commissions": "Báo cáo hoa hồng (Commission report)",
  "reports.project-profitability": "Lãi/lỗ theo dự án",
  "reports.expenses": "Phân tích chi phí",
  "reports.kpi-dashboard": "KPI dashboard",
  "reports.break-even": "Phân tích hòa vốn",
  "reports.people": "Báo cáo Sale/Team",
  "reports.balance-sheet": "Bảng cân đối kế toán",
  "reports.obligations": "Nghĩa vụ tài chính (còn thu/nợ)",
  "reports.unit-profitability": "Lãi/lỗ per căn",
  "reports.segments": "Phân khúc căn",
  "finance.bank-review": "Đối chiếu sao kê bank",
  "costs-report": "Đối chiếu giá vốn",
  "alerts": "Cảnh báo",
  "admin.users": "Quản lý user",
  "admin.activity": "Nhật ký hoạt động",
  "admin.import-logs": "Nhật ký import",
  "help": "Trang trợ giúp / hướng dẫn nhập liệu",
} as const;

export type Resource = keyof typeof RESOURCES;

// Nhóm resources theo chức năng — dùng cho UI phân quyền (dễ tick từng nhóm).
// Khớp với structure menu AppSidebar: Giao dịch / Đối tác & Nhân sự / Tài chính / Báo cáo / Hệ thống.
export const RESOURCE_GROUPS: { label: string; keys: Resource[] }[] = [
  {
    label: "Giao dịch sơ cấp",
    keys: ["products", "revenues", "costs", "costs-report", "invoices"],
  },
  {
    label: "Giao dịch thứ cấp",
    keys: ["secondary-sales"],
  },
  {
    label: "Đối tác & Nhân sự",
    keys: ["partners", "departments", "employees"],
  },
  {
    label: "Tài chính",
    keys: ["finance", "expenses", "expenses.approve", "payroll.commissions"],
  },
  {
    label: "Báo cáo",
    keys: [
      "reports.profit-detail",
      "reports.cash-flow",
      "reports.ar-aging",
      "reports.ap-aging",
      "reports.balance-sheet",
      "reports.sales",
      "reports.commissions",
      "reports.project-profitability",
      "reports.expenses",
      "reports.kpi-dashboard",
      "reports.break-even",
      "reports.people",
      "reports.unit-profitability",
      "reports.segments",
      "reports.obligations",
      "reports.overview",
      "reports.management",
    ],
  },
  {
    label: "Hệ thống",
    keys: ["alerts", "admin.users", "admin.activity", "help"],
  },
];

export const ACTION_LABELS: Record<Action, string> = {
  view: "Xem",
  edit: "Sửa",
  delete: "Xóa",
};

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  manager: "Manager",
  admin: "Sale Admin",
  hr: "HR",
  custom: "Tùy chỉnh",
};

// Danh sách tất cả report resources — dùng để cấp full-view cho Manager
const ALL_REPORTS: Resource[] = [
  "reports.overview",
  "reports.management",
  "reports.profit-detail",
  "reports.cash-flow",
  "reports.ar-aging",
  "reports.ap-aging",
  "reports.balance-sheet",
  "reports.sales",
  "reports.commissions",
  "reports.project-profitability",
  "reports.expenses",
  "reports.kpi-dashboard",
  "reports.break-even",
  "reports.people",
  "reports.obligations",
  "reports.unit-profitability",
  "reports.segments",
];
const reportsView = Object.fromEntries(ALL_REPORTS.map((r) => [r, ["view"] as Action[]]));

// Permission maps: resource → allowed actions.
// Owner tự động có tất cả — không cần khai báo.
const PRESETS: Record<Exclude<Role, "owner" | "custom">, Partial<Record<Resource, Action[]>>> = {
  // Manager: toàn quyền giao dịch + đối tác/nhân sự; báo cáo + tài chính chỉ xem;
  // hệ thống chỉ có Trang trợ giúp.
  manager: {
    products: ["view", "edit", "delete"],
    "secondary-sales": ["view", "edit", "delete"],
    revenues: ["view", "edit", "delete"],
    costs: ["view", "edit", "delete"],
    "costs-report": ["view", "edit"],
    invoices: ["view", "edit", "delete"],
    partners: ["view", "edit", "delete"],
    departments: ["view", "edit", "delete"],
    employees: ["view", "edit", "delete"],
    finance: ["view"],
    ...reportsView,
    help: ["view"],
  },
  // Sale Admin: chỉnh sửa giao dịch sơ cấp + đối tác, không xoá; không đụng thứ cấp / nhân sự / báo cáo.
  admin: {
    products: ["view", "edit"],
    revenues: ["view", "edit"],
    costs: ["view", "edit"],
    "costs-report": ["view", "edit"],
    invoices: ["view", "edit"],
    partners: ["view", "edit"],
    help: ["view"],
  },
  // HR: xem giao dịch để đối chiếu; edit riêng giá vốn (nhập HH sale).
  hr: {
    products: ["view"],
    revenues: ["view"],
    costs: ["view", "edit"],
    "costs-report": ["view"],
    invoices: ["view"],
    partners: ["view"],
    help: ["view"],
  },
};

/**
 * Trả về effective permissions cho 1 role.
 * Với role='custom' → dùng `customPerms` truyền vào.
 * Với owner → return { "*": ["view","edit","delete"] } (mọi resource full).
 */
export function actionsFor(resource: string): Action[] {
  return RESOURCE_ACTIONS[resource] ?? ["view"];
}

export function resolvePermissions(
  role: Role,
  customPerms?: Record<string, Action[]>,
): Record<string, Action[]> {
  if (role === "owner") {
    const all: Record<string, Action[]> = {};
    for (const r of Object.keys(RESOURCES)) {
      all[r] = actionsFor(r);
    }
    return all;
  }
  if (role === "custom") {
    return customPerms ?? {};
  }
  const preset = PRESETS[role];
  const out: Record<string, Action[]> = {};
  for (const [r, actions] of Object.entries(preset)) {
    if (actions) {
      // Chỉ giữ actions mà resource thực sự hỗ trợ
      const supported = actionsFor(r);
      out[r] = actions.filter((a) => supported.includes(a));
    }
  }
  return out;
}

/**
 * Check user (role + custom perms) có action trên resource không.
 */
export function hasPermission(
  role: Role,
  customPerms: Record<string, Action[]> | undefined,
  resource: Resource,
  action: Action = "view",
): boolean {
  const perms = resolvePermissions(role, customPerms);
  const allowed = perms[resource];
  return allowed?.includes(action) ?? false;
}

/**
 * Map URL path → resource key.
 * Trả về null nếu path không cần permission (VD: /, /login).
 * Trả về "reports.*" (wildcard) cho /reports landing — check any reports.*.
 */
export function resourceOfPath(path: string): Resource | "reports.*" | null {
  // Normalize: remove trailing slash
  const p = path.replace(/\/$/, "");

  // Reports (multi-level path)
  const reportsMatch = p.match(/^\/reports\/([^/]+)/);
  if (reportsMatch) {
    const key = `reports.${reportsMatch[1]}` as Resource;
    if (key in RESOURCES) return key;
    return "reports.overview";
  }
  // /reports landing — allow nếu user có any reports.*
  if (p === "/reports") return "reports.*";

  // Admin
  if (p.startsWith("/admin/users")) return "admin.users";
  if (p.startsWith("/admin/activity")) return "admin.activity";
  if (p.startsWith("/admin/import-logs")) return "admin.activity";
  if (p.startsWith("/admin/data-checks")) return "admin.activity";

  // Top-level
  if (p.startsWith("/products")) return "products";
  // /projects dùng chung permission với products (đều là danh mục căn/dự án)
  if (p.startsWith("/projects")) return "products";
  if (p.startsWith("/revenues")) return "revenues";
  // /costs-report phải check TRƯỚC /costs (startsWith conflict)
  if (p.startsWith("/costs-report")) return "costs-report";
  if (p.startsWith("/costs")) return "costs";
  if (p.startsWith("/invoices")) return "invoices";
  if (p.startsWith("/partners")) return "partners";
  if (p.startsWith("/departments")) return "departments";
  if (p.startsWith("/employees")) return "employees";
  // /finance/bank-review là tool riêng, nhưng vẫn dùng permission "finance"
  if (p.startsWith("/finance")) return "finance";
  if (p.startsWith("/alerts")) return "alerts";
  if (p.startsWith("/help")) return "help";
  if (p.startsWith("/secondary-sales")) return "secondary-sales";
  if (p.startsWith("/rentals")) return "products";  // rentals dùng chung permission products (đang hidden)

  return null;
}
