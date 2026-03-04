CREATE TABLE IF NOT EXISTS "countrylab_lms"."suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"company" varchar(255),
	"email" varchar(255),
	"phone" varchar(50),
	"address" text,
	"contact_person" varchar(255),
	"website" varchar(255),
	"tax_id" varchar(100),
	"payment_terms" varchar(100),
	"currency" varchar(10) DEFAULT 'NGN',
	"total_spent" real DEFAULT 0,
	"total_orders" integer DEFAULT 0,
	"notes" text,
	"is_active" boolean DEFAULT true,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "countrylab_lms"."purchase_orders" ADD COLUMN "supplier_id" uuid;--> statement-breakpoint
ALTER TABLE "countrylab_lms"."reagents" ADD COLUMN "catalog_number" varchar(100);--> statement-breakpoint
ALTER TABLE "countrylab_lms"."reagents" ADD COLUMN "lot_number" varchar(100);--> statement-breakpoint
ALTER TABLE "countrylab_lms"."reagents" ADD COLUMN "supplier_id" uuid;--> statement-breakpoint
ALTER TABLE "countrylab_lms"."reagents" ADD COLUMN "category" varchar(100);--> statement-breakpoint
ALTER TABLE "countrylab_lms"."reagents" ADD COLUMN "unit_price" real DEFAULT 0;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "countrylab_lms"."suppliers" ADD CONSTRAINT "suppliers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "countrylab_lms"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "countrylab_lms"."suppliers" ADD CONSTRAINT "suppliers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "countrylab_lms"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "countrylab_lms"."purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "countrylab_lms"."suppliers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "countrylab_lms"."reagents" ADD CONSTRAINT "reagents_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "countrylab_lms"."suppliers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
