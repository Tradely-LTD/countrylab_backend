import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const NEW_ROLES = [
  "general_manager",
  "hr_manager",
  "operations_manager",
  "lab_manager",
  "secretary",
  "marketing_officer",
  "internal_auditor",
];

async function runMigration() {
  console.log("🚀 Running migration 0009: Organisational Roles & Staff Training Logs...");

  try {
    // ADD VALUE cannot run inside a transaction block, so add each role separately
    for (const role of NEW_ROLES) {
      await pool.query(
        `ALTER TYPE countrylab_lms.user_role ADD VALUE IF NOT EXISTS '${role}';`,
      );
    }

    console.log(`✅ Added roles: ${NEW_ROLES.join(", ")}`);

    // Create staff_training_logs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS countrylab_lms.staff_training_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES countrylab_lms.tenants(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES countrylab_lms.users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        category VARCHAR(100),
        provider VARCHAR(255),
        completed_on DATE NOT NULL,
        expires_on DATE,
        notes TEXT,
        recorded_by UUID REFERENCES countrylab_lms.users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log("✅ Created staff_training_logs table");

    await pool.query(`
      CREATE INDEX IF NOT EXISTS staff_training_tenant_idx ON countrylab_lms.staff_training_logs(tenant_id);
      CREATE INDEX IF NOT EXISTS staff_training_user_idx ON countrylab_lms.staff_training_logs(user_id);
    `);

    console.log("✅ Created indexes");

    console.log("🎉 Migration 0009 completed successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

runMigration();
