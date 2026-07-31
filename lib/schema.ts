import {
  pgTable,
  text,
  integer,
  serial,
  doublePrecision,
  timestamp,
  boolean,
  uuid,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ===================== 0. PROFILES (link to auth.users) =====================
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(), // = auth.users.id
  email: text("email"),
  fullName: text("full_name"),
  role: text("role", { enum: ["admin", "accountant", "viewer"] })
    .notNull()
    .default("viewer"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ===================== 0.5 DEPARTMENTS (phòng kinh doanh) =====================
export const departments = pgTable("departments", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  leaderName: text("leader_name"), // tên leader (text, không FK để giữ đơn giản)
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ===================== 1. PARTNERS =====================
export const partners = pgTable("partners", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  type: text("type", { enum: ["cdt", "f1", "f2"] }).notNull(),
  legalName: text("legal_name"),
  taxCode: text("tax_code"),
  address: text("address"),
  email: text("email"),
  phone: text("phone"),
  contactPerson: text("contact_person"),
  status: text("status").default("active"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ===================== 2. PROJECTS / CONTRACTS =====================
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  fullCode: text("full_code").notNull().unique(),
  name: text("name").notNull(),
  partnerId: integer("partner_id").references(() => partners.id),
  breRole: text("bre_role", { enum: ["f1", "f2"] }).notNull().default("f1"),
  // Phân loại sơ cấp / thứ cấp. Null = chưa phân loại (dùng heuristic).
  defaultSaleType: text("default_sale_type", { enum: ["primary", "secondary"] }),
  linkedF1PartnerId: integer("linked_f1_partner_id").references(() => partners.id),

  contractInfo: text("contract_info"),
  contractStatus: text("contract_status", {
    enum: ["chua_ky", "dang_dam_phan", "da_ky", "ngung_hop_tac"],
  }).default("chua_ky"),
  contractDocs: text("contract_docs"),

  brokerageRate: doublePrecision("brokerage_rate").default(0),
  brokerageRateSale: doublePrecision("brokerage_rate_sale").default(0),
  adminFee: doublePrecision("admin_fee").default(0),
  adminFeeSale: doublePrecision("admin_fee_sale").default(0),

  paymentPhases: integer("payment_phases").default(1),
  phaseRate1: doublePrecision("phase_rate_1").default(0),
  phaseRate2: doublePrecision("phase_rate_2").default(0),
  phaseRate3: doublePrecision("phase_rate_3").default(0),
  phaseRate4: doublePrecision("phase_rate_4").default(0),
  phaseRate5: doublePrecision("phase_rate_5").default(0),

  cdtBonusSale: doublePrecision("cdt_bonus_sale").default(0),
  cdtBonusManager: doublePrecision("cdt_bonus_manager").default(0),
  otherFeePct: doublePrecision("other_fee_pct").default(0),
  otherRevenue: doublePrecision("other_revenue").default(0),
  revenueReduction: doublePrecision("revenue_reduction").default(0),
  ctyBonusSale: doublePrecision("cty_bonus_sale").default(0),
  ctyBonusManager: doublePrecision("cty_bonus_manager").default(0),

  paymentDocs: text("payment_docs"),
  note: text("note"),

  // ===== Project Deep Dive (Phase 2 — market intelligence) =====
  totalUnits: integer("total_units"), // Tổng căn dự án theo giấy phép
  launchPhases: jsonb("launch_phases").$type<
    Array<{ phase: string; units: number; launchDate?: string | null; soldPct?: number | null; note?: string | null }>
  >(), // Array các đợt mở bán
  priceRangeMin: doublePrecision("price_range_min"),
  priceRangeMax: doublePrecision("price_range_max"),
  handoverExpected: text("handover_expected"), // YYYY-MM hoặc "Q2 2027"
  developerWebsite: text("developer_website"),
  batdongsanUrl: text("batdongsan_url"),
  cafelandUrl: text("cafeland_url"),
  district: text("district"),
  city: text("city"),
  dataSourceNote: text("data_source_note"),
  dataUpdatedAt: timestamp("data_updated_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ===================== 3. PMG TIERS =====================
export const pmgTiers = pgTable("pmg_tiers", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  tierType: text("tier_type", { enum: ["unit_count", "percent_sold"] }).notNull(),
  thresholdFrom: doublePrecision("threshold_from").default(0),
  thresholdTo: doublePrecision("threshold_to"),
  rate: doublePrecision("rate").notNull(),
  retroactive: boolean("retroactive").default(false),
  note: text("note"),
});

// ===================== 4. PRODUCTS (2.1) =====================
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  productCode: text("product_code").notNull().unique(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  unitCode: text("unit_code").notNull(),
  unitDescription: text("unit_description"),
  // Phân khúc — parse từ unit_description hoặc nhập tay
  unitType: text("unit_type", { enum: ["apartment", "penthouse", "duplex", "shophouse", "commercial"] }).default("apartment"),
  bedrooms: integer("bedrooms"), // 0=studio, 1=1PN, 2=2PN,... null cho penthouse/shophouse
  hasBonusRoom: boolean("has_bonus_room").default(false), // "+PN" — phòng phụ đa năng
  areaM2Net: doublePrecision("area_m2_net"), // Diện tích thông thủy (chuẩn pháp lý)
  areaM2Gross: doublePrecision("area_m2_gross"), // Diện tích tim tường (marketing)
  parseNote: text("parse_note"), // ghi chú khi parse không chắc — cần user review

  customerName: text("customer_name"),
  salesPerson: text("sales_person"),
  deptLeaderName: text("dept_leader_name"),
  deptName: text("dept_name"),
  departmentId: integer("department_id").references(() => departments.id),
  depositDate: text("deposit_date"),
  recognitionMonth: text("recognition_month"), // YYYY-MM, tháng ghi nhận DT
  saleType: text("sale_type", { enum: ["primary", "secondary"] }).default("primary"),
  expectedCompleteDate: text("expected_complete_date"),
  paymentMethod: text("payment_method"),

  sellPrice: doublePrecision("sell_price").default(0),
  pmgBasePrice: doublePrecision("pmg_base_price").default(0),
  totalRevenue: doublePrecision("total_revenue").default(0),
  totalCost: doublePrecision("total_cost").default(0),
  // CP giá vốn khác (Excel sheet 2.1 col AL) — dùng trong công thức R hr-checks
  otherCosts: doublePrecision("other_costs").notNull().default(0),

  pmgRate: doublePrecision("pmg_rate").default(0),
  // Lịch sử thay đổi %PMG_LK (khi CĐT/F1 offer nâng bậc HH theo KPI).
  // JSON string: Array<{ rate: number (decimal), date: string YYYY-MM-DD, note?: string }>
  pmgRateHistory: text("pmg_rate_history"),
  otherFeePct: doublePrecision("other_fee_pct").default(0),
  otherRevenue: doublePrecision("other_revenue").default(0),
  revenueReduction: doublePrecision("revenue_reduction").default(0),
  adminFee: doublePrecision("admin_fee").default(0),

  cdtBonusSale: doublePrecision("cdt_bonus_sale").default(0),
  cdtBonusManager: doublePrecision("cdt_bonus_manager").default(0),
  discountCk: doublePrecision("discount_ck").default(0), // chiết khấu (cột Q Excel mới)

  pmgSaleRate: doublePrecision("pmg_sale_rate").default(0),
  saleCommissionRate: doublePrecision("sale_commission_rate").default(0),
  adminFeeSale: doublePrecision("admin_fee_sale").default(0),
  customerSupport: doublePrecision("customer_support").default(0),
  bonusSale: doublePrecision("bonus_sale").default(0),
  bonusManager: doublePrecision("bonus_manager").default(0),

  kpiCeoRate: doublePrecision("kpi_ceo_rate").default(0),
  kpiTpkdRate: doublePrecision("kpi_tpkd_rate").default(0),
  kpiAdminRate: doublePrecision("kpi_admin_rate").default(0),

  otherCost: doublePrecision("other_cost").default(0),
  note: text("note"),
  snapshotAt: timestamp("snapshot_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ===================== 5. INVOICES =====================
// UNIQUE (invoice_number, invoice_date, partner_id) — mỗi CĐT có sổ HĐ riêng,
// số HĐ trùng giữa các CĐT là hợp lệ, nhưng cùng bộ 3 phải unique.
export const invoices = pgTable(
  "invoices",
  {
    id: serial("id").primaryKey(),
    invoiceNumber: text("invoice_number").notNull(),
    invoiceDate: text("invoice_date"),
    partnerId: integer("partner_id").references(() => partners.id),
    totalAmountVat: doublePrecision("total_amount_vat").default(0),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    numberDatePartnerUniq: uniqueIndex("invoices_number_date_partner_uniq").on(
      t.invoiceNumber,
      sql`COALESCE(${t.invoiceDate}, '')`,
      sql`COALESCE(${t.partnerId}, 0)`,
    ),
  }),
);

// ===================== 6. REVENUE RECONCILIATIONS (2.2) =====================
export const revenueReconciliations = pgTable("revenue_reconciliations", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id),
  reconciliationDate: text("reconciliation_date"),
  minutesNumber: text("minutes_number"),

  invoiceId: integer("invoice_id").references(() => invoices.id),
  phaseNumber: integer("phase_number"),
  phasePctThisTime: doublePrecision("phase_pct_this_time").default(0),
  pmgCumulativePct: doublePrecision("pmg_cumulative_pct").default(0),
  // N = tiến độ khách trả PMG CĐT (cột P sheet 2.2 Excel). Dùng trong công thức
  // tính HH sale target: ((L×M×N − Q)/1.1 − R) × P
  paymentProgressPct: doublePrecision("payment_progress_pct").notNull().default(0),
  pmgSupportPct: doublePrecision("pmg_support_pct").default(0),
  otherRevenuePct: doublePrecision("other_revenue_pct").default(0),

  pmgBasePrice: doublePrecision("pmg_base_price").default(0),
  adminFeeVat: doublePrecision("admin_fee_vat").default(0),
  revenueProgressCumulative: doublePrecision("revenue_progress_cumulative").default(0),
  revenueThisTime: doublePrecision("revenue_this_time").default(0),
  revenueReceivable: doublePrecision("revenue_receivable").default(0),
  revenueRemaining: doublePrecision("revenue_remaining").default(0),
  revenueOffProgress: doublePrecision("revenue_off_progress").default(0),
  revenueReduction: doublePrecision("revenue_reduction").default(0),
  cdtBonusSale: doublePrecision("cdt_bonus_sale").default(0),
  cdtBonusManager: doublePrecision("cdt_bonus_manager").default(0),
  totalReceivableThisTime: doublePrecision("total_receivable_this_time").default(0),

  note: text("note"),
  // Merge model: 1 record chứa nhiều loại (hoa hồng + thưởng nóng sale + QL) cùng
  // 1 hóa đơn. Note riêng cho từng loại lưu trong JSONB dạng:
  //   { "commission": "Đợt 1", "bonus_sale": "Thưởng bán A1-22-09" }
  // Field `note` cũ giữ làm fallback khi notes JSONB rỗng.
  notes: jsonb("notes").$type<Record<string, string>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ===================== 7. PAYMENTS IN =====================
export const paymentsIn = pgTable("payments_in", {
  id: serial("id").primaryKey(),
  reconciliationId: integer("reconciliation_id").references(() => revenueReconciliations.id),
  paymentDate: text("payment_date"),
  amount: doublePrecision("amount").default(0),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ===================== 8. COST RECONCILIATIONS (2.3) =====================
export const costReconciliations = pgTable("cost_reconciliations", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id),
  reconciliationDate: text("reconciliation_date"),
  employeeName: text("employee_name").notNull(),

  costType: text("cost_type", {
    enum: [
      "sale_commission",
      "customer_support",
      "bonus_sale",
      "bonus_manager",
      "cdt_bonus_sale",
      "cdt_bonus_manager",
      "kpi_ceo",
      "kpi_tpkd",
      "kpi_admin",
    ],
  }).notNull(),

  pmgBasePriceSale: doublePrecision("pmg_base_price_sale").default(0),
  pmgLkSaleRate: doublePrecision("pmg_lk_sale_rate").default(0),
  pmgProgressAmount: doublePrecision("pmg_progress_amount").default(0),
  pmgCumulativePctSale: doublePrecision("pmg_cumulative_pct_sale").default(0),
  commissionRate: doublePrecision("commission_rate").default(0),
  adminFeeSale: doublePrecision("admin_fee_sale").default(0),
  customerSupport: doublePrecision("customer_support").default(0),
  fiscalYear: integer("fiscal_year"),

  pmgReconciledCumulative: doublePrecision("pmg_reconciled_cumulative").default(0),
  pmgThisTime: doublePrecision("pmg_this_time").default(0),
  pmgPayable: doublePrecision("pmg_payable").default(0),
  pmgRemaining: doublePrecision("pmg_remaining").default(0),

  kpiRate: doublePrecision("kpi_rate").default(0),
  kpiAmount: doublePrecision("kpi_amount").default(0),

  // N = "Tiến độ PMG đã thu tiền đến ngày đối chiếu" (Excel col 13)
  // Là % khách hàng đã trả CĐT tại thời điểm ĐC. Dùng trong công thức:
  //   HH/KPI lũy kế = ((L × M × N − Q) / 1.1 − R) × P
  paymentProgressPct: doublePrecision("payment_progress_pct").default(0),

  amountPayableThisTime: doublePrecision("amount_payable_this_time").default(0),

  snapshotAt: timestamp("snapshot_at", { withTimezone: true }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ===================== 8.5 PRODUCT ADJUSTMENTS =====================
// Mỗi lần CĐT/công ty điều chỉnh giá/rate/thưởng => 1 adjustment record.
// NULL trong 1 field = "không đổi field đó ở lần điều chỉnh này".
// Sau khi tạo adjustment => auto update product config sang value mới.
export const productAdjustments = pgTable("product_adjustments", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  effectiveDate: text("effective_date").notNull(), // ngày điều chỉnh
  note: text("note"),

  // Chỉ điền field muốn đổi. NULL = giữ nguyên.
  pmgBasePrice: doublePrecision("pmg_base_price"),
  pmgRate: doublePrecision("pmg_rate"),
  pmgSaleRate: doublePrecision("pmg_sale_rate"),
  adminFee: doublePrecision("admin_fee"),
  adminFeeSale: doublePrecision("admin_fee_sale"),
  saleCommissionRate: doublePrecision("sale_commission_rate"),
  kpiCeoRate: doublePrecision("kpi_ceo_rate"),
  kpiTpkdRate: doublePrecision("kpi_tpkd_rate"),
  kpiAdminRate: doublePrecision("kpi_admin_rate"),
  cdtBonusSale: doublePrecision("cdt_bonus_sale"),
  cdtBonusManager: doublePrecision("cdt_bonus_manager"),
  bonusSale: doublePrecision("bonus_sale"),
  bonusManager: doublePrecision("bonus_manager"),
  customerSupport: doublePrecision("customer_support"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ===================== 9. PAYMENTS OUT =====================
export const paymentsOut = pgTable("payments_out", {
  id: serial("id").primaryKey(),
  costReconciliationId: integer("cost_reconciliation_id").references(() => costReconciliations.id),
  paymentDate: text("payment_date"),
  amount: doublePrecision("amount").default(0),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ===================== 10. COMPANY FINANCE =====================
// Vốn đầu tư (capex) — thiết bị/VP/license, có khấu hao hoặc 1 lần
export const companyInvestments = pgTable("company_investments", {
  id: serial("id").primaryKey(),
  investedAt: text("invested_at").notNull(), // YYYY-MM-DD
  category: text("category", {
    enum: ["office", "equipment", "software", "vehicle", "other"],
  }).notNull(),
  description: text("description").notNull(),
  amount: doublePrecision("amount").notNull(),
  // NULL = không khấu hao (1 lần), số = phân bổ đều theo tháng
  amortizationMonths: integer("amortization_months"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Chi phí quản lý (opex) — theo tháng, chi tiết từng khoản
// LEGACY: giữ để không break /finance page cũ. Sẽ migrate sang
// financial_transactions trong Phase 2.
export const companyExpenses = pgTable("company_expenses", {
  id: serial("id").primaryKey(),
  expenseMonth: text("expense_month").notNull(), // YYYY-MM
  category: text("category", {
    enum: ["salary", "rent", "marketing", "utilities", "outsource", "other"],
  }).notNull(),
  amount: doublePrecision("amount").notNull(),
  description: text("description"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ===================== ACCOUNTING SUBSYSTEM (Phase 1 — 2026-07-24) =====================
// Nền tảng cho phần quản lý kế toán/tài chính nội bộ. Không dùng
// company_expenses nữa (legacy) — mọi transaction mới đều vào đây.
//
// Chart of accounts đơn giản, khớp keyword classifier trong lib/accounting/rules.ts

// Bảng tài khoản kế toán (chart of accounts) — theo TT200 simplified.
// Không phải bảng transactions — chỉ danh mục để classifier tra khi phân nhóm.
export const accountingCategories = pgTable("accounting_categories", {
  code: text("code").primaryKey(), // "6421", "6427", "411", "244", ...
  name: text("name").notNull(),
  groupName: text("group_name").notNull(), // "Chi phí quản lý" / "Vốn" / "Tài sản" / ...
  isExpense: boolean("is_expense").notNull().default(true), // false cho vốn/hoàn/cọc
  displayOrder: integer("display_order").notNull().default(100),
  // Nhóm BCTC TT200: "641" (CP bán hàng), "642" (CP quản lý), "811" (CP khác),
  // "242" (CP trả trước), "other" (vốn/tài sản/thuế pass-through)
  groupBctc: text("group_bctc"),
});

// Bảng giao dịch tài chính — 1 row = 1 khoản chi/thu/vốn/hoàn/cọc hộ.
// Dedup theo dedup_key (source file + row hash) để re-import không nhân bản.
export const financialTransactions = pgTable("financial_transactions", {
  id: serial("id").primaryKey(),
  // Ngày phát sinh (fallback = ngày cuối tháng nếu chỉ biết tháng)
  transactionDate: text("transaction_date").notNull(), // YYYY-MM-DD
  transactionMonth: text("transaction_month").notNull(), // YYYY-MM — tháng chi tiền (cash view)
  // Tháng phát sinh recon (accrual view). Default = transactionMonth với row không gắn deal.
  accrualMonth: text("accrual_month").notNull(),
  // Link tới căn để reconciliation + drill-down (nullable — nhiều row không gắn căn)
  productId: integer("product_id").references(() => products.id),
  description: text("description").notNull(),
  amount: doublePrecision("amount").notNull(), // luôn dương
  direction: text("direction", { enum: ["out", "in"] }).notNull().default("out"),

  // Phân loại
  categoryCode: text("category_code")
    .notNull()
    .references(() => accountingCategories.code),
  // Nhóm quản lý mềm — cho UI filter (khác categoryCode nếu cần group nhiều TK)
  managementGroup: text("management_group"),

  // Nguồn tiền
  payer: text("payer"), // "company" / "Triết" / "Bách" / "Nga" / "Tường Vi"
  recipient: text("recipient"),

  // Hóa đơn
  hasInvoice: boolean("has_invoice").notNull().default(false),
  invoiceNo: text("invoice_no"),
  // null = chưa xác định (kế toán sẽ verify sau); true = hợp lệ vào BCTC
  invoiceValid: boolean("invoice_valid"),

  // Truy vết import
  sourceFile: text("source_file").notNull(), // "thanh-toan" / "MERGED-Triết" / "TU-Nga" / ...
  sourceRow: integer("source_row"),
  dedupKey: text("dedup_key").notNull().unique(),

  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ===================== USER PERMISSIONS =====================
export const userPermissions = pgTable("user_permissions", {
  email: text("email").primaryKey(),
  fullName: text("full_name"),
  role: text("role", {
    enum: ["owner", "manager", "sale", "admin", "hr", "viewer", "custom"],
  })
    .notNull()
    .default("viewer"),
  // JSONB: { "resource_key": ["view", "edit", "delete"] }
  permissions: jsonb("permissions").notNull().default({}),
  active: boolean("active").notNull().default(true),
  invitedBy: text("invited_by"),
  invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
  lastLogin: timestamp("last_login", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Cấu hình toàn công ty (single row)
export const companySettings = pgTable("company_settings", {
  id: serial("id").primaryKey(),
  taxRate: doublePrecision("tax_rate").notNull().default(0.20), // Thuế TNDN
  businessStartDate: text("business_start_date"), // YYYY-MM-DD — ngày bắt đầu KD
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ===================== 11. EMPLOYEES =====================
// Danh sách nhân viên/CTV cty. Dùng cho dropdown ở product form (NVKD) +
// cost form (người được đối chiếu). Text field cũ (salesPerson,
// deptLeaderName, employeeName) vẫn giữ để backward compat.
export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  position: text("position", { enum: ["ceo", "tpkd", "nvkd", "admin", "ctv"] })
    .notNull()
    .default("nvkd"),
  departmentId: integer("department_id").references(() => departments.id),
  active: boolean("active").default(true),
  note: text("note"),
  // Nếu set → NV này chỉ đứng tên trên chứng từ, doanh số thực về owner.
  aliasOfId: integer("alias_of_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ===================== 12. ACTIVITY LOGS =====================
// Audit trail cho mọi thay đổi cấu hình. Ghi ai / khi nào / thay đổi gì.
// productId: nếu activity gắn với 1 căn cụ thể (dù entity type là recon
// hay adjustment) → set để filter timeline theo căn dễ dàng.
export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(), // "product" | "product_adjustment" | "revenue_reconciliation" | "cost_reconciliation" | "project" | "partner"
  entityId: integer("entity_id").notNull(),
  action: text("action", { enum: ["create", "update", "delete"] }).notNull(),
  productId: integer("product_id"), // nullable — filter timeline theo căn
  actorEmail: text("actor_email"),
  actorIp: text("actor_ip"),
  // { fieldName: { from: any, to: any } }. Create → chỉ from=null. Delete → chỉ to=null.
  changes: jsonb("changes").$type<Record<string, { from: unknown; to: unknown }>>(),
  summary: text("summary"), // Free text tóm tắt, VD "Sửa %PMG_LK 7% → 8%"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ===================== RELATIONS =====================
export const partnersRelations = relations(partners, ({ many }) => ({
  projects: many(projects),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  partner: one(partners, { fields: [projects.partnerId], references: [partners.id] }),
  linkedF1: one(partners, { fields: [projects.linkedF1PartnerId], references: [partners.id] }),
  pmgTiers: many(pmgTiers),
  products: many(products),
}));

export const pmgTiersRelations = relations(pmgTiers, ({ one }) => ({
  project: one(projects, { fields: [pmgTiers.projectId], references: [projects.id] }),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  project: one(projects, { fields: [products.projectId], references: [projects.id] }),
  department: one(departments, { fields: [products.departmentId], references: [departments.id] }),
  revenueReconciliations: many(revenueReconciliations),
  costReconciliations: many(costReconciliations),
}));

export const departmentsRelations = relations(departments, ({ many }) => ({
  products: many(products),
  employees: many(employees),
}));

export const employeesRelations = relations(employees, ({ one }) => ({
  department: one(departments, { fields: [employees.departmentId], references: [departments.id] }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  partner: one(partners, { fields: [invoices.partnerId], references: [partners.id] }),
  revenueReconciliations: many(revenueReconciliations),
}));

export const revenueReconciliationsRelations = relations(revenueReconciliations, ({ one, many }) => ({
  product: one(products, { fields: [revenueReconciliations.productId], references: [products.id] }),
  invoice: one(invoices, { fields: [revenueReconciliations.invoiceId], references: [invoices.id] }),
  payments: many(paymentsIn),
}));

export const paymentsInRelations = relations(paymentsIn, ({ one }) => ({
  reconciliation: one(revenueReconciliations, {
    fields: [paymentsIn.reconciliationId],
    references: [revenueReconciliations.id],
  }),
}));

export const costReconciliationsRelations = relations(costReconciliations, ({ one, many }) => ({
  product: one(products, { fields: [costReconciliations.productId], references: [products.id] }),
  payments: many(paymentsOut),
}));

export const paymentsOutRelations = relations(paymentsOut, ({ one }) => ({
  reconciliation: one(costReconciliations, {
    fields: [paymentsOut.costReconciliationId],
    references: [costReconciliations.id],
  }),
}));

// ===================== EXPORT TYPES =====================
export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Department = typeof departments.$inferSelect;
export type NewDepartment = typeof departments.$inferInsert;
export type Partner = typeof partners.$inferSelect;
export type NewPartner = typeof partners.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type PmgTier = typeof pmgTiers.$inferSelect;
export type NewPmgTier = typeof pmgTiers.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type RevenueReconciliation = typeof revenueReconciliations.$inferSelect;
export type NewRevenueReconciliation = typeof revenueReconciliations.$inferInsert;
export type PaymentIn = typeof paymentsIn.$inferSelect;
export type NewPaymentIn = typeof paymentsIn.$inferInsert;
export type CostReconciliation = typeof costReconciliations.$inferSelect;
export type NewCostReconciliation = typeof costReconciliations.$inferInsert;
export type ProductAdjustment = typeof productAdjustments.$inferSelect;
export type NewProductAdjustment = typeof productAdjustments.$inferInsert;
export type PaymentOut = typeof paymentsOut.$inferSelect;
export type NewPaymentOut = typeof paymentsOut.$inferInsert;
export type CompanyInvestment = typeof companyInvestments.$inferSelect;
export type NewCompanyInvestment = typeof companyInvestments.$inferInsert;
export type CompanyExpense = typeof companyExpenses.$inferSelect;
export type NewCompanyExpense = typeof companyExpenses.$inferInsert;
export type AccountingCategory = typeof accountingCategories.$inferSelect;
export type NewAccountingCategory = typeof accountingCategories.$inferInsert;
export type FinancialTransaction = typeof financialTransactions.$inferSelect;
export type NewFinancialTransaction = typeof financialTransactions.$inferInsert;
export type CompanySettings = typeof companySettings.$inferSelect;
export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;

// Used in raw SQL for profile auto-create trigger
export const _sql = sql;
