import { db } from '../db';
import { users, notifications } from '../db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { logger } from '../utils/logger';

interface NotifyParams {
  tenant_id: string;
  type: string;
  title: string;
  message?: string;
  link?: string;
  roles?: string[];
  user_ids?: string[];
}

export async function sendNotification(params: NotifyParams): Promise<void> {
  try {
    let recipientIds: string[] = params.user_ids || [];

    if (params.roles && params.roles.length > 0) {
      const roleUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.tenant_id, params.tenant_id),
            eq(users.is_active, true),
            inArray(users.role, params.roles as any[])
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
