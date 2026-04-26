CREATE TABLE "cost_reconciliations" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"reconciliation_date" text,
	"employee_name" text NOT NULL,
	"cost_type" text NOT NULL,
	"pmg_base_price_sale" real DEFAULT 0,
	"pmg_lk_sale_rate" real DEFAULT 0,
	"pmg_progress_amount" real DEFAULT 0,
	"pmg_cumulative_pct_sale" real DEFAULT 0,
	"commission_rate" real DEFAULT 0,
	"admin_fee_sale" real DEFAULT 0,
	"customer_support" real DEFAULT 0,
	"fiscal_year" integer,
	"pmg_reconciled_cumulative" real DEFAULT 0,
	"pmg_this_time" real DEFAULT 0,
	"pmg_payable" real DEFAULT 0,
	"pmg_remaining" real DEFAULT 0,
	"kpi_rate" real DEFAULT 0,
	"kpi_amount" real DEFAULT 0,
	"amount_payable_this_time" real DEFAULT 0,
	"snapshot_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_number" text NOT NULL,
	"invoice_date" text,
	"partner_id" integer,
	"total_amount_vat" real DEFAULT 0,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"legal_name" text,
	"tax_code" text,
	"address" text,
	"email" text,
	"phone" text,
	"contact_person" text,
	"status" text DEFAULT 'active',
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partners_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "payments_in" (
	"id" serial PRIMARY KEY NOT NULL,
	"reconciliation_id" integer,
	"payment_date" text,
	"amount" real DEFAULT 0,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments_out" (
	"id" serial PRIMARY KEY NOT NULL,
	"cost_reconciliation_id" integer,
	"payment_date" text,
	"amount" real DEFAULT 0,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pmg_tiers" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"tier_type" text NOT NULL,
	"threshold_from" real DEFAULT 0,
	"threshold_to" real,
	"rate" real NOT NULL,
	"retroactive" boolean DEFAULT false,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_code" text NOT NULL,
	"project_id" integer NOT NULL,
	"unit_code" text NOT NULL,
	"unit_description" text,
	"customer_name" text,
	"sales_person" text,
	"dept_name" text,
	"deposit_date" text,
	"expected_complete_date" text,
	"payment_method" text,
	"sell_price" real DEFAULT 0,
	"pmg_base_price" real DEFAULT 0,
	"total_revenue" real DEFAULT 0,
	"total_cost" real DEFAULT 0,
	"pmg_rate" real DEFAULT 0,
	"other_fee_pct" real DEFAULT 0,
	"other_revenue" real DEFAULT 0,
	"revenue_reduction" real DEFAULT 0,
	"admin_fee" real DEFAULT 0,
	"cdt_bonus_sale" real DEFAULT 0,
	"cdt_bonus_manager" real DEFAULT 0,
	"pmg_sale_rate" real DEFAULT 0,
	"sale_commission_rate" real DEFAULT 0,
	"admin_fee_sale" real DEFAULT 0,
	"customer_support" real DEFAULT 0,
	"bonus_sale" real DEFAULT 0,
	"bonus_manager" real DEFAULT 0,
	"kpi_ceo_rate" real DEFAULT 0,
	"kpi_tpkd_rate" real DEFAULT 0,
	"kpi_admin_rate" real DEFAULT 0,
	"other_cost" real DEFAULT 0,
	"note" text,
	"snapshot_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_product_code_unique" UNIQUE("product_code")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text,
	"full_name" text,
	"role" text DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"full_code" text NOT NULL,
	"name" text NOT NULL,
	"partner_id" integer NOT NULL,
	"bre_role" text DEFAULT 'f1' NOT NULL,
	"linked_f1_partner_id" integer,
	"contract_info" text,
	"contract_status" text DEFAULT 'chua_ky',
	"contract_docs" text,
	"brokerage_rate" real DEFAULT 0,
	"brokerage_rate_sale" real DEFAULT 0,
	"admin_fee" real DEFAULT 0,
	"admin_fee_sale" real DEFAULT 0,
	"payment_phases" integer DEFAULT 1,
	"phase_rate_1" real DEFAULT 0,
	"phase_rate_2" real DEFAULT 0,
	"phase_rate_3" real DEFAULT 0,
	"phase_rate_4" real DEFAULT 0,
	"phase_rate_5" real DEFAULT 0,
	"cdt_bonus_sale" real DEFAULT 0,
	"cdt_bonus_manager" real DEFAULT 0,
	"other_fee_pct" real DEFAULT 0,
	"other_revenue" real DEFAULT 0,
	"revenue_reduction" real DEFAULT 0,
	"cty_bonus_sale" real DEFAULT 0,
	"cty_bonus_manager" real DEFAULT 0,
	"payment_docs" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_full_code_unique" UNIQUE("full_code")
);
--> statement-breakpoint
CREATE TABLE "revenue_reconciliations" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"reconciliation_date" text,
	"minutes_number" text,
	"invoice_id" integer,
	"phase_number" integer,
	"phase_pct_this_time" real DEFAULT 0,
	"pmg_cumulative_pct" real DEFAULT 0,
	"pmg_support_pct" real DEFAULT 0,
	"other_revenue_pct" real DEFAULT 0,
	"pmg_base_price" real DEFAULT 0,
	"admin_fee_vat" real DEFAULT 0,
	"revenue_progress_cumulative" real DEFAULT 0,
	"revenue_this_time" real DEFAULT 0,
	"revenue_receivable" real DEFAULT 0,
	"revenue_remaining" real DEFAULT 0,
	"revenue_off_progress" real DEFAULT 0,
	"revenue_reduction" real DEFAULT 0,
	"cdt_bonus_sale" real DEFAULT 0,
	"cdt_bonus_manager" real DEFAULT 0,
	"total_receivable_this_time" real DEFAULT 0,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cost_reconciliations" ADD CONSTRAINT "cost_reconciliations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments_in" ADD CONSTRAINT "payments_in_reconciliation_id_revenue_reconciliations_id_fk" FOREIGN KEY ("reconciliation_id") REFERENCES "public"."revenue_reconciliations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments_out" ADD CONSTRAINT "payments_out_cost_reconciliation_id_cost_reconciliations_id_fk" FOREIGN KEY ("cost_reconciliation_id") REFERENCES "public"."cost_reconciliations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmg_tiers" ADD CONSTRAINT "pmg_tiers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_linked_f1_partner_id_partners_id_fk" FOREIGN KEY ("linked_f1_partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_reconciliations" ADD CONSTRAINT "revenue_reconciliations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_reconciliations" ADD CONSTRAINT "revenue_reconciliations_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;