import { Request, Response, NextFunction } from 'express';
export interface AuthUser {
    id: string;
    tenant_id: string;
    email: string;
    full_name: string;
    role: string;
    supabase_user_id: string;
}
declare global {
    namespace Express {
        interface Request {
            user?: AuthUser;
            tenantId?: string;
        }
    }
}
export declare function authenticate(req: Request, res: Response, next: NextFunction): Promise<Response<any, Record<string, any>> | undefined>;
export declare function requireRole(...roles: string[]): (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
export declare const ADMIN_ROLES: string[];
export declare const STAFF_ROLES: string[];
export declare const LAB_ROLES: string[];
export declare const FINANCE_ROLES: string[];
export declare const INVENTORY_ROLES: string[];
export declare const APPROVAL_ROLES: string[];
//# sourceMappingURL=auth.d.ts.map