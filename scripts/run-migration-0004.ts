import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function runMigration() {
  console.log("🔄 Running migration 0004: Link requisitions to inventory...");

  try {
    // Add reagent_id and asset_id columns to track which inventory item is being requested
    // This allows us to link requisition items to actual inventory records
    await db.execute(sql`
      ALTER TABLE countrylab_lms.requisitions 
      ADD COLUMN IF NOT EXISTS items_metadata jsonb DEFAULT '[]';
    `);
    console.log("✅ Added items_metadata column to requisitions table");

    // Note: We're using items_metadata to store enhanced item data including:
    // - reagent_id: link to stock item
    // - asset_id: link to asset
    // - supplier_id: preferred supplier
    // - estimated_price: last known price
    // - catalog_number: for easy reordering
    // This keeps the existing 'items' column for backward compatibility

    console.log("✅ Migration 0004 completed successfully!");
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
