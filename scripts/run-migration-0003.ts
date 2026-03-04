import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function runMigration() {
  console.log("🔄 Running migration 0003: Add product_type to reagents...");

  try {
    // Create product_type enum
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE countrylab_lms.product_type AS ENUM (
          'reagent',
          'consumable',
          'standard',
          'supply',
          'kit'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log("✅ Created product_type enum");

    // Add product_type column to reagents table
    await db.execute(sql`
      ALTER TABLE countrylab_lms.reagents 
      ADD COLUMN IF NOT EXISTS product_type countrylab_lms.product_type DEFAULT 'reagent';
    `);
    console.log("✅ Added product_type column to reagents table");

    console.log("✅ Migration 0003 completed successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
}

runMigration()
  .then(() => {
    console.log("✅ All done!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Migration error:", err);
    process.exit(1);
  });
