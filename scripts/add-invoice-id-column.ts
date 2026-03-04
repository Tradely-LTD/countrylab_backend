import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function addColumn() {
  console.log("🚀 Adding invoice_id column to sample_requests...");

  try {
    await pool.query(`
      ALTER TABLE countrylab_lms.sample_requests 
      ADD COLUMN IF NOT EXISTS invoice_id UUID;
    `);

    console.log("✅ Column added successfully!");
  } catch (error) {
    console.error("❌ Failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

addColumn();
