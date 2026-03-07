import { Pool } from "pg";
/**
 * Schema Manager for Multi-Tenancy
 * Handles schema creation, switching, and management
 */
export declare class SchemaManager {
    private pool;
    constructor(pool: Pool);
    /**
     * Create a new schema if it doesn't exist
     */
    createSchema(schemaName?: string): Promise<void>;
    /**
     * Drop a schema (use with caution!)
     */
    dropSchema(schemaName: string, cascade?: boolean): Promise<void>;
    /**
     * List all schemas in the database
     */
    listSchemas(): Promise<string[]>;
    /**
     * Check if a schema exists
     */
    schemaExists(schemaName: string): Promise<boolean>;
    /**
     * Set search_path for a connection
     */
    setSearchPath(schemaName: string, client?: any): Promise<void>;
    /**
     * Get current schema
     */
    getCurrentSchema(): Promise<string>;
    /**
     * Clone schema structure (without data)
     */
    cloneSchemaStructure(sourceSchema: string, targetSchema: string): Promise<void>;
}
//# sourceMappingURL=schema-manager.d.ts.map