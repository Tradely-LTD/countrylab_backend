"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DATABASE_SCHEMA = exports.pool = exports.db = void 0;
exports.checkDbConnection = checkDbConnection;
exports.initializeSchema = initializeSchema;
const node_postgres_1 = require("drizzle-orm/node-postgres");
const pg_1 = require("pg");
const schema = __importStar(require("./schema"));
const logger_1 = require("../utils/logger");
const DATABASE_SCHEMA = process.env.DATABASE_SCHEMA || "countrylab_lms";
exports.DATABASE_SCHEMA = DATABASE_SCHEMA;
const pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 30,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});
exports.pool = pool;
pool.on("error", (err) => {
    logger_1.logger.error("PostgreSQL pool error:", err);
});
// Set search_path for all connections to use the specified schema
pool.on("connect", async (client) => {
    try {
        await client.query(`SET search_path TO ${DATABASE_SCHEMA}, public`);
    }
    catch (error) {
        logger_1.logger.error(`Failed to set search_path to ${DATABASE_SCHEMA}:`, error);
    }
});
exports.db = (0, node_postgres_1.drizzle)(pool, { schema });
async function checkDbConnection() {
    try {
        const client = await pool.connect();
        await client.query("SELECT 1");
        client.release();
        logger_1.logger.info(`✅ Database connected successfully (schema: ${DATABASE_SCHEMA})`);
    }
    catch (error) {
        logger_1.logger.error("❌ Database connection failed:", error);
        throw error;
    }
}
async function initializeSchema() {
    try {
        const client = await pool.connect();
        try {
            // Create schema if it doesn't exist
            await client.query(`CREATE SCHEMA IF NOT EXISTS ${DATABASE_SCHEMA}`);
            logger_1.logger.info(`✅ Schema '${DATABASE_SCHEMA}' initialized`);
            // Set search_path for this connection
            await client.query(`SET search_path TO ${DATABASE_SCHEMA}, public`);
        }
        finally {
            client.release();
        }
    }
    catch (error) {
        logger_1.logger.error(`❌ Failed to initialize schema '${DATABASE_SCHEMA}':`, error);
        throw error;
    }
}
//# sourceMappingURL=index.js.map