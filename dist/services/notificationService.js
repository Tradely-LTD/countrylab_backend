"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendNotification = sendNotification;
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const logger_1 = require("../utils/logger");
async function sendNotification(params) {
    try {
        let recipientIds = params.user_ids || [];
        if (params.roles && params.roles.length > 0) {
            const roleUsers = await db_1.db
                .select({ id: schema_1.users.id })
                .from(schema_1.users)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.users.tenant_id, params.tenant_id), (0, drizzle_orm_1.eq)(schema_1.users.is_active, true), (0, drizzle_orm_1.inArray)(schema_1.users.role, params.roles)));
            recipientIds = [...new Set([...recipientIds, ...roleUsers.map((u) => u.id)])];
        }
        if (recipientIds.length === 0)
            return;
        await db_1.db.insert(schema_1.notifications).values(recipientIds.map((userId) => ({
            tenant_id: params.tenant_id,
            user_id: userId,
            type: params.type,
            title: params.title,
            message: params.message,
            link: params.link,
        })));
    }
    catch (error) {
        logger_1.logger.error('Notification error:', error);
    }
}
//# sourceMappingURL=notificationService.js.map