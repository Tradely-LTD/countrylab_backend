"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.APPROVAL_ROLES = exports.INVENTORY_ROLES = exports.FINANCE_ROLES = exports.LAB_ROLES = exports.STAFF_ROLES = exports.ADMIN_ROLES = void 0;
exports.authenticate = authenticate;
exports.requireRole = requireRole;
const supabase_js_1 = require("@supabase/supabase-js");
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const logger_1 = require("../utils/logger");
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function authenticate(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) {
            return res.status(401).json({ error: "No token provided" });
        }
        const token = authHeader.split(" ")[1];
        // Verify with Supabase
        let supabaseUser = null;
        try {
            const { data, error } = await supabase.auth.getUser(token);
            if (error || !data.user) {
                return res.status(401).json({ error: "Invalid or expired token" });
            }
            supabaseUser = data.user;
        }
        catch (fetchErr) {
            const isNetworkError = fetchErr?.cause?.code === "ENOTFOUND" ||
                fetchErr?.cause?.code === "ECONNREFUSED" ||
                fetchErr?.name === "AbortError" ||
                fetchErr?.message?.includes("fetch failed");
            if (isNetworkError) {
                return res
                    .status(503)
                    .json({ error: "Service unavailable", code: "NETWORK_UNREACHABLE" });
            }
            throw fetchErr;
        }
        // Get user from our DB
        const [dbUser] = await db_1.db
            .select()
            .from(schema_1.users)
            .where((0, drizzle_orm_1.eq)(schema_1.users.supabase_user_id, supabaseUser.id))
            .limit(1);
        if (!dbUser || !dbUser.is_active) {
            return res.status(401).json({ error: "User not found or inactive" });
        }
        req.user = {
            id: dbUser.id,
            tenant_id: dbUser.tenant_id,
            email: dbUser.email,
            full_name: dbUser.full_name,
            role: dbUser.role,
            supabase_user_id: supabaseUser.id,
        };
        req.tenantId = dbUser.tenant_id;
        next();
    }
    catch (error) {
        logger_1.logger.error("Auth middleware error:", error);
        return res.status(500).json({ error: "Authentication error" });
    }
}
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: "Not authenticated" });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                error: "Insufficient permissions",
                required: roles,
                current: req.user.role,
            });
        }
        next();
    };
}
// Roles with elevated access
exports.ADMIN_ROLES = ["super_admin", "md"];
exports.STAFF_ROLES = [
    "super_admin",
    "md",
    "quality_manager",
    "lab_analyst",
    "procurement_officer",
    "inventory_manager",
    "finance",
    "business_development",
];
exports.LAB_ROLES = [
    "super_admin",
    "md",
    "quality_manager",
    "lab_analyst",
];
exports.FINANCE_ROLES = ["super_admin", "md", "finance"];
exports.INVENTORY_ROLES = [
    "super_admin",
    "md",
    "inventory_manager",
    "lab_analyst",
];
exports.APPROVAL_ROLES = ["super_admin", "md"];
//# sourceMappingURL=auth.js.map