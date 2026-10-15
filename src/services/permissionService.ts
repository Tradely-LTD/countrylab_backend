import { eq } from "drizzle-orm";
import { db } from "../db";
import { roles } from "../db/schema";
import { logger } from "../utils/logger";
import {
  ALL_PERMISSIONS,
  SUPER_ADMIN,
  SYSTEM_ROLES,
  defaultPermissions,
  sanitizePermissions,
} from "../lib/permissions";

export interface ResolvedRole {
  key: string;
  name: string;
  description: string | null;
  is_system: boolean;
  is_customized: boolean;
  permissions: string[];
}

// Short-lived per-tenant cache; writes invalidate it immediately, and the TTL
// bounds staleness if the API ever runs on more than one instance.
const TTL_MS = 30_000;
const cache = new Map<string, { at: number; roles: Map<string, ResolvedRole> }>();

export function invalidateTenantRoles(tenantId: string) {
  cache.delete(tenantId);
}

export async function getTenantRoles(
  tenantId: string,
): Promise<Map<string, ResolvedRole>> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.roles;

  let rows: (typeof roles.$inferSelect)[] = [];
  try {
    rows = await db.select().from(roles).where(eq(roles.tenant_id, tenantId));
  } catch (error: any) {
    // Before migration 0010 runs the table doesn't exist; serve the defaults
    // rather than failing every request.
    const code = error?.code ?? error?.cause?.code;
    if (code !== "42P01") throw error;
    logger.warn("roles table missing; using default permissions (run migration 0010)");
  }
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const out = new Map<string, ResolvedRole>();

  for (const sys of SYSTEM_ROLES) {
    const row = byKey.get(sys.key);
    out.set(sys.key, {
      key: sys.key,
      name: row?.name ?? sys.name,
      description: row?.description ?? null,
      is_system: true,
      is_customized: !!row && sys.key !== SUPER_ADMIN,
      permissions:
        sys.key === SUPER_ADMIN
          ? [...ALL_PERMISSIONS]
          : row
            ? sanitizePermissions(row.permissions)
            : defaultPermissions(sys.key),
    });
  }
  for (const row of rows) {
    if (out.has(row.key)) continue;
    out.set(row.key, {
      key: row.key,
      name: row.name,
      description: row.description,
      is_system: false,
      is_customized: true,
      permissions: sanitizePermissions(row.permissions),
    });
  }

  cache.set(tenantId, { at: Date.now(), roles: out });
  return out;
}

export async function getPermissions(tenantId: string, role: string) {
  if (role === SUPER_ADMIN) return new Set(ALL_PERMISSIONS);
  const tenantRoles = await getTenantRoles(tenantId);
  return new Set(tenantRoles.get(role)?.permissions ?? []);
}
