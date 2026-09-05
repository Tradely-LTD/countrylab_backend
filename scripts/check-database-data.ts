import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import dotenv from "dotenv";

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL!;
const DATABASE_SCHEMA = process.env.DATABASE_SCHEMA || "countrylab_lms";

async function checkDatabaseData() {
  console.log("🔍 Checking live database for data...\n");
  console.log(`Database: ${DATABASE_URL.split("@")[1]}`);
  console.log(`Schema: ${DATABASE_SCHEMA}\n`);

  const pool = new Pool({
    connectionString: DATABASE_URL,
    max: 1,
  });

  const db = drizzle(pool, { schema });

  try {
    // Set the search path to the correct schema
    await pool.query(`SET search_path TO ${DATABASE_SCHEMA}, public`);

    // Check each table
    const tables = [
      { name: "tenants", table: schema.tenants },
      { name: "users", table: schema.users },
      { name: "clients", table: schema.clients },
      { name: "suppliers", table: schema.suppliers },
      { name: "test_methods", table: schema.test_methods },
      { name: "samples", table: schema.samples },
      { name: "sample_requests", table: schema.sample_requests },
      { name: "result_templates", table: schema.result_templates },
      {
        name: "result_template_parameters",
        table: schema.result_template_parameters,
      },
      { name: "results", table: schema.results },
      { name: "reagents", table: schema.reagents },
      { name: "assets", table: schema.assets },
      { name: "requisitions", table: schema.requisitions },
      { name: "purchase_orders", table: schema.purchase_orders },
      { name: "invoices", table: schema.invoices },
      { name: "tickets", table: schema.tickets },
      { name: "sops", table: schema.sops },
      { name: "leads", table: schema.leads },
      { name: "client_interactions", table: schema.client_interactions },
      { name: "audit_logs", table: schema.audit_logs },
      { name: "notifications", table: schema.notifications },
    ];

    console.log("=".repeat(80));
    console.log("TABLE DATA SUMMARY");
    console.log("=".repeat(80));

    let totalRecords = 0;
    const tablesWithData: Array<{ name: string; count: number }> = [];

    for (const { name, table } of tables) {
      try {
        const count = await db
          .select()
          .from(table as any)
          .execute();
        const recordCount = count.length;

        totalRecords += recordCount;

        if (recordCount > 0) {
          tablesWithData.push({ name, count: recordCount });
        }

        const status = recordCount > 0 ? "✅" : "⚪";
        console.log(
          `${status} ${name.padEnd(35)} ${recordCount.toString().padStart(6)} records`,
        );
      } catch (error: any) {
        console.log(`❌ ${name.padEnd(35)} Error: ${error.message}`);
      }
    }

    console.log("=".repeat(80));
    console.log(`\n📊 SUMMARY:`);
    console.log(`   Total tables checked: ${tables.length}`);
    console.log(`   Tables with data: ${tablesWithData.length}`);
    console.log(`   Total records: ${totalRecords}`);

    if (tablesWithData.length > 0) {
      console.log(`\n✅ DATABASE HAS DATA\n`);
      console.log("Tables with data:");
      tablesWithData.forEach(({ name, count }) => {
        console.log(`   - ${name}: ${count} record${count > 1 ? "s" : ""}`);
      });

      // Show sample data from key tables
      console.log("\n" + "=".repeat(80));
      console.log("SAMPLE DATA FROM KEY TABLES");
      console.log("=".repeat(80));

      // Tenants
      if (tablesWithData.find((t) => t.name === "tenants")) {
        const tenants = await db.select().from(schema.tenants).limit(5);
        console.log("\n🏢 TENANTS:");
        tenants.forEach((tenant: any) => {
          console.log(
            `   - ${tenant.name} (${tenant.slug}) - Active: ${tenant.is_active}`,
          );
        });
      }

      // Users
      if (tablesWithData.find((t) => t.name === "users")) {
        const users = await db.select().from(schema.users).limit(5);
        console.log("\n👤 USERS (First 5):");
        users.forEach((user: any) => {
          console.log(
            `   - ${user.full_name} (${user.email}) - Role: ${user.role}`,
          );
        });
      }

      // Clients
      if (tablesWithData.find((t) => t.name === "clients")) {
        const clients = await db.select().from(schema.clients).limit(5);
        console.log("\n🏪 CLIENTS (First 5):");
        clients.forEach((client: any) => {
          console.log(
            `   - ${client.name} ${client.company ? `(${client.company})` : ""} - Status: ${client.client_status}`,
          );
        });
      }

      // Samples
      if (tablesWithData.find((t) => t.name === "samples")) {
        const samples = await db.select().from(schema.samples).limit(5);
        console.log("\n🧪 SAMPLES (First 5):");
        samples.forEach((sample: any) => {
          console.log(
            `   - ${sample.ulid}: ${sample.name} - Status: ${sample.status}`,
          );
        });
      }

      // Sample Requests
      if (tablesWithData.find((t) => t.name === "sample_requests")) {
        const requests = await db
          .select()
          .from(schema.sample_requests)
          .limit(5);
        console.log("\n📋 SAMPLE REQUESTS (First 5):");
        requests.forEach((request: any) => {
          console.log(
            `   - ${request.request_number}: ${request.product_name} - Status: ${request.status}`,
          );
        });
      }

      // Results
      if (tablesWithData.find((t) => t.name === "results")) {
        const results = await db.select().from(schema.results).limit(5);
        console.log("\n📊 RESULTS (First 5):");
        results.forEach((result: any) => {
          console.log(
            `   - Sample ID: ${result.sample_id} - Status: ${result.overall_status}`,
          );
        });
      }

      // Invoices
      if (tablesWithData.find((t) => t.name === "invoices")) {
        const invoices = await db.select().from(schema.invoices).limit(5);
        console.log("\n💰 INVOICES (First 5):");
        invoices.forEach((invoice: any) => {
          console.log(
            `   - ${invoice.invoice_number}: ${invoice.currency} ${invoice.total} - Status: ${invoice.status}`,
          );
        });
      }
    } else {
      console.log(`\n⚠️  DATABASE IS EMPTY\n`);
      console.log("No data found in any table.");
    }

    console.log("\n" + "=".repeat(80));
  } catch (error: any) {
    console.error("❌ Error checking database:", error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

checkDatabaseData()
  .then(() => {
    console.log("\n✅ Database check complete");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Database check failed:", error);
    process.exit(1);
  });
