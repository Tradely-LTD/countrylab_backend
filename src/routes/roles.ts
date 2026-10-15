import { Router, Request, Response } from "express";
import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../db";
import { roles, users } from "../db/schema";
import { authenticate, requirePermission } from "../middleware/auth";
import { createAuditLog } from "../middleware/audit";
import { AppError } from "../middleware/errorHandler";
import {
  PERMISSION_CATALOG,
  SUPER_ADMIN,
  SYSTEM_ROLES,
  defaultPermissions,
  isSystemRole,
  sanitizePermissions,
} from "../lib/permissions";
import {
  getTenantRoles,
  invalidateTenantRoles,
} from "../services/permissionService";

const router = Router();

// Team managers need the role list to assign roles; editing needs roles.update
const canRead = requirePermission("roles.view", "team.view");
const canManage = requirePermission("roles.update");

// ─── GET /roles/catalog ───────────────────────────────────────────────────────

router.get("/catalog", authenticate, canRead, (_req: Request, res: Response) => {
  res.json({ data: PERMISSION_CATALOG });
});

// ─── GET /roles ───────────────────────────────────────────────────────────────

router.get("/", authenticate, canRead, async (req: Request, res: Response) => {
  const [tenantRoles, counts] = await Promise.all([
    getTenantRoles(req.tenantId!),
    db
      .select({ role: users.role, count: sql<number>`count(*)::int` })
      .from(users)
      .where(and(eq(users.tenant_id, req.tenantId!), eq(users.is_active, true)))
      .groupBy(users.role),
  ]);
  const countBy = new Map(counts.map((c) => [c.role, c.count]));

  res.json({
    data: [...tenantRoles.values()]
      // customers are external accounts, not staff roles
      .filter((r) => r.key !== "customer")
      .map((r) => ({
        ...r,
        user_count: countBy.get(r.key) ?? 0,
        editable: r.key !== SUPER_ADMIN,
      })),
  });
});

// ─── POST /roles ── create a custom role ──────────────────────────────────────

router.post("/", authenticate, canManage, async (req: Request, res: Response) => {
  const body = z
    .object({
      name: z.string().trim().min(2).max(100),
      description: z.string().max(500).optional(),
      copy_from: z.string().optional(),
      permissions: z.array(z.string()).optional(),
    })
    .parse(req.body);

  const key = body.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 50);
  if (!key) throw new AppError(400, "Role name must contain letters or numbers");

  const tenantRoles = await getTenantRoles(req.tenantId!);
  if (tenantRoles.has(key)) {
    throw new AppError(409, `A role named "${body.name}" already exists`);
  }

  let permissions = sanitizePermissions(body.permissions ?? []);
  if (body.copy_from) {
    const source = tenantRoles.get(body.copy_from);
    if (!source) throw new AppError(400, `Unknown role: ${body.copy_from}`);
    permissions = [...source.permissions];
  }

  const [created] = await db
    .insert(roles)
    .values({
      tenant_id: req.tenantId!,
      key,
      name: body.name,
      description: body.description,
      is_system: false,
      permissions,
    })
    .returning();

  invalidateTenantRoles(req.tenantId!);
  await createAuditLog({
    tenant_id: req.tenantId!,
    user_id: req.user!.id,
    action: "CREATE",
    table_name: "roles",
    record_id: created.id,
    new_value: { key, name: body.name, permissions },
  });
  res.status(201).json({ data: { ...created, user_count: 0, editable: true } });
});

// ─── PUT /roles/:key ── rename or change permissions ──────────────────────────

router.put("/:key", authenticate, canManage, async (req: Request, res: Response) => {
  const { key } = req.params;
  if (key === SUPER_ADMIN) {
    throw new AppError(400, "Super Admin always has full access and cannot be edited");
  }
  const body = z
    .object({
      name: z.string().trim().min(2).max(100).optional(),
      description: z.string().max(500).nullable().optional(),
      permissions: z.array(z.string()).optional(),
    })
    .parse(req.body);

  const tenantRoles = await getTenantRoles(req.tenantId!);
  const current = tenantRoles.get(key);
  if (!current) throw new AppError(404, "Role not found");

  const permissions =
    body.permissions !== undefined
      ? sanitizePermissions(body.permissions)
      : current.permissions;

  // Don't let an admin remove their own access to this screen
  if (req.user!.role === key && !permissions.includes("roles.update")) {
    throw new AppError(
      400,
      "You can't remove 'Manage Roles & Permissions' from your own role",
    );
  }

  const values = {
    name: body.name ?? current.name,
    description:
      body.description !== undefined ? body.description : current.description,
    permissions,
    updated_at: new Date(),
  };

  // Built-in roles get a row the first time they are edited
  const [saved] = await db
    .insert(roles)
    .values({
      tenant_id: req.tenantId!,
      key,
      is_system: isSystemRole(key),
      ...values,
    })
    .onConflictDoUpdate({ target: [roles.tenant_id, roles.key], set: values })
    .returning();

  invalidateTenantRoles(req.tenantId!);
  await createAuditLog({
    tenant_id: req.tenantId!,
    user_id: req.user!.id,
    action: "UPDATE",
    table_name: "roles",
    record_id: saved.id,
    old_value: { name: current.name, permissions: current.permissions },
    new_value: { name: values.name, permissions },
    metadata: { role: key },
  });

  const refreshed = (await getTenantRoles(req.tenantId!)).get(key);
  res.json({ data: { ...refreshed, editable: true } });
});

// ─── POST /roles/:key/reset ── restore a built-in role's defaults ─────────────

router.post(
  "/:key/reset",
  authenticate,
  canManage,
  async (req: Request, res: Response) => {
    const { key } = req.params;
    if (!isSystemRole(key) || key === SUPER_ADMIN) {
      throw new AppError(400, "Only built-in roles can be reset");
    }
    if (req.user!.role === key && !defaultPermissions(key).includes("roles.update")) {
      throw new AppError(
        400,
        "Resetting your own role would remove your access to Roles & Permissions",
      );
    }
    const [deleted] = await db
      .delete(roles)
      .where(and(eq(roles.tenant_id, req.tenantId!), eq(roles.key, key)))
      .returning();

    invalidateTenantRoles(req.tenantId!);
    if (deleted) {
      await createAuditLog({
        tenant_id: req.tenantId!,
        user_id: req.user!.id,
        action: "UPDATE",
        table_name: "roles",
        record_id: deleted.id,
        old_value: { name: deleted.name, permissions: deleted.permissions },
        metadata: { role: key, reset_to_default: true },
      });
    }
    const refreshed = (await getTenantRoles(req.tenantId!)).get(key);
    res.json({ data: { ...refreshed, editable: true } });
  },
);

// ─── DELETE /roles/:key ── custom roles only, once nobody holds them ──────────

router.delete("/:key", authenticate, canManage, async (req: Request, res: Response) => {
  const { key } = req.params;
  if (SYSTEM_ROLES.some((r) => r.key === key)) {
    throw new AppError(400, "Built-in roles can't be deleted; reset them instead");
  }
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.tenant_id, req.tenantId!), eq(users.role, key)));
  if (count > 0) {
    throw new AppError(
      409,
      `${count} team member(s) still have this role. Reassign them first.`,
    );
  }

  const [deleted] = await db
    .delete(roles)
    .where(and(eq(roles.tenant_id, req.tenantId!), eq(roles.key, key)))
    .returning();
  if (!deleted) throw new AppError(404, "Role not found");

  invalidateTenantRoles(req.tenantId!);
  await createAuditLog({
    tenant_id: req.tenantId!,
    user_id: req.user!.id,
    action: "DELETE",
    table_name: "roles",
    record_id: deleted.id,
    old_value: { key, name: deleted.name, permissions: deleted.permissions },
  });
  res.json({ success: true });
});

export default router;
