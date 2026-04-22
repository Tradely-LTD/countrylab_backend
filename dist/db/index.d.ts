import { Pool } from "pg";
import * as schema from "./schema";
declare const DATABASE_SCHEMA: string;
declare const pool: Pool;
export declare const db: import("drizzle-orm/node-postgres").NodePgDatabase<typeof schema> & {
    $client: Pool;
};
export type DB = typeof db;
export declare function checkDbConnection(): Promise<void>;
export declare function initializeSchema(): Promise<void>;
export { pool, DATABASE_SCHEMA };
//# sourceMappingURL=index.d.ts.map