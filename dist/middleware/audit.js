"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAuditLog = createAuditLog;
exports.auditMiddleware = auditMiddleware;
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const logger_1 = require("../utils/logger");
async function createAuditLog(params) {
    try {
        await db_1.db.insert(schema_1.audit_logs).values({
            tenant_id: params.tenant_id,
            user_id: params.user_id,
            action: params.action,
            table_name: params.table_name,
            record_id: params.record_id,
            old_value: params.old_value,
            new_value: params.new_value,
            ip_address: params.ip_address,
            user_agent: params.user_agent,
            metadata: params.metadata || {},
        });
    }
    catch (error) {
        // Never let audit log failure break the main operation
        logger_1.logger.error('Failed to write audit log:', error);
    }
}
function auditMiddleware(action, tableName) {
    return async (req, res, next) => {
        const originalJson = res.json.bind(res);
        res.json = (body) => {
            if (req.user && res.statusCode < 400) {
                createAuditLog({
                    tenant_id: req.user.tenant_id,
                    user_id: req.user.id,
                    action,
                    table_name: tableName,
                    ip_address: req.ip || req.connection.remoteAddress,
                    user_agent: req.get('user-agent'),
                    metadata: { method: req.method, path: req.path, params: req.params },
                });
            }
            return originalJson(body);
        };
        next();
    };
}
//# sourceMappingURL=audit.js.map