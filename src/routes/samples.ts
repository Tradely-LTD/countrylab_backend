import { Router, Request, Response } from "express";
import { z } from "zod";
import { eq, and, desc, ilike, sql } from "drizzle-orm";
import { db } from "../db";
import { samples, clients, users, audit_logs } from "../db/schema";
import {
  authenticate,
  requireRole,
  LAB_ROLES,
  STAFF_ROLES,
} from "../middleware/auth";
import { createAuditLog } from "../middleware/audit";
import { AppError } from "../middleware/errorHandler";
import { generateULID, generateBarcode } from "../services/barcodeService";
import { logger } from "../utils/logger";

const router = Router();

// ─── Validation Schemas ───────────────────────────────────────────────────────

const createSampleSchema = z.object({
  client_id: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  matrix: z.string().optional(),
  collection_date: z.string().datetime().optional(),
  storage_zone: z.string().optional(),
  storage_location: z.string().optional(),
  assigned_analyst_id: z.string().uuid().optional(),
  notes: z.string().optional(),
  // Enhanced CoA fields
  sample_container: z.string().optional(),
  sample_volume: z.string().optional(),
  reference_standard: z.string().optional(),
  batch_number: z.string().optional(),
  sample_condition: z.string().optional(),
  temperature_on_receipt: z.string().optional(),
  sampling_point: z.string().optional(),
  production_date: z.string().datetime().optional(),
  expiry_date: z.string().datetime().optional(),
  manufacturer: z.string().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum([
    "received",
    "in_testing",
    "pending_review",
    "approved",
    "disposed",
    "voided",
  ]),
  reason: z.string().optional(),
});

// ─── GET /samples ─────────────────────────────────────────────────────────────

