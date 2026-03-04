import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log("📦 Starting migration 0002...");

    // Set schema
    await client.query(`SET search_path TO countrylab_lms;`);

    // Create suppliers table
    console.log("Creating suppliers table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name varchar(255) NOT NULL,
        company varchar(255),
        email varchar(255),
        phone varchar(50),
        address text,
        contact_person varchar(255),
        website varchar(255),
        tax_id varchar(100),
        payment_terms varchar(100),
        currency varchar(10) DEFAULT 'NGN',
        total_spent real DEFAULT 0,
        total_orders integer DEFAULT 0,
        notes text,
        is_active boolean DEFAULT true,
        created_by uuid REFERENCES users(id),
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      );
    `);

    // Add columns to reagents table
    console.log("Adding columns to reagents table...");
    await client.query(
      `ALTER TABLE reagents ADD COLUMN IF NOT EXISTS catalog_number varchar(100);`,
    );
    await client.query(
      `ALTER TABLE reagents ADD COLUMN IF NOT EXISTS lot_number varchar(100);`,
    );
    await client.query(
      `ALTER TABLE reagents ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES suppliers(id);`,
    );
    await client.query(
      `ALTER TABLE reagents ADD COLUMN IF NOT EXISTS category varchar(100);`,
    );
    await client.query(
      `ALTER TABLE reagents ADD COLUMN IF NOT EXISTS unit_price real DEFAULT 0;`,
    );

    // Add column to purchase_orders table
    console.log("Adding supplier_id to purchase_orders table...");
    await client.query(
      `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES suppliers(id);`,
    );

    console.log("✅ Migration 0002 completed successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
