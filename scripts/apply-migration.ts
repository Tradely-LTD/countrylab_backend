import { db } from "../src/db";
import { sql } from "drizzle-orm";
import { readFileSync } from "fs";
import { join } from "path";

async function applyMigration() {
  try {
    console.log("📦 Applying migration 0002_military_khan...");

    const migrationSQL = readFileSync(
      join(__dirname, "../src/db/migrations/0002_military_khan.sql"),
      "utf-8",
    );

    // Split by statement breakpoint and execute each statement
    const statements = migrationSQL
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      console.log(`Executing: ${statement.substring(0, 50)}...`);
      await db.execute(sql.raw(statement));
    }

    console.log("✅ Migration applied successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

applyMigration();
