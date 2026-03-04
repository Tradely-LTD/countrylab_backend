DO $$ BEGIN
 CREATE TYPE "public"."asset_status" AS ENUM('operational', 'under_repair', 'calibration_due', 'decommissioned');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."reagent_grade" AS ENUM('AR', 'HPLC', 'GR', 'LR', 'Technical');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."requisition_status" AS ENUM('draft', 'pending_review', 'pending_approval', 'approved', 'rejected', 'ordered');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."result_status" AS ENUM('draft', 'submitted', 'under_review', 'approved', 'rejected', 'voided');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."sample_status" AS ENUM('received', 'in_testing', 'pending_review', 'approved', 'disposed', 'voided');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."sop_status" AS ENUM('draft', 'under_review', 'published', 'archived');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."ticket_status" AS ENUM('open', 'in_progress', 'resolved', 'closed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."ticket_type" AS ENUM('technical_error', 'delayed_result', 'billing_issue', 'behavior', 'other');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'md', 'quality_manager', 'lab_analyst', 'procurement_officer', 'inventory_manager', 'customer', 'finance', 'business_development');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "asset_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"action" varchar(100) NOT NULL,
	"description" text,
	"performed_by" uuid,
	"performed_at" timestamp DEFAULT now(),
	"next_due_date" timestamp,
	"attachment_url" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"asset_tag" varchar(100),
	"model" varchar(255),
	"serial_number" varchar(255),
	"manufacturer" varchar(255),
	"purchase_date" timestamp,
	"warranty_expiry" timestamp,
	"status" "asset_status" DEFAULT 'operational',
	"custodian_id" uuid,
	"location" varchar(255),
	"calibration_frequency_days" integer,
	"last_calibration_date" timestamp,
	"next_calibration_date" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"action" varchar(100) NOT NULL,
	"table_name" varchar(100),
	"record_id" uuid,
	"old_value" jsonb,
	"new_value" jsonb,
	"ip_address" varchar(50),
	"user_agent" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"company" varchar(255),
	"email" varchar(255),
	"phone" varchar(50),
	"address" text,
	"contact_person" varchar(255),
	"notes" text,
	"is_active" boolean DEFAULT true,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_number" varchar(50) NOT NULL,
	"client_id" uuid NOT NULL,
	"result_id" uuid,
	"sample_id" uuid,
	"line_items" jsonb DEFAULT '[]'::jsonb,
	"subtotal" real DEFAULT 0,
	"tax_rate" real DEFAULT 0,
	"tax_amount" real DEFAULT 0,
	"total" real DEFAULT 0,
	"currency" varchar(10) DEFAULT 'NGN',
	"status" varchar(50) DEFAULT 'unpaid',
	"due_date" timestamp,
	"paid_at" timestamp,
	"payment_method" varchar(100),
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(100) NOT NULL,
	"title" varchar(500) NOT NULL,
	"message" text,
	"link" varchar(500),
	"is_read" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"po_number" varchar(50) NOT NULL,
	"requisition_id" uuid,
	"supplier_name" varchar(255),
	"supplier_contact" varchar(255),
	"total_amount" real,
	"currency" varchar(10) DEFAULT 'NGN',
	"status" varchar(50) DEFAULT 'pending',
	"invoice_url" text,
	"notes" text,
	"ordered_by" uuid,
	"ordered_at" timestamp,
	"received_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "purchase_orders_po_number_unique" UNIQUE("po_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reagents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"chemical_name" varchar(255),
	"cas_number" varchar(50),
	"manufacturer" varchar(255),
	"grade" "reagent_grade",
	"batch_number" varchar(100),
	"quantity" real DEFAULT 0,
	"unit" varchar(50) DEFAULT 'units',
	"reorder_level" real DEFAULT 10,
	"expiry_date" timestamp,
	"storage_conditions" varchar(255),
	"storage_location" varchar(200),
	"is_active" boolean DEFAULT true,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "requisitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"requisition_number" varchar(50) NOT NULL,
	"prepared_by" uuid NOT NULL,
	"reviewed_by" uuid,
	"approved_by" uuid,
	"department" varchar(100),
	"urgency" varchar(50) DEFAULT 'routine',
	"required_date" timestamp,
	"status" "requisition_status" DEFAULT 'draft',
	"items" jsonb DEFAULT '[]'::jsonb,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "requisitions_requisition_number_unique" UNIQUE("requisition_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "result_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"result_id" uuid NOT NULL,
	"changed_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"old_parameters" jsonb,
	"new_parameters" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sample_id" uuid NOT NULL,
	"test_method_id" uuid,
	"analyst_id" uuid NOT NULL,
	"reviewer_id" uuid,
	"approver_id" uuid,
	"parameters" jsonb DEFAULT '[]'::jsonb,
	"overall_status" "result_status" DEFAULT 'draft',
	"coa_url" text,
	"qr_hash" varchar(64),
	"qr_code_url" text,
	"reviewed_at" timestamp,
	"approved_at" timestamp,
	"locked_at" timestamp,
	"voided_at" timestamp,
	"void_reason" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "results_qr_hash_unique" UNIQUE("qr_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "samples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ulid" varchar(30) NOT NULL,
	"client_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"matrix" varchar(100),
	"collection_date" timestamp,
	"received_at" timestamp DEFAULT now(),
	"status" "sample_status" DEFAULT 'received' NOT NULL,
	"storage_zone" varchar(100),
	"storage_location" varchar(200),
	"assigned_analyst_id" uuid,
	"barcode_url" text,
	"disposed_at" timestamp,
	"voided_at" timestamp,
	"void_reason" text,
	"notes" text,
	"received_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "samples_ulid_unique" UNIQUE("ulid")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" varchar(500) NOT NULL,
	"document_number" varchar(100),
	"version" varchar(20) DEFAULT '1.0',
	"category" varchar(100),
	"document_url" text,
	"status" "sop_status" DEFAULT 'draft',
	"submitted_by" uuid,
	"reviewed_by" uuid,
	"approved_by" uuid,
	"parent_sop_id" uuid,
	"linked_asset_id" uuid,
	"effective_date" timestamp,
	"review_date" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"logo_url" text,
	"address" text,
	"phone" varchar(50),
	"email" varchar(255),
	"accreditation_number" varchar(100),
	"is_active" boolean DEFAULT true,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "test_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(100) NOT NULL,
	"standard" varchar(100),
	"category" varchar(100),
	"parameters" jsonb DEFAULT '[]'::jsonb,
	"turnaround_days" integer DEFAULT 3,
	"price" real DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ticket_number" varchar(50) NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text,
	"source" varchar(50) DEFAULT 'internal',
	"type" "ticket_type" NOT NULL,
	"status" "ticket_status" DEFAULT 'open',
	"priority" varchar(50) DEFAULT 'medium',
	"reported_by_user" uuid,
	"reported_by_client" uuid,
	"assigned_to" uuid,
	"resolution_notes" text,
	"resolution_rating" integer,
	"resolved_at" timestamp,
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "tickets_ticket_number_unique" UNIQUE("ticket_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"supabase_user_id" uuid,
	"email" varchar(255) NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"role" "user_role" DEFAULT 'lab_analyst' NOT NULL,
	"department" varchar(100),
	"phone" varchar(50),
	"avatar_url" text,
	"is_active" boolean DEFAULT true,
	"requires_2fa" boolean DEFAULT false,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_supabase_user_id_unique" UNIQUE("supabase_user_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "asset_logs" ADD CONSTRAINT "asset_logs_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "asset_logs" ADD CONSTRAINT "asset_logs_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assets" ADD CONSTRAINT "assets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assets" ADD CONSTRAINT "assets_custodian_id_users_id_fk" FOREIGN KEY ("custodian_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clients" ADD CONSTRAINT "clients_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_result_id_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."results"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_sample_id_samples_id_fk" FOREIGN KEY ("sample_id") REFERENCES "public"."samples"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_ordered_by_users_id_fk" FOREIGN KEY ("ordered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reagents" ADD CONSTRAINT "reagents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reagents" ADD CONSTRAINT "reagents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_prepared_by_users_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "result_changes" ADD CONSTRAINT "result_changes_result_id_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."results"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "result_changes" ADD CONSTRAINT "result_changes_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "results" ADD CONSTRAINT "results_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "results" ADD CONSTRAINT "results_sample_id_samples_id_fk" FOREIGN KEY ("sample_id") REFERENCES "public"."samples"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "results" ADD CONSTRAINT "results_test_method_id_test_methods_id_fk" FOREIGN KEY ("test_method_id") REFERENCES "public"."test_methods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "results" ADD CONSTRAINT "results_analyst_id_users_id_fk" FOREIGN KEY ("analyst_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "results" ADD CONSTRAINT "results_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "results" ADD CONSTRAINT "results_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "samples" ADD CONSTRAINT "samples_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "samples" ADD CONSTRAINT "samples_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "samples" ADD CONSTRAINT "samples_assigned_analyst_id_users_id_fk" FOREIGN KEY ("assigned_analyst_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "samples" ADD CONSTRAINT "samples_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sops" ADD CONSTRAINT "sops_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sops" ADD CONSTRAINT "sops_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sops" ADD CONSTRAINT "sops_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sops" ADD CONSTRAINT "sops_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sops" ADD CONSTRAINT "sops_linked_asset_id_assets_id_fk" FOREIGN KEY ("linked_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "test_methods" ADD CONSTRAINT "test_methods_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tickets" ADD CONSTRAINT "tickets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tickets" ADD CONSTRAINT "tickets_reported_by_user_users_id_fk" FOREIGN KEY ("reported_by_user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tickets" ADD CONSTRAINT "tickets_reported_by_client_clients_id_fk" FOREIGN KEY ("reported_by_client") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_tenant_idx" ON "audit_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_user_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "results_tenant_idx" ON "results" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "results_sample_idx" ON "results" USING btree ("sample_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "results_status_idx" ON "results" USING btree ("overall_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "samples_tenant_idx" ON "samples" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "samples_status_idx" ON "samples" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "samples_client_idx" ON "samples" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_tenant_email_idx" ON "users" USING btree ("tenant_id","email");