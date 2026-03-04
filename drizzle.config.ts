import type { Config } from "drizzle-kit";
import * as dotenv from "dotenv";

dotenv.config();

const DATABASE_SCHEMA = process.env.DATABASE_SCHEMA || "countrylab_lms";

export default {
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  schemaFilter: [DATABASE_SCHEMA],
  verbose: true,
  strict: true,
} satisfies Config;
