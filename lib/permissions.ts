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
export type Role = "owner" | "manager" | "sale" | "admin" | "hr" | "viewer" | "custom";

export const RESOURCES = {
  "products": "Danh sách căn",
  "revenues": "Doanh thu",
  "costs": "Giá vốn",
  "invoices": "Hóa đơn",
  "partners": "Đối tác",
  "departments": "Phòng ban",
  "employees": "Nhân sự",
  "finance": "Tài chính (Vốn góp / Tài sản / Giao dịch)",
  "reports.overview": "Báo cáo Tổng quan",
  "reports.management": "Báo cáo Quản trị",
  "reports.people": "Báo cáo Sale/Team",
  "reports.balance-sheet": "Bảng cân đối kế toán",
  "reports.cash-flow-statement": "Lưu chuyển tiền tệ",
  "reports.unit-profitability": "Lãi/lỗ per căn",
  "reports.segments": "Phân khúc căn",
  "reports.hr-checks": "Đối chiếu giá vốn",
  "alerts": "Cảnh báo",
  "admin.users": "Quản lý user",
  "admin.activity": "Nhật ký hoạt động",
} as const;

export type Resource = keyof typeof RESOURCES;

export const ACTION_LABELS: Record<Action, string> = {
  view: "Xem",
  edit: "Sửa",
  delete: "Xóa",
};

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Chủ (Owner) — full access",
  manager: "Quản lý — toàn quyền trừ user",
  sale: "Sale — doanh thu + căn",
  admin: "Admin — tài chính + hóa đơn",
  hr: "HR — giá vốn + nhân sự",
  viewer: "Xem — báo cáo tổng quan",
  custom: "Tùy chỉnh — tick từng resource",
};

// Permission maps: resource → allowed actions.
// Owner tự động có tất cả — không cần khai báo.
const PRESETS: Record<Exclude<Role, "owner" | "custom">, Partial<Record<Resource, Action[]>>> = {
  manager: {
    products: ["view", "edit", "delete"],
    revenues: ["view", "edit", "delete"],
    costs: ["view", "edit", "delete"],
    invoices: ["view", "edit", "delete"],
    partners: ["view", "edit", "delete"],
    departments: ["view", "edit", "delete"],
    employees: ["view", "edit", "delete"],
    finance: ["view", "edit"],
    "reports.overview": ["view"],
    "reports.management": ["view"],
    "reports.people": ["view"],
    "reports.balance-sheet": ["view"],
    "reports.cash-flow-statement": ["view"],
    "reports.unit-profitability": ["view"],
    "reports.segments": ["view", "edit"],
    "reports.hr-checks": ["view"],
    alerts: ["view"],
    "admin.activity": ["view"],
  },
  sale: {
    products: ["view"],
    revenues: ["view", "edit"],
    "reports.overview": ["view"],
  },
  admin: {
    finance: ["view", "edit"],
    invoices: ["view", "edit"],
    partners: ["view", "edit"],
    departments: ["view", "edit"],
    employees: ["view", "edit"],
    "reports.overview": ["view"],
  },
  hr: {
    costs: ["view", "edit"],
    employees: ["view", "edit"],
    departments: ["view"],
    "reports.people": ["view"],
    "reports.hr-checks": ["view"],
  },
  viewer: {
    "reports.overview": ["view"],
  },
};

/**
 * Trả về effective permissions cho 1 role.
 * Với role='custom' → dùng `customPerms` truyền vào.
 * Với owner → return { "*": ["view","edit","delete"] } (mọi resource full).
 */
export function resolvePermissions(
  role: Role,
  customPerms?: Record<string, Action[]>,
): Record<string, Action[]> {
  if (role === "owner") {
    const all: Record<string, Action[]> = {};
    for (const r of Object.keys(RESOURCES)) {
      all[r] = ["view", "edit", "delete"];
    }
    return all;
  }
  if (role === "custom") {
    return customPerms ?? {};
  }
  const preset = PRESETS[role];
  const out: Record<string, Action[]> = {};
  for (const [r, actions] of Object.entries(preset)) {
    if (actions) out[r] = [...actions];
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

  // Top-level
  if (p.startsWith("/products")) return "products";
  if (p.startsWith("/revenues")) return "revenues";
  if (p.startsWith("/costs")) return "costs";
  if (p.startsWith("/invoices")) return "invoices";
  if (p.startsWith("/partners")) return "partners";
  if (p.startsWith("/departments")) return "departments";
  if (p.startsWith("/employees")) return "employees";
  if (p.startsWith("/finance")) return "finance";
  if (p.startsWith("/alerts")) return "alerts";

  return null;
}
