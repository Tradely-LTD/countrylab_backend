import { Request, Response, NextFunction } from 'express';
export declare function createAuditLog(params: {
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
}): Promise<void>;
export declare function auditMiddleware(action: string, tableName?: string): (req: Request, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=audit.d.ts.map