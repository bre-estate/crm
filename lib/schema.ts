import {
  pgTable,
  text,
  integer,
  serial,
  real,
  timestamp,
  boolean,
  uuid,
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
  partnerId: integer("partner_id").notNull().references(() => partners.id),
  breRole: text("bre_role", { enum: ["f1", "f2"] }).notNull().default("f1"),
  linkedF1PartnerId: integer("linked_f1_partner_id").references(() => partners.id),

  contractInfo: text("contract_info"),
  contractStatus: text("contract_status", {
    enum: ["chua_ky", "dang_dam_phan", "da_ky", "ngung_hop_tac"],
  }).default("chua_ky"),
  contractDocs: text("contract_docs"),

  brokerageRate: real("brokerage_rate").default(0),
  brokerageRateSale: real("brokerage_rate_sale").default(0),
  adminFee: real("admin_fee").default(0),
  adminFeeSale: real("admin_fee_sale").default(0),

  paymentPhases: integer("payment_phases").default(1),
  phaseRate1: real("phase_rate_1").default(0),
  phaseRate2: real("phase_rate_2").default(0),
  phaseRate3: real("phase_rate_3").default(0),
  phaseRate4: real("phase_rate_4").default(0),
  phaseRate5: real("phase_rate_5").default(0),

  cdtBonusSale: real("cdt_bonus_sale").default(0),
  cdtBonusManager: real("cdt_bonus_manager").default(0),
  otherFeePct: real("other_fee_pct").default(0),
  otherRevenue: real("other_revenue").default(0),
  revenueReduction: real("revenue_reduction").default(0),
  ctyBonusSale: real("cty_bonus_sale").default(0),
  ctyBonusManager: real("cty_bonus_manager").default(0),

  paymentDocs: text("payment_docs"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ===================== 3. PMG TIERS =====================
export const pmgTiers = pgTable("pmg_tiers", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  tierType: text("tier_type", { enum: ["unit_count", "percent_sold"] }).notNull(),
  thresholdFrom: real("threshold_from").default(0),
  thresholdTo: real("threshold_to"),
  rate: real("rate").notNull(),
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

  customerName: text("customer_name"),
  salesPerson: text("sales_person"),
  deptName: text("dept_name"),
  depositDate: text("deposit_date"),
  expectedCompleteDate: text("expected_complete_date"),
  paymentMethod: text("payment_method"),

  sellPrice: real("sell_price").default(0),
  pmgBasePrice: real("pmg_base_price").default(0),
  totalRevenue: real("total_revenue").default(0),
  totalCost: real("total_cost").default(0),

  pmgRate: real("pmg_rate").default(0),
  otherFeePct: real("other_fee_pct").default(0),
  otherRevenue: real("other_revenue").default(0),
  revenueReduction: real("revenue_reduction").default(0),
  adminFee: real("admin_fee").default(0),

  cdtBonusSale: real("cdt_bonus_sale").default(0),
  cdtBonusManager: real("cdt_bonus_manager").default(0),

  pmgSaleRate: real("pmg_sale_rate").default(0),
  saleCommissionRate: real("sale_commission_rate").default(0),
  adminFeeSale: real("admin_fee_sale").default(0),
  customerSupport: real("customer_support").default(0),
  bonusSale: real("bonus_sale").default(0),
  bonusManager: real("bonus_manager").default(0),

  kpiCeoRate: real("kpi_ceo_rate").default(0),
  kpiTpkdRate: real("kpi_tpkd_rate").default(0),
  kpiAdminRate: real("kpi_admin_rate").default(0),

  otherCost: real("other_cost").default(0),
  note: text("note"),
  snapshotAt: timestamp("snapshot_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ===================== 5. INVOICES =====================
export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  invoiceNumber: text("invoice_number").notNull(),
  invoiceDate: text("invoice_date"),
  partnerId: integer("partner_id").references(() => partners.id),
  totalAmountVat: real("total_amount_vat").default(0),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ===================== 6. REVENUE RECONCILIATIONS (2.2) =====================
export const revenueReconciliations = pgTable("revenue_reconciliations", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id),
  reconciliationDate: text("reconciliation_date"),
  minutesNumber: text("minutes_number"),

  invoiceId: integer("invoice_id").references(() => invoices.id),
  phaseNumber: integer("phase_number"),
  phasePctThisTime: real("phase_pct_this_time").default(0),
  pmgCumulativePct: real("pmg_cumulative_pct").default(0),
  pmgSupportPct: real("pmg_support_pct").default(0),
  otherRevenuePct: real("other_revenue_pct").default(0),

  pmgBasePrice: real("pmg_base_price").default(0),
  adminFeeVat: real("admin_fee_vat").default(0),
  revenueProgressCumulative: real("revenue_progress_cumulative").default(0),
  revenueThisTime: real("revenue_this_time").default(0),
  revenueReceivable: real("revenue_receivable").default(0),
  revenueRemaining: real("revenue_remaining").default(0),
  revenueOffProgress: real("revenue_off_progress").default(0),
  revenueReduction: real("revenue_reduction").default(0),
  cdtBonusSale: real("cdt_bonus_sale").default(0),
  cdtBonusManager: real("cdt_bonus_manager").default(0),
  totalReceivableThisTime: real("total_receivable_this_time").default(0),

  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ===================== 7. PAYMENTS IN =====================
export const paymentsIn = pgTable("payments_in", {
  id: serial("id").primaryKey(),
  reconciliationId: integer("reconciliation_id").references(() => revenueReconciliations.id),
  paymentDate: text("payment_date"),
  amount: real("amount").default(0),
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
      "kpi_ceo",
      "kpi_tpkd",
      "kpi_admin",
    ],
  }).notNull(),

  pmgBasePriceSale: real("pmg_base_price_sale").default(0),
  pmgLkSaleRate: real("pmg_lk_sale_rate").default(0),
  pmgProgressAmount: real("pmg_progress_amount").default(0),
  pmgCumulativePctSale: real("pmg_cumulative_pct_sale").default(0),
  commissionRate: real("commission_rate").default(0),
  adminFeeSale: real("admin_fee_sale").default(0),
  customerSupport: real("customer_support").default(0),
  fiscalYear: integer("fiscal_year"),

  pmgReconciledCumulative: real("pmg_reconciled_cumulative").default(0),
  pmgThisTime: real("pmg_this_time").default(0),
  pmgPayable: real("pmg_payable").default(0),
  pmgRemaining: real("pmg_remaining").default(0),

  kpiRate: real("kpi_rate").default(0),
  kpiAmount: real("kpi_amount").default(0),

  amountPayableThisTime: real("amount_payable_this_time").default(0),

  snapshotAt: timestamp("snapshot_at", { withTimezone: true }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ===================== 9. PAYMENTS OUT =====================
export const paymentsOut = pgTable("payments_out", {
  id: serial("id").primaryKey(),
  costReconciliationId: integer("cost_reconciliation_id").references(() => costReconciliations.id),
  paymentDate: text("payment_date"),
  amount: real("amount").default(0),
  note: text("note"),
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
  revenueReconciliations: many(revenueReconciliations),
  costReconciliations: many(costReconciliations),
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
export type PaymentOut = typeof paymentsOut.$inferSelect;
export type NewPaymentOut = typeof paymentsOut.$inferInsert;

// Used in raw SQL for profile auto-create trigger
export const _sql = sql;
