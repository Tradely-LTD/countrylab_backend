import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function runMigration() {
  console.log("🚀 Running migration 0006: Sample Requests Module...");

  try {
    // Create request_status enum
    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE countrylab_lms.request_status AS ENUM (
          'pending',
          'under_review',
          'approved',
          'rejected',
          'sample_received',
          'completed',
          'cancelled'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    console.log("✅ Created request_status enum");

    // Create sample_requests table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS countrylab_lms.sample_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES countrylab_lms.tenants(id) ON DELETE CASCADE,
        request_number VARCHAR(50) UNIQUE NOT NULL,
        client_id UUID NOT NULL REFERENCES countrylab_lms.clients(id),
        
        -- Representative Information
        representative_name VARCHAR(255),
        representative_phone VARCHAR(50),
        representative_email VARCHAR(255),
        
        -- Sample Information
        product_name VARCHAR(255),
        sample_source TEXT,
        sample_type VARCHAR(100),
        production_date TIMESTAMP,
        expiry_date TIMESTAMP,
        batch_number VARCHAR(100),
        
        -- Analysis Details
        intended_use TEXT,
        reference_standard VARCHAR(100),
        test_category VARCHAR(50), -- comprehensive, basic, proximate, other
        test_category_other VARCHAR(255),
        requested_tests JSONB DEFAULT '[]', -- Array of test method IDs
        
        -- Additional fields from sample registration
        sample_container VARCHAR(100),
        sample_volume VARCHAR(50),
        sample_condition VARCHAR(50),
        temperature_on_receipt VARCHAR(50),
        sampling_point TEXT,
        manufacturer VARCHAR(255),
        matrix VARCHAR(100),
        
        -- Official Use
        reference_standard_available BOOLEAN,
        service_offered BOOLEAN,
        test_resources_available BOOLEAN,
        sample_quantity_sufficient BOOLEAN,
        invoice_issued BOOLEAN,
        payment_confirmed BOOLEAN,
        official_remarks TEXT,
        
        -- Workflow
        status countrylab_lms.request_status DEFAULT 'pending',
        sample_id UUID REFERENCES countrylab_lms.samples(id),
        invoice_id UUID REFERENCES countrylab_lms.invoices(id),
        quotation_amount REAL,
        
        -- Tracking
        received_by UUID REFERENCES countrylab_lms.users(id),
        reviewed_by UUID REFERENCES countrylab_lms.users(id),
        approved_by UUID REFERENCES countrylab_lms.users(id),
        reviewed_at TIMESTAMP,
        approved_at TIMESTAMP,
        rejection_reason TEXT,
        
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log("✅ Created sample_requests table");

    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS sample_requests_tenant_idx ON countrylab_lms.sample_requests(tenant_id);
      CREATE INDEX IF NOT EXISTS sample_requests_client_idx ON countrylab_lms.sample_requests(client_id);
      CREATE INDEX IF NOT EXISTS sample_requests_status_idx ON countrylab_lms.sample_requests(status);
      CREATE INDEX IF NOT EXISTS sample_requests_number_idx ON countrylab_lms.sample_requests(request_number);
    `);

    console.log("✅ Created indexes");

    console.log("🎉 Migration 0006 completed successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

runMigration();