router.get("/", authenticate, async (req: Request, res: Response) => {
  try {
    const {
      page = "1",
      limit = "25",
      status,
      search,
      client_id,
      analyst_id,
    } = req.query as Record<string, string>;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conditions = [eq(samples.tenant_id, req.tenantId!)];

    if (status) conditions.push(eq(samples.status, status as any));
    if (client_id) conditions.push(eq(samples.client_id, client_id));
    if (analyst_id)
      conditions.push(eq(samples.assigned_analyst_id, analyst_id));
    if (search) {
      conditions.push(
        sql`(${samples.name} ILIKE ${"%" + search + "%"} OR ${samples.ulid} ILIKE ${"%" + search + "%"})`,
      );
    }

    const [sampleList, [{ count }]] = await Promise.all([
      db
        .select({
          id: samples.id,
          ulid: samples.ulid,
          name: samples.name,
          matrix: samples.matrix,
          status: samples.status,
          storage_location: samples.storage_location,
          received_at: samples.received_at,
          collection_date: samples.collection_date,
          notes: samples.notes,
          client: {
            id: clients.id,
            name: clients.name,
            company: clients.company,
          },
          analyst: {
            id: users.id,
            full_name: users.full_name,
          },
        })
        .from(samples)
        .leftJoin(clients, eq(samples.client_id, clients.id))
        .leftJoin(users, eq(samples.assigned_analyst_id, users.id))
        .where(and(...conditions))
        .orderBy(desc(samples.received_at))
        .limit(parseInt(limit))
        .offset(offset),

      db
        .select({ count: sql<number>`count(*)::int` })
        .from(samples)
        .where(and(...conditions)),
    ]);

    res.json({
      data: sampleList,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error("Error fetching samples:", error);
    throw error;
  }
});

// ─── GET /samples/:id ─────────────────────────────────────────────────────────

router.get("/:id", authenticate, async (req: Request, res: Response) => {
  const [sample] = await db
    .select({
      id: samples.id,
      tenant_id: samples.tenant_id,
      ulid: samples.ulid,
      name: samples.name,
      description: samples.description,
      matrix: samples.matrix,
      collection_date: samples.collection_date,
      received_at: samples.received_at,
      status: samples.status,
      storage_zone: samples.storage_zone,
      storage_location: samples.storage_location,
      barcode_url: samples.barcode_url,
      disposed_at: samples.disposed_at,
      voided_at: samples.voided_at,
      void_reason: samples.void_reason,
      notes: samples.notes,
      created_at: samples.created_at,
      updated_at: samples.updated_at,
      client: {
        id: clients.id,
        name: clients.name,
        company: clients.company,
        email: clients.email,
        phone: clients.phone,
      },
      analyst: {
        id: users.id,
        full_name: users.full_name,
        email: users.email,
        role: users.role,
      },
    })
    .from(samples)
    .leftJoin(clients, eq(samples.client_id, clients.id))
    .leftJoin(users, eq(samples.assigned_analyst_id, users.id))
    .where(
      and(eq(samples.id, req.params.id), eq(samples.tenant_id, req.tenantId!)),
    )
    .limit(1);

  if (!sample) throw new AppError(404, "Sample not found");

  await createAuditLog({
    tenant_id: req.tenantId!,
    user_id: req.user!.id,
    action: "READ",
    table_name: "samples",
    record_id: sample.id,
  });

  res.json({ data: sample });
});

// ─── POST /samples ────────────────────────────────────────────────────────────

router.post(
  "/",
  authenticate,
  requireRole(...LAB_ROLES, "inventory_manager"),
  async (req: Request, res: Response) => {
    const body = createSampleSchema.parse(req.body);

    // Verify client belongs to tenant
    const [client] = await db
      .select()
      .from(clients)
      .where(
        and(
          eq(clients.id, body.client_id),
          eq(clients.tenant_id, req.tenantId!),
        ),
      )
      .limit(1);

    if (!client) throw new AppError(404, "Client not found");

    const ulid = generateULID();
    const barcodeUrl = await generateBarcode(ulid);

    const [newSample] = await db
      .insert(samples)
      .values({
        tenant_id: req.tenantId!,
        ulid,
        client_id: body.client_id,
        name: body.name,
        description: body.description,
        matrix: body.matrix,
        collection_date: body.collection_date
          ? new Date(body.collection_date)
          : null,
        storage_zone: body.storage_zone,
        storage_location: body.storage_location,
        assigned_analyst_id: body.assigned_analyst_id,
        notes: body.notes,
        barcode_url: barcodeUrl,
        received_by: req.user!.id,
      })
      .returning();

    await createAuditLog({
      tenant_id: req.tenantId!,
      user_id: req.user!.id,
      action: "CREATE",
      table_name: "samples",
      record_id: newSample.id,
      new_value: newSample,
    });

    res
      .status(201)
      .json({ data: newSample, message: "Sample registered successfully" });
  },
);

// ─── PATCH /samples/:id ───────────────────────────────────────────────────────

router.patch(
  "/:id",
  authenticate,
  requireRole(...LAB_ROLES),
  async (req: Request, res: Response) => {
    const [existing] = await db
      .select()
      .from(samples)
      .where(
        and(
          eq(samples.id, req.params.id),
          eq(samples.tenant_id, req.tenantId!),
        ),
      )
      .limit(1);

    if (!existing) throw new AppError(404, "Sample not found");
    if (existing.voided_at)
      throw new AppError(400, "Cannot modify a voided sample");

    const body = createSampleSchema.partial().parse(req.body);

    const [updated] = await db
      .update(samples)
      .set({ ...body, updated_at: new Date() })
      .where(eq(samples.id, req.params.id))
      .returning();

    await createAuditLog({
      tenant_id: req.tenantId!,
      user_id: req.user!.id,
      action: "UPDATE",
      table_name: "samples",
      record_id: existing.id,
      old_value: existing as Record<string, unknown>,
      new_value: updated as Record<string, unknown>,
    });

    res.json({ data: updated });
  },
);

// ─── PATCH /samples/:id/status ────────────────────────────────────────────────

router.patch(
  "/:id/status",
  authenticate,
  requireRole(...STAFF_ROLES),
  async (req: Request, res: Response) => {
    const { status, reason } = updateStatusSchema.parse(req.body);

    const [existing] = await db
      .select()
      .from(samples)
      .where(
        and(
          eq(samples.id, req.params.id),
          eq(samples.tenant_id, req.tenantId!),
        ),
      )
      .limit(1);

    if (!existing) throw new AppError(404, "Sample not found");

    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date(),
    };

    if (status === "voided") {
      updateData.voided_at = new Date();
      updateData.void_reason = reason || "No reason provided";
    }
    if (status === "disposed") {
      updateData.disposed_at = new Date();
    }

    const [updated] = await db
      .update(samples)
      .set(updateData as any)
      .where(eq(samples.id, req.params.id))
      .returning();

    await createAuditLog({
      tenant_id: req.tenantId!,
      user_id: req.user!.id,
      action: "UPDATE",
      table_name: "samples",
      record_id: existing.id,
      old_value: { status: existing.status },
      new_value: { status, reason },
      metadata: { action: "STATUS_CHANGE" },
    });

    res.json({ data: updated, message: `Sample status updated to ${status}` });
  },
);

// ─── GET /samples/stats ───────────────────────────────────────────────────────

router.get("/meta/stats", authenticate, async (req: Request, res: Response) => {
  const stats = await db
    .select({
      status: samples.status,
      count: sql<number>`count(*)::int`,
    })
    .from(samples)
    .where(eq(samples.tenant_id, req.tenantId!))
    .groupBy(samples.status);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [todayCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(samples)
    .where(
      and(
        eq(samples.tenant_id, req.tenantId!),
        sql`${samples.received_at} >= ${today}`,
      ),
    );

  res.json({
    data: {
      byStatus: stats,
      receivedToday: todayCount.count,
    },
  });
});

export default router;
