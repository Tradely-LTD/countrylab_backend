import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import dotenv from "dotenv";

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL!;
const DATABASE_SCHEMA = process.env.DATABASE_SCHEMA || "countrylab_lms";

async function listUsers() {
  console.log("👥 Retrieving user list from database...\n");

  const pool = new Pool({
    connectionString: DATABASE_URL,
    max: 1,
  });

  const db = drizzle(pool, { schema });

  try {
    await pool.query(`SET search_path TO ${DATABASE_SCHEMA}, public`);

    const users = await db.select().from(schema.users);

    console.log("=" .repeat(100));
    console.log("USER LIST");
    console.log("=".repeat(100));
    console.log(`Total Users: ${users.length}\n`);

    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.full_name}`);
      console.log(`   📧 Email: ${user.email}`);
      console.log(`   👤 Role: ${user.role}`);
      console.log(`   🏢 Department: ${user.department || 'N/A'}`);
      console.log(`   📱 Phone: ${user.phone || 'N/A'}`);
      console.log(`   ✅ Active: ${user.is_active}`);
      console.log(`   🆔 User ID: ${user.id}`);
      console.log(`   🔑 Supabase ID: ${user.supabase_user_id || 'N/A'}`);
      console.log(`   🔗 Referral Code: ${user.referral_code || 'N/A'}`);
      console.log(`   📅 Created: ${user.created_at?.toISOString().split('T')[0]}`);
      console.log(`   🕐 Last Login: ${user.last_login_at?.toISOString() || 'Never'}`);
      console.log("");
    });

    console.log("=".repeat(100));
    console.log("\n⚠️  PASSWORD INFORMATION:");
    console.log("Passwords are hashed in the database and cannot be retrieved.");
    console.log("If you need to know the default passwords, check the seed script:");
    console.log("   📄 backend/scripts/seed-admin.ts");
    console.log("\nCommon default patterns:");
    console.log("   • Password123! (or similar variations)");
    console.log("   • countrylab123");
    console.log("   • Check the seed-admin.ts file for exact defaults");
    console.log("\nTo reset a password, you would need to:");
    console.log("   1. Use the forgot password feature in the app");
    console.log("   2. Manually update the password hash in the database");
    console.log("   3. Create a password reset script");
    console.log("=".repeat(100));

  } catch (error: any) {
    console.error("❌ Error retrieving users:", error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

listUsers()
  .then(() => {
    console.log("\n✅ User list retrieved successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Failed to retrieve users:", error);
    process.exit(1);
  });
