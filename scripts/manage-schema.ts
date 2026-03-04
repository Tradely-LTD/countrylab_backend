#!/usr/bin/env tsx
import "dotenv/config";
import { Pool } from "pg";
import { SchemaManager } from "../src/db/schema-manager";
import { logger } from "../src/utils/logger";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const schemaManager = new SchemaManager(pool);

async function main() {
  const command = process.argv[2];
  const schemaName =
    process.argv[3] || process.env.DATABASE_SCHEMA || "countrylab_lms";

  try {
    switch (command) {
      case "create":
        await schemaManager.createSchema(schemaName);
        logger.info(`Schema '${schemaName}' is ready`);
        break;

      case "drop":
        const cascade = process.argv[4] === "--cascade";
        await schemaManager.dropSchema(schemaName, cascade);
        logger.info(`Schema '${schemaName}' dropped`);
        break;

      case "list":
        const schemas = await schemaManager.listSchemas();
        logger.info("Available schemas:");
        schemas.forEach((s) => logger.info(`  - ${s}`));
        break;

      case "exists":
        const exists = await schemaManager.schemaExists(schemaName);
        logger.info(
          `Schema '${schemaName}' ${exists ? "exists" : "does not exist"}`,
        );
        break;

      case "current":
        const current = await schemaManager.getCurrentSchema();
        logger.info(`Current schema: ${current}`);
        break;

      case "clone":
        const targetSchema = process.argv[4];
        if (!targetSchema) {
          logger.error("Target schema name required");
          process.exit(1);
        }
        await schemaManager.cloneSchemaStructure(schemaName, targetSchema);
        logger.info(
          `Schema structure cloned from '${schemaName}' to '${targetSchema}'`,
        );
        break;

      default:
        logger.info(`
Schema Management CLI

Usage:
  npm run schema:manage <command> [schema_name] [options]

Commands:
  create [schema_name]              Create a new schema (default: countrylab_lms)
  drop <schema_name> [--cascade]    Drop a schema
  list                              List all schemas
  exists <schema_name>              Check if schema exists
  current                           Show current schema
  clone <source> <target>           Clone schema structure

Examples:
  npm run schema:manage create countrylab_lms
  npm run schema:manage list
  npm run schema:manage drop old_schema --cascade
  npm run schema:manage clone countrylab_lms new_project
        `);
    }
  } catch (error) {
    logger.error("Command failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
