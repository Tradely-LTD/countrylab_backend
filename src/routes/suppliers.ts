import { Router, Request, Response } from "express";
import { z } from "zod";
import { eq, and, desc, ilike, sql } from "drizzle-orm";
import { db } from "../db";
import { suppliers, purchase_orders, requisitions } from "../db/schema";
import { authenticate, requireRole } from "../middleware/auth";
import { createAuditLog } from "../middleware/audit";
import { AppError } from "../middleware/errorHandler";

const router = Router();

// ─── Validation ───────────────────────────────────────────────────────────────

const createSupplierSchema = z.object({
  name: z.string().min(1, "Supplier name is required"),
  company: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  contact_person: z.string().optional(),
  website: z.string().url().optional().or(z.literal("")),
  tax_id: z.string().optional(),
  payment_terms: z.string().optional(),
  currency: z.string().default("NGN"),
  notes: z.string().optional(),
});

const updateSupplierSchema = createSupplierSchema.partial();

// ─── GET /suppliers ───────────────────────────────────────────────────────────

router.get(
  "/",
  authenticate,
  requireRole("super_admin", "md", "procurement_officer", "inventory_manager"),
  async (req: Request, res: Response) => {
    const {
      search,
      page = "1",
      limit = "50",
    } = req.query as Record<string, string>;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conditions = [eq(suppliers.tenant_id, req.tenantId!)];

    if (search) {
      conditions.push(
        sql`(${suppliers.name} ILIKE ${`%${search}%`} OR ${suppliers.company} ILIKE ${`%${search}%`})`,
      );
    }

    const [supplierList, [{ count }]] = await Promise.all([
      db
        .select()
        .from(suppliers)
        .where(and(...conditions))
        .orderBy(desc(suppliers.created_at))
        .limit(parseInt(limit))
        .offset(offset),

      db
        .select({ count: sql<number>`count(*)::int` })
        .from(suppliers)
        .where(and(...conditions)),
    ]);

    res.json({
      data: supplierList,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
      },
    });
  },
);

// ─── GET /suppliers/:id ───────────────────────────────────────────────────────

router.get(
  "/:id",
  authenticate,
  requireRole("super_admin", "md", "procurement_officer", "inventory_manager"),
  async (req: Request, res: Response) => {
    const [supplier] = await db
      .select()
      .from(suppliers)
      .where(
        and(
          eq(suppliers.id, req.params.id),
          eq(suppliers.tenant_id, req.tenantId!),
        ),
      )
      .limit(1);

    if (!supplier) throw new AppError(404, "Supplier not found");

    res.json({ data: supplier });
  },
);

// ─── POST /suppliers ──────────────────────────────────────────────────────────

router.post(
  "/",
  authenticate,
  requireRole("super_admin", "procurement_officer", "inventory_manager"),
  async (req: Request, res: Response) => {
    const body = createSupplierSchema.parse(req.body);

    const [newSupplier] = await db
      .insert(suppliers)
      .values({
        ...body,
        tenant_id: req.tenantId!,
        created_by: req.user!.id,
      })
      .returning();

    await createAuditLog({
      tenant_id: req.tenantId!,
      user_id: req.user!.id,
      action: "CREATE",
      table_name: "suppliers",
      record_id: newSupplier.id,
      new_value: newSupplier as unknown as Record<string, unknown>,
    });

    res.status(201).json({ data: newSupplier });
  },
);

// ─── PUT /suppliers/:id ───────────────────────────────────────────────────────

router.put(
  "/:id",
  authenticate,
  requireRole("super_admin", "procurement_officer", "inventory_manager"),
  async (req: Request, res: Response) => {
    const body = updateSupplierSchema.parse(req.body);

    const [existing] = await db
      .select()
      .from(suppliers)
      .where(
        and(
          eq(suppliers.id, req.params.id),
          eq(suppliers.tenant_id, req.tenantId!),
        ),
      )
      .limit(1);

    if (!existing) throw new AppError(404, "Supplier not found");

    const [updated] = await db
      .update(suppliers)
      .set({ ...body, updated_at: new Date() })
      .where(eq(suppliers.id, req.params.id))
      .returning();

    await createAuditLog({
      tenant_id: req.tenantId!,
      user_id: req.user!.id,
      action: "UPDATE",
      table_name: "suppliers",
      record_id: existing.id,
      old_value: existing as unknown as Record<string, unknown>,
      new_value: updated as unknown as Record<string, unknown>,
    });

    res.json({ data: updated });
  },
);

// ─── DELETE /suppliers/:id ────────────────────────────────────────────────────

router.delete(
  "/:id",
  authenticate,
  requireRole("super_admin"),
  async (req: Request, res: Response) => {
    const [existing] = await db
      .select()
      .from(suppliers)
      .where(
        and(
          eq(suppliers.id, req.params.id),
          eq(suppliers.tenant_id, req.tenantId!),
        ),
      )
      .limit(1);

    if (!existing) throw new AppError(404, "Supplier not found");

    // Soft delete by setting is_active to false
    const [deleted] = await db
      .update(suppliers)
      .set({ is_active: false, updated_at: new Date() })
      .where(eq(suppliers.id, req.params.id))
      .returning();

    await createAuditLog({
      tenant_id: req.tenantId!,
      user_id: req.user!.id,
      action: "DELETE",
      table_name: "suppliers",
      record_id: existing.id,
      old_value: existing as unknown as Record<string, unknown>,
    });

    res.json({ message: "Supplier deactivated successfully" });
  },
);

// Get supplier history (purchase orders, requisitions)
router.get(
  "/:id/history",
  authenticate,
  requireRole("super_admin", "md", "procurement_officer", "inventory_manager"),
  async (req: Request, res: Response) => {
    const { id } = req.params;

    // Get purchase orders for this supplier
    const pos = await db
      .select({
        id: purchase_orders.id,
        po_number: purchase_orders.po_number,
        total_amount: purchase_orders.total_amount,
        status: purchase_orders.status,
        created_at: purchase_orders.created_at,
      })
      .from(purchase_orders)
      .where(
        and(
          eq(purchase_orders.supplier_id, id),
          eq(purchase_orders.tenant_id, req.tenantId!),
        ),
      )
      .orderBy(desc(purchase_orders.created_at))
      .limit(20);

    // Get requisitions (recent ones, not supplier-specific)
    const reqs = await db
      .select({
        id: requisitions.id,
        requisition_number: requisitions.requisition_number,
        department: requisitions.department,
        status: requisitions.status,
        created_at: requisitions.created_at,
      })
      .from(requisitions)
      .where(eq(requisitions.tenant_id, req.tenantId!))
      .orderBy(desc(requisitions.created_at))
      .limit(10);

    res.json({
      success: true,
      data: {
        purchase_orders: pos,
        requisitions: reqs,
      },
    });
  },
);

export default router;
