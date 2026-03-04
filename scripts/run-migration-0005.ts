import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function runMigration() {
  console.log(
    "🚀 Running migration 0005: Enhanced Sample and Client Fields...",
  );

  try {
    // Add new fields to samples table
    await pool.query(`
      ALTER TABLE countrylab_lms.samples
      ADD COLUMN IF NOT EXISTS sample_container VARCHAR(100),
      ADD COLUMN IF NOT EXISTS sample_volume VARCHAR(50),
      ADD COLUMN IF NOT EXISTS reference_standard VARCHAR(100),
      ADD COLUMN IF NOT EXISTS batch_number VARCHAR(100),
      ADD COLUMN IF NOT EXISTS sample_condition VARCHAR(50) DEFAULT 'Good',
      ADD COLUMN IF NOT EXISTS temperature_on_receipt VARCHAR(50),
      ADD COLUMN IF NOT EXISTS sampling_point TEXT,
      ADD COLUMN IF NOT EXISTS production_date TIMESTAMP,
      ADD COLUMN IF NOT EXISTS expiry_date TIMESTAMP,
      ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(255);
    `);

    console.log("✅ Added new fields to samples table");

    // Add new fields to clients table for better CoA information
    await pool.query(`
      ALTER TABLE countrylab_lms.clients
      ADD COLUMN IF NOT EXISTS city VARCHAR(100),
      ADD COLUMN IF NOT EXISTS state VARCHAR(100),
      ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20),
      ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'Nigeria',
      ADD COLUMN IF NOT EXISTS tax_id VARCHAR(100),
      ADD COLUMN IF NOT EXISTS website VARCHAR(255);
    `);

    console.log("✅ Added new fields to clients table");

    console.log("🎉 Migration 0005 completed successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

runMigration();
