import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../utils/logger";
import { getPermissions } from "../services/permissionService";

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
      permissions?: Set<string>;
    }
  }
}

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    // Verify with Supabase
    let supabaseUser: any = null;
    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data.user) {
        return res.status(401).json({ error: "Invalid or expired token" });
      }
      supabaseUser = data.user;
    } catch (fetchErr: any) {
      const isNetworkError =
        fetchErr?.cause?.code === "ENOTFOUND" ||
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
    const [dbUser] = await db
      .select()
      .from(users)
      .where(eq(users.supabase_user_id, supabaseUser.id))
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
  } catch (error) {
    logger.error("Auth middleware error:", error);
    return res.status(500).json({ error: "Authentication error" });
  }
}

/** Permissions held by the current user ("module.action"), memoised per request. */
export async function userPermissions(req: Request): Promise<Set<string>> {
  if (!req.permissions) {
    req.permissions = await getPermissions(req.tenantId!, req.user!.role);
  }
  return req.permissions;
}

/** True when the current user holds the given permission. */
export async function can(req: Request, permission: string) {
  return (await userPermissions(req)).has(permission);
}

/**
 * Allow the request when the user holds ANY of the listed permissions,
 * e.g. requirePermission("samples.view").
 */
export function requirePermission(...permissions: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    try {
      const held = await userPermissions(req);
      if (!permissions.some((p) => held.has(p))) {
        return res.status(403).json({
          error: "You don't have permission to do this",
          required: permissions,
        });
      }
      next();
    } catch (error) {
      logger.error("Permission check error:", error);
      return res.status(500).json({ error: "Permission check failed" });
    }
  };
}
