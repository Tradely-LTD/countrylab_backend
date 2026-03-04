import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { audit_logs } from '../db/schema';
import { logger } from '../utils/logger';

export async function createAuditLog(params: {
  tenant_id: string;
  user_id?: string;
  action: string;
  table_name?: string;
  record_id?: string;
  old_value?: unknown;
  new_value?: unknown;
  ip_address?: string;
  user_agent?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await db.insert(audit_logs).values({
      tenant_id: params.tenant_id,
      user_id: params.user_id,
      action: params.action,
      table_name: params.table_name,
      record_id: params.record_id as `${string}-${string}-${string}-${string}-${string}` | undefined,
      old_value: params.old_value as Record<string, unknown> | undefined,
      new_value: params.new_value as Record<string, unknown> | undefined,
      ip_address: params.ip_address,
      user_agent: params.user_agent,
      metadata: params.metadata || {},
    });
  } catch (error) {
    // Never let audit log failure break the main operation
    logger.error('Failed to write audit log:', error);
  }
}

export function auditMiddleware(action: string, tableName?: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);

    res.json = (body: unknown) => {
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
