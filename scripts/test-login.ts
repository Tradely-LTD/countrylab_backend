import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!,
);

async function testLogin(email: string, password: string) {
  console.log(`\n🔐 Testing: ${email}`);
  console.log(`   Password: ${password}`);

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.log(`   ❌ Failed: ${error.message}`);
    return false;
  } else {
    console.log(`   ✅ SUCCESS!`);
    console.log(`   User ID: ${data.user?.id}`);
    console.log(`   Email: ${data.user?.email}`);
    return true;
  }
}

async function main() {
  console.log("🔍 Testing passwords for all users\n");
  console.log("=".repeat(70));

  const users = [
    "admin@countrylab.com",
    "abubakarringim@gmail.com",
    "usman@gmail.com",
    "md@countrylab.com",
    "quality@countrylab.com",
    "analyst@countrylab.com",
    "procurement@countrylab.com",
    "inventory@countrylab.com",
    "finance@countrylab.com",
    "business@countrylab.com",
    "customer@countrylab.com",
  ];

  // Common demo password patterns
  const passwordsToTry = [
    "Admin@123456",
    "Demo@123456",
    "demo@123456",
    "Password123!",
    "Countrylab123",
  ];

  const results: Array<{ email: string; password: string | null }> = [];

  for (const email of users) {
    console.log(`\n📧 Testing: ${email}`);
    let foundPassword = null;

    for (const password of passwordsToTry) {
      const success = await testLogin(email, password);
      if (success) {
        foundPassword = password;
        break;
      }
      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    results.push({ email, password: foundPassword });

    if (!foundPassword) {
      console.log(`   ⚠️  No common password worked for this user`);
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("\n📋 SUMMARY OF WORKING CREDENTIALS:\n");

  const foundCredentials = results.filter((r) => r.password !== null);

  if (foundCredentials.length > 0) {
    foundCredentials.forEach(({ email, password }) => {
      console.log(`   ✅ ${email}`);
      console.log(`      Password: ${password}\n`);
    });
  }

  const notFound = results.filter((r) => r.password === null);
  if (notFound.length > 0) {
    console.log("\n❌ Passwords not found for:");
    notFound.forEach(({ email }) => {
      console.log(`   - ${email}`);
    });
  }

  console.log("\n" + "=".repeat(70));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });
