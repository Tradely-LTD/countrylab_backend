import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

// Sample IDs are now typed by each lab (e.g. CL/901/26/DF), so they only need
// to be unique within an organisation. Replaces the database-wide UNIQUE(ulid)
// constraint with a UNIQUE(tenant_id, ulid) index. Safe to re-run.

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const SCHEMA = process.env.DATABASE_SCHEMA || "countrylab_lms";

async function runMigration() {
  console.log(`🚀 Running migration 0011 on schema "${SCHEMA}": Sample IDs unique per organisation...`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Create the new index first so there is never a moment with no uniqueness.
    // Existing IDs are all globally unique, so this cannot fail on old data.
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS samples_tenant_ulid_idx
        ON "${SCHEMA}".samples (tenant_id, ulid);
    `);
    console.log("✅ Created unique index samples_tenant_ulid_idx (tenant_id, ulid)");

    await client.query(`
      ALTER TABLE "${SCHEMA}".samples DROP CONSTRAINT IF EXISTS samples_ulid_unique;
    `);
    console.log("✅ Dropped database-wide constraint samples_ulid_unique");

    await client.query("COMMIT");
    console.log("🎉 Migration 0011 complete");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Migration 0011 failed, rolled back:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
