"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchemaManager = void 0;
const logger_1 = require("../utils/logger");
const DATABASE_SCHEMA = process.env.DATABASE_SCHEMA || "countrylab_lms";
/**
 * Schema Manager for Multi-Tenancy
 * Handles schema creation, switching, and management
 */
class SchemaManager {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    /**
     * Create a new schema if it doesn't exist
     */
    async createSchema(schemaName = DATABASE_SCHEMA) {
        const client = await this.pool.connect();
        try {
            await client.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
            logger_1.logger.info(`✅ Schema '${schemaName}' created/verified`);
        }
        catch (error) {
            logger_1.logger.error(`❌ Failed to create schema '${schemaName}':`, error);
            throw error;
        }
        finally {
            client.release();
        }
    }
    /**
     * Drop a schema (use with caution!)
     */
    async dropSchema(schemaName, cascade = false) {
        const client = await this.pool.connect();
        try {
            const cascadeStr = cascade ? "CASCADE" : "RESTRICT";
            await client.query(`DROP SCHEMA IF EXISTS ${schemaName} ${cascadeStr}`);
            logger_1.logger.info(`✅ Schema '${schemaName}' dropped`);
        }
        catch (error) {
            logger_1.logger.error(`❌ Failed to drop schema '${schemaName}':`, error);
            throw error;
        }
        finally {
            client.release();
        }
    }
    /**
     * List all schemas in the database
     */
    async listSchemas() {
        const client = await this.pool.connect();
        try {
            const result = await client.query(`
        SELECT schema_name 
        FROM information_schema.schemata 
        WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
        ORDER BY schema_name
      `);
            return result.rows.map((row) => row.schema_name);
        }
        catch (error) {
            logger_1.logger.error("❌ Failed to list schemas:", error);
            throw error;
        }
        finally {
            client.release();
        }
    }
    /**
     * Check if a schema exists
     */
    async schemaExists(schemaName) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(`SELECT EXISTS(SELECT 1 FROM information_schema.schemata WHERE schema_name = $1)`, [schemaName]);
            return result.rows[0].exists;
        }
        catch (error) {
            logger_1.logger.error(`❌ Failed to check if schema '${schemaName}' exists:`, error);
            throw error;
        }
        finally {
            client.release();
        }
    }
    /**
     * Set search_path for a connection
     */
    async setSearchPath(schemaName, client) {
        const conn = client || (await this.pool.connect());
        try {
            await conn.query(`SET search_path TO ${schemaName}, public`);
            logger_1.logger.info(`✅ Search path set to '${schemaName}'`);
        }
        catch (error) {
            logger_1.logger.error(`❌ Failed to set search_path to '${schemaName}':`, error);
            throw error;
        }
        finally {
            if (!client)
                conn.release();
        }
    }
    /**
     * Get current schema
     */
    async getCurrentSchema() {
        const client = await this.pool.connect();
        try {
            const result = await client.query("SELECT current_schema()");
            return result.rows[0].current_schema;
        }
        catch (error) {
            logger_1.logger.error("❌ Failed to get current schema:", error);
            throw error;
        }
        finally {
            client.release();
        }
    }
    /**
     * Clone schema structure (without data)
     */
    async cloneSchemaStructure(sourceSchema, targetSchema) {
        const client = await this.pool.connect();
        try {
            // Create target schema
            await this.createSchema(targetSchema);
            // Get all tables from source schema
            const tablesResult = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = $1 AND table_type = 'BASE TABLE'
      `, [sourceSchema]);
            // Clone each table structure
            for (const row of tablesResult.rows) {
                const tableName = row.table_name;
                await client.query(`
          CREATE TABLE ${targetSchema}.${tableName} 
          (LIKE ${sourceSchema}.${tableName} INCLUDING ALL)
        `);
            }
            logger_1.logger.info(`✅ Schema structure cloned from '${sourceSchema}' to '${targetSchema}'`);
        }
        catch (error) {
            logger_1.logger.error(`❌ Failed to clone schema structure:`, error);
            throw error;
        }
        finally {
            client.release();
        }
    }
}
exports.SchemaManager = SchemaManager;
//# sourceMappingURL=schema-manager.js.map