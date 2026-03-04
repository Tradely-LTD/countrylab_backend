import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import * as schema from "./schema";
import { logger } from "../utils/logger";

const DATABASE_SCHEMA = process.env.DATABASE_SCHEMA || "countrylab_lms";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 30,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on("error", (err) => {
  logger.error("PostgreSQL pool error:", err);
});

// Set search_path for all connections to use the specified schema
pool.on("connect", async (client) => {
  try {
    await client.query(`SET search_path TO ${DATABASE_SCHEMA}, public`);
  } catch (error) {
    logger.error(`Failed to set search_path to ${DATABASE_SCHEMA}:`, error);
  }
});

export const db = drizzle(pool, { schema });

export type DB = typeof db;

export async function checkDbConnection(): Promise<void> {
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    logger.info(
      `✅ Database connected successfully (schema: ${DATABASE_SCHEMA})`,
    );
  } catch (error) {
    logger.error("❌ Database connection failed:", error);
    throw error;
  }
}

export async function initializeSchema(): Promise<void> {
  try {
    const client = await pool.connect();

    try {
      // Create schema if it doesn't exist
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${DATABASE_SCHEMA}`);
      logger.info(`✅ Schema '${DATABASE_SCHEMA}' initialized`);

      // Set search_path for this connection
      await client.query(`SET search_path TO ${DATABASE_SCHEMA}, public`);
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error(`❌ Failed to initialize schema '${DATABASE_SCHEMA}':`, error);
    throw error;
  }
}

export { pool, DATABASE_SCHEMA };
