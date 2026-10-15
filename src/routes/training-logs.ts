import { Router, Request, Response } from "express";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db";
import { staff_training_logs, users } from "../db/schema";
import {
  authenticate,
  requirePermission,
} from "../middleware/auth";
import { createAuditLog } from "../middleware/audit";
import { AppError } from "../middleware/errorHandler";

const router = Router();

const trainingSchema = z.object({
  user_id: z.string().uuid(),
  title: z.string().min(1).max(255),
  category: z.string().max(100).optional(),
  provider: z.string().max(255).optional(),
  completed_on: z.string().date(),
  expires_on: z.string().date().optional().nullable(),
  notes: z.string().optional(),
});

const recorder = alias(users, "recorder");

// ─── GET /training-logs ───────────────────────────────────────────────────────

router.get(
  "/",
  authenticate,
  requirePermission("training_logs.view"),
  async (req: Request, res: Response) => {
    const { user_id } = req.query as Record<string, string>;
    const conditions = [eq(staff_training_logs.tenant_id, req.tenantId!)];
    if (user_id) conditions.push(eq(staff_training_logs.user_id, user_id));

    const list = await db
      .select({
        id: staff_training_logs.id,
        user_id: staff_training_logs.user_id,
        title: staff_training_logs.title,
        category: staff_training_logs.category,
        provider: staff_training_logs.provider,
        completed_on: staff_training_logs.completed_on,
        expires_on: staff_training_logs.expires_on,
        notes: staff_training_logs.notes,
        created_at: staff_training_logs.created_at,
        staff: {
          full_name: users.full_name,
          email: users.email,
          role: users.role,
          department: users.department,
        },
        recorded_by: { full_name: recorder.full_name },
      })
      .from(staff_training_logs)
      .leftJoin(users, eq(staff_training_logs.user_id, users.id))
      .leftJoin(recorder, eq(staff_training_logs.recorded_by, recorder.id))
      .where(and(...conditions))
      .orderBy(desc(staff_training_logs.completed_on));

    res.json({ data: list });
  },
);

// ─── POST /training-logs ──────────────────────────────────────────────────────

router.post(
  "/",
  authenticate,
  requirePermission("training_logs.create"),
  async (req: Request, res: Response) => {
    const body = trainingSchema.parse(req.body);

    const [staff] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, body.user_id), eq(users.tenant_id, req.tenantId!)))
      .limit(1);
    if (!staff) throw new AppError(404, "Staff member not found");

    const [created] = await db
      .insert(staff_training_logs)
      .values({
        ...body,
        tenant_id: req.tenantId!,
        recorded_by: req.user!.id,
      })
      .returning();

    await createAuditLog({
      tenant_id: req.tenantId!,
      user_id: req.user!.id,
      action: "CREATE",
      table_name: "staff_training_logs",
      record_id: created.id,
    });
    res.status(201).json({ data: created });
  },
);

// ─── PATCH /training-logs/:id ─────────────────────────────────────────────────

router.patch(
  "/:id",
  authenticate,
  requirePermission("training_logs.update"),
  async (req: Request, res: Response) => {
    const body = trainingSchema.omit({ user_id: true }).partial().parse(req.body);

    const [updated] = await db
      .update(staff_training_logs)
      .set({ ...body, updated_at: new Date() })
      .where(
        and(
          eq(staff_training_logs.id, req.params.id),
          eq(staff_training_logs.tenant_id, req.tenantId!),
        ),
      )
      .returning();
    if (!updated) throw new AppError(404, "Training record not found");

    await createAuditLog({
      tenant_id: req.tenantId!,
      user_id: req.user!.id,
      action: "UPDATE",
      table_name: "staff_training_logs",
      record_id: updated.id,
    });
    res.json({ data: updated });
  },
);

// ─── DELETE /training-logs/:id ────────────────────────────────────────────────

router.delete(
  "/:id",
  authenticate,
  requirePermission("training_logs.delete"),
  async (req: Request, res: Response) => {
    const [deleted] = await db
      .delete(staff_training_logs)
      .where(
        and(
          eq(staff_training_logs.id, req.params.id),
          eq(staff_training_logs.tenant_id, req.tenantId!),
        ),
      )
      .returning();
    if (!deleted) throw new AppError(404, "Training record not found");

    await createAuditLog({
      tenant_id: req.tenantId!,
      user_id: req.user!.id,
      action: "DELETE",
      table_name: "staff_training_logs",
      record_id: deleted.id,
    });
    res.json({ success: true });
  },
);

export default router;
