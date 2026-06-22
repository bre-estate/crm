CREATE TABLE "departments" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"leader_name" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "departments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "department_id" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "recognition_month" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "sale_type" text DEFAULT 'primary';--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;