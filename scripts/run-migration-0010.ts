import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function runMigration() {
  console.log("🚀 Running migration 0010: Configurable Roles & Permissions...");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // users.role becomes free text so tenants can define custom roles.
    // Skipped when it is already a varchar, so the migration can be re-run.
    const { rows } = await client.query(`
      SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'countrylab_lms' AND table_name = 'users' AND column_name = 'role'
    `);
    if (rows[0]?.data_type === "USER-DEFINED") {
      await client.query(`
        ALTER TABLE countrylab_lms.users
          ALTER COLUMN role DROP DEFAULT,
          ALTER COLUMN role TYPE VARCHAR(50) USING role::text,
          ALTER COLUMN role SET DEFAULT 'lab_analyst';
      `);
      console.log("✅ Converted users.role from enum to VARCHAR(50)");
    } else {
      console.log("ℹ️  users.role is already text — skipped");
    }

    // Per-tenant role definitions; built-in roles get a row once edited
    await client.query(`
      CREATE TABLE IF NOT EXISTS countrylab_lms.roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES countrylab_lms.tenants(id) ON DELETE CASCADE,
        key VARCHAR(50) NOT NULL,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        is_system BOOLEAN NOT NULL DEFAULT FALSE,
        permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS roles_tenant_key_idx
        ON countrylab_lms.roles(tenant_id, key);
    `);
    console.log("✅ Created roles table");

    // Staff training logs (also created by 0009; repeated so 0010 alone is enough)
    await client.query(`
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
      CREATE INDEX IF NOT EXISTS staff_training_tenant_idx ON countrylab_lms.staff_training_logs(tenant_id);
      CREATE INDEX IF NOT EXISTS staff_training_user_idx ON countrylab_lms.staff_training_logs(user_id);
    `);
    console.log("✅ Ensured staff_training_logs table");

    await client.query("COMMIT");
    console.log("🎉 Migration 0010 completed successfully!");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed (rolled back):", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
