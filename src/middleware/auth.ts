import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../utils/logger";

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

    if (!isWithinRoleScope(dbUser.role, req.method, req.baseUrl + req.path)) {
      return res.status(403).json({
        error: "Insufficient permissions",
        current: dbUser.role,
      });
    }

    next();
  } catch (error) {
    logger.error("Auth middleware error:", error);
    return res.status(500).json({ error: "Authentication error" });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    if (!hasRole(req.user.role, roles)) {
      return res.status(403).json({
        error: "Insufficient permissions",
        required: roles,
        current: req.user.role,
      });
    }
    next();
  };
}

// A role listed here is granted everything the roles it inherits from are.
// The General Manager holds the same executive privileges as the MD.
const ROLE_INHERITS: Record<string, string[]> = {
  general_manager: ["md"],
};

export function hasRole(role: string, roles: string[]) {
  return (
    roles.includes(role) ||
    (ROLE_INHERITS[role] ?? []).some((parent) => roles.includes(parent))
  );
}

// Narrow roles are confined to these API areas regardless of route guards,
// since many read endpoints only require authentication. Paths are relative
// to /api/v1 and match the path itself or anything beneath it.
const COMMON_SCOPE = {
  read: ["/users/me", "/notifications", "/settings/organization"],
  write: ["PATCH /notifications"],
};
const ROLE_SCOPES: Record<string, { read: string[]; write: string[] }> = {
  // HR: view staff training logs only
  hr_manager: { read: ["/training-logs"], write: [] },
  // Internal Auditor: read-only audit trail
  internal_auditor: { read: ["/audit-logs"], write: [] },
  // Marketing Officer: register clients, quote on requests, track samples
  marketing_officer: {
    read: ["/dashboard", "/clients", "/sample-requests", "/samples"],
    write: ["POST /clients", "PUT /sample-requests"],
  },
};

function matchesPrefix(path: string, prefix: string) {
  return path === prefix || path.startsWith(prefix + "/");
}

function isWithinRoleScope(role: string, method: string, fullPath: string) {
  const scope = ROLE_SCOPES[role];
  if (!scope) return true;
  const path = fullPath.replace(/^\/api\/v1/, "").replace(/\/$/, "");
  if (method === "GET" || method === "HEAD") {
    return [...COMMON_SCOPE.read, ...scope.read].some((p) =>
      matchesPrefix(path, p),
    );
  }
  return [...COMMON_SCOPE.write, ...scope.write].some((rule) => {
    const [m, p] = rule.split(" ");
    return m === method && matchesPrefix(path, p);
  });
}

// Roles with elevated access (general_manager inherits every "md" grant)
export const ADMIN_ROLES = ["super_admin", "md"];
export const STAFF_ROLES = [
  "super_admin",
  "md",
  "quality_manager",
  "lab_analyst",
  "procurement_officer",
  "inventory_manager",
  "finance",
  "business_development",
  "marketer",
  "operations_manager",
  "lab_manager",
  "secretary",
];
// Enter and edit test data
export const LAB_ROLES = [
  "super_admin",
  "md",
  "quality_manager",
  "lab_manager",
  "lab_analyst",
];
// Receive, register and edit samples
export const SAMPLE_ROLES = [
  ...LAB_ROLES,
  "inventory_manager",
  "operations_manager",
  "secretary",
];
export const FINANCE_ROLES = ["super_admin", "md", "finance"];
export const INVENTORY_ROLES = [
  "super_admin",
  "md",
  "inventory_manager",
  "lab_analyst",
  "lab_manager",
  "operations_manager",
];
// Approve or reject laboratory test results
export const APPROVAL_ROLES = ["super_admin", "md", "lab_manager"];
// Create and edit invoices
export const INVOICE_ROLES = [
  "super_admin",
  "md",
  "finance",
  "business_development",
  "secretary",
];
// Executive and operational reporting
export const REPORTING_ROLES = [
  "super_admin",
  "md",
  "finance",
  "operations_manager",
];
// Approve a sample request (which sends the client its quotation)
export const REQUEST_APPROVAL_ROLES = [
  ...STAFF_ROLES.filter((r) => r !== "lab_analyst"),
  "marketing_officer",
];
// Manage staff training records (HR may only view them)
export const TRAINING_MANAGER_ROLES = [
  "super_admin",
  "md",
  "lab_manager",
  "quality_manager",
];
export const TRAINING_VIEW_ROLES = [...TRAINING_MANAGER_ROLES, "hr_manager"];
// Read the audit trail
export const AUDIT_ROLES = [
  "super_admin",
  "md",
  "quality_manager",
  "internal_auditor",
];
