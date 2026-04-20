import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function runMigration() {
  console.log(
    "🚀 Running migration 0008: Invoice Discounts, Client Status & CRM Interactions...",
  );

  try {
    // Add discount columns to invoices table
    await pool.query(`
      ALTER TABLE countrylab_lms.invoices
        ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20) DEFAULT 'percentage',
        ADD COLUMN IF NOT EXISTS discount_value REAL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS discount_amount REAL DEFAULT 0;
    `);

    console.log(
      "✅ Added discount_type, discount_value, discount_amount to invoices table",
    );

    // Add client_status column to clients table
    await pool.query(`
      ALTER TABLE countrylab_lms.clients
        ADD COLUMN IF NOT EXISTS client_status VARCHAR(20) DEFAULT 'active';
    `);

    console.log("✅ Added client_status to clients table");

    // Create client_interactions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS countrylab_lms.client_interactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES countrylab_lms.tenants(id) ON DELETE CASCADE,
        client_id UUID NOT NULL REFERENCES countrylab_lms.clients(id) ON DELETE CASCADE,
        staff_id UUID NOT NULL REFERENCES countrylab_lms.users(id),
        type VARCHAR(50) NOT NULL,
        date TIMESTAMP NOT NULL,
        notes TEXT,
        outcome VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log("✅ Created client_interactions table");

    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS client_interactions_tenant_idx ON countrylab_lms.client_interactions(tenant_id);
      CREATE INDEX IF NOT EXISTS client_interactions_client_idx ON countrylab_lms.client_interactions(client_id);
      CREATE INDEX IF NOT EXISTS client_interactions_staff_idx ON countrylab_lms.client_interactions(staff_id);
    `);

    console.log("✅ Created indexes");

    console.log("🎉 Migration 0008 completed successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

runMigration();
