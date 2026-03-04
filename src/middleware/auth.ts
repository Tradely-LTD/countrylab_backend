import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger';

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

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    // Verify with Supabase
    const { data: { user: supabaseUser }, error } = await supabase.auth.getUser(token);

    if (error || !supabaseUser) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Get user from our DB
    const [dbUser] = await db
      .select()
      .from(users)
      .where(eq(users.supabase_user_id, supabaseUser.id))
      .limit(1);

    if (!dbUser || !dbUser.is_active) {
      return res.status(401).json({ error: 'User not found or inactive' });
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
  } catch (error) {
    logger.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication error' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: roles,
        current: req.user.role,
      });
    }
    next();
  };
}

// Roles with elevated access
export const ADMIN_ROLES = ['super_admin', 'md'];
export const STAFF_ROLES = ['super_admin', 'md', 'quality_manager', 'lab_analyst', 'procurement_officer', 'inventory_manager', 'finance', 'business_development'];
export const LAB_ROLES = ['super_admin', 'md', 'quality_manager', 'lab_analyst'];
export const FINANCE_ROLES = ['super_admin', 'md', 'finance'];
export const INVENTORY_ROLES = ['super_admin', 'md', 'inventory_manager', 'lab_analyst'];
export const APPROVAL_ROLES = ['super_admin', 'md'];
