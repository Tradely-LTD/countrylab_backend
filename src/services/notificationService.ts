import { db } from '../db';
import { users, notifications } from '../db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { logger } from '../utils/logger';
import { getTenantRoles } from './permissionService';

interface NotifyParams {
  tenant_id: string;
  type: string;
  title: string;
  message?: string;
  link?: string;
  roles?: string[];
  /** Notify every active user whose role holds this permission */
  permission?: string;
  user_ids?: string[];
}

export async function sendNotification(params: NotifyParams): Promise<void> {
  try {
    let recipientIds: string[] = params.user_ids || [];

    const roles = [...(params.roles ?? [])];
    if (params.permission) {
      const tenantRoles = await getTenantRoles(params.tenant_id);
      for (const r of tenantRoles.values()) {
        if (r.permissions.includes(params.permission)) roles.push(r.key);
      }
    }

    if (roles.length > 0) {
      const roleUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.tenant_id, params.tenant_id),
            eq(users.is_active, true),
            inArray(users.role, roles)
          )
        );
      recipientIds = [...new Set([...recipientIds, ...roleUsers.map((u) => u.id)])];
    }

    if (recipientIds.length === 0) return;

    await db.insert(notifications).values(
      recipientIds.map((userId) => ({
        tenant_id: params.tenant_id,
        user_id: userId,
        type: params.type,
        title: params.title,
        message: params.message,
        link: params.link,
      }))
    );
  } catch (error) {
    logger.error('Notification error:', error);
  }
}
