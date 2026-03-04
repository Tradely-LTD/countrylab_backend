import { Router, Request, Response } from "express";
import { z } from "zod";
import { eq, and, desc, sql, lte, lt } from "drizzle-orm";
import { db } from "../db";
import {
  reagents,
  assets,
  asset_logs,
  requisitions,
  purchase_orders,
  users,
} from "../db/schema";
import {
  authenticate,
  requireRole,
  INVENTORY_ROLES,
  STAFF_ROLES,
  APPROVAL_ROLES,
} from "../middleware/auth";
import { createAuditLog } from "../middleware/audit";
import { AppError } from "../middleware/errorHandler";
import { logger } from "../utils/logger";

// ════════════════════════════════════════════════════════════════
// INVENTORY / REAGENTS ROUTER
// ════════════════════════════════════════════════════════════════
export const inventoryRouter = Router();

const reagentSchema = z.object({
  product_type: z
    .enum(["reagent", "consumable", "standard", "supply", "kit"])
    .default("reagent"),
  name: z.string().min(1).max(255),
  chemical_name: z.string().optional(),
  cas_number: z.string().optional(),
  catalog_number: z.string().optional(),
  lot_number: z.string().optional(),
  manufacturer: z.string().optional(),
  supplier_id: z.string().uuid().optional(),
  grade: z.enum(["AR", "HPLC", "GR", "LR", "Technical"]).optional(),
  category: z.string().optional(),
  batch_number: z.string().optional(),
  quantity: z.number().min(0).default(0),
  unit: z.string().default("units"),
  reorder_level: z.number().default(10),
  unit_price: z.number().min(0).default(0).optional(),
  expiry_date: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined)),
  storage_conditions: z.string().optional(),
  storage_location: z.string().optional(),
});

inventoryRouter.get(
  "/reagents",
  authenticate,
  async (req: Request, res: Response) => {
    const {
      page = "1",
      limit = "50",
      low_stock,
      expiring_soon,
    } = req.query as Record<string, string>;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conditions = [eq(reagents.tenant_id, req.tenantId!)];
    if (low_stock === "true") {
      conditions.push(sql`${reagents.quantity} <= ${reagents.reorder_level}`);
    }
    if (expiring_soon === "true") {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      conditions.push(lte(reagents.expiry_date, thirtyDaysFromNow));
    }

    const list = await db
      .select()
      .from(reagents)
      .where(and(...conditions))
      .orderBy(desc(reagents.updated_at))
      .limit(parseInt(limit))
      .offset(offset);

    res.json({ data: list });
  },
);

inventoryRouter.post(
  "/reagents",
  authenticate,
  requireRole(...INVENTORY_ROLES),
  async (req: Request, res: Response) => {
    const body = reagentSchema.parse(req.body);
    const [newReagent] = await db
      .insert(reagents)
      .values({
        tenant_id: req.tenantId!,
        ...body,
        expiry_date: body.expiry_date ? new Date(body.expiry_date) : null,
        created_by: req.user!.id,
      })
      .returning();

    await createAuditLog({
      tenant_id: req.tenantId!,
      user_id: req.user!.id,
      action: "CREATE",
      table_name: "reagents",
      record_id: newReagent.id,
    });
    res.status(201).json({ data: newReagent });
  },
);

inventoryRouter.patch(
  "/reagents/:id",
  authenticate,
  requireRole(...INVENTORY_ROLES),
  async (req: Request, res: Response) => {
    const body = reagentSchema.partial().parse(req.body);
    const [updated] = await db
      .update(reagents)
      .set({ ...body, updated_at: new Date() })
      .where(
        and(
          eq(reagents.id, req.params.id),
          eq(reagents.tenant_id, req.tenantId!),
        ),
      )
      .returning();
    if (!updated) throw new AppError(404, "Reagent not found");
    await createAuditLog({
      tenant_id: req.tenantId!,
      user_id: req.user!.id,
      action: "UPDATE",
      table_name: "reagents",
      record_id: updated.id,
    });
    res.json({ data: updated });
  },
);

inventoryRouter.patch(
  "/reagents/:id/stock",
  authenticate,
  requireRole(...INVENTORY_ROLES),
  async (req: Request, res: Response) => {
    const { adjustment, type } = z
      .object({
        adjustment: z.number(),
        type: z.enum(["add", "subtract", "set"]),
      })
      .parse(req.body);

    const [existing] = await db
      .select()
      .from(reagents)
      .where(
        and(
          eq(reagents.id, req.params.id),
          eq(reagents.tenant_id, req.tenantId!),
        ),
      )
      .limit(1);
    if (!existing) throw new AppError(404, "Reagent not found");

    let newQuantity: number;
    if (type === "set") newQuantity = adjustment;
    else if (type === "add")
      newQuantity = (existing.quantity || 0) + adjustment;
    else newQuantity = Math.max(0, (existing.quantity || 0) - adjustment);

    const [updated] = await db
      .update(reagents)
      .set({ quantity: newQuantity, updated_at: new Date() })
      .where(eq(reagents.id, req.params.id))
      .returning();
    await createAuditLog({
      tenant_id: req.tenantId!,
      user_id: req.user!.id,
      action: "UPDATE",
      table_name: "reagents",
      record_id: updated.id,
      metadata: { action: "STOCK_ADJUSTMENT", type, adjustment, newQuantity },
    });
    res.json({ data: updated });
  },
);

inventoryRouter.get(
  "/reagents/alerts",
  authenticate,
  async (req: Request, res: Response) => {
    const now = new Date();
    const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [lowStock, expiringSoon, expired] = await Promise.all([
      db
        .select()
        .from(reagents)
        .where(
          and(
            eq(reagents.tenant_id, req.tenantId!),
            sql`${reagents.quantity} <= ${reagents.reorder_level}`,
            eq(reagents.is_active, true),
          ),
        ),
      db
        .select()
        .from(reagents)
        .where(
          and(
            eq(reagents.tenant_id, req.tenantId!),
            lte(reagents.expiry_date, thirtyDays),
            sql`${reagents.expiry_date} > ${now}`,
          ),
        ),
      db
        .select()
        .from(reagents)
        .where(
          and(
            eq(reagents.tenant_id, req.tenantId!),
            lt(reagents.expiry_date, now),
          ),
        ),
    ]);

    res.json({ data: { lowStock, expiringSoon, expired } });
  },
);

// ════════════════════════════════════════════════════════════════
// ASSETS ROUTER
// ════════════════════════════════════════════════════════════════
export const assetsRouter = Router();

const assetSchema = z.object({
  name: z.string().min(1),
  asset_tag: z.string().optional(),
  model: z.string().optional(),
  serial_number: z.string().optional(),
  manufacturer: z.string().optional(),
  purchase_date: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined)),
  warranty_expiry: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined)),
  status: z
    .enum(["operational", "under_repair", "calibration_due", "decommissioned"])
    .optional(),
  custodian_id: z.string().uuid().optional(),
  location: z.string().optional(),
  calibration_frequency_days: z.number().optional(),
  notes: z.string().optional(),
});

assetsRouter.get("/", authenticate, async (req: Request, res: Response) => {
  const list = await db
    .select({
      id: assets.id,
      name: assets.name,
      asset_tag: assets.asset_tag,
      model: assets.model,
      serial_number: assets.serial_number,
      status: assets.status,
      location: assets.location,
      next_calibration_date: assets.next_calibration_date,
      last_calibration_date: assets.last_calibration_date,
      custodian: { id: users.id, full_name: users.full_name },
    })
    .from(assets)
    .leftJoin(users, eq(assets.custodian_id, users.id))
    .where(eq(assets.tenant_id, req.tenantId!))
    .orderBy(assets.name);

  res.json({ data: list });
});

assetsRouter.get(
  "/due-calibration",
  authenticate,
  async (req: Request, res: Response) => {
    const thirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const list = await db
      .select()
      .from(assets)
      .where(
        and(
          eq(assets.tenant_id, req.tenantId!),
          lte(assets.next_calibration_date, thirtyDays),
        ),
      );
    res.json({ data: list, count: list.length });
  },
);

assetsRouter.post(
  "/",
  authenticate,
  requireRole("super_admin", "md", "inventory_manager"),
  async (req: Request, res: Response) => {
    const body = assetSchema.parse(req.body);
    const [newAsset] = await db
      .insert(assets)
      .values({
        tenant_id: req.tenantId!,
        ...body,
        purchase_date: body.purchase_date ? new Date(body.purchase_date) : null,
        warranty_expiry: body.warranty_expiry
          ? new Date(body.warranty_expiry)
          : null,
      })
      .returning();
    await createAuditLog({
      tenant_id: req.tenantId!,
      user_id: req.user!.id,
      action: "CREATE",
      table_name: "assets",
      record_id: newAsset.id,
    });
    res.status(201).json({ data: newAsset });
  },
);

assetsRouter.patch(
  "/:id",
  authenticate,
  requireRole("super_admin", "md", "inventory_manager"),
  async (req: Request, res: Response) => {
    const body = assetSchema.partial().parse(req.body);
    const [updated] = await db
      .update(assets)
      .set({ ...body, updated_at: new Date() })
      .where(
        and(eq(assets.id, req.params.id), eq(assets.tenant_id, req.tenantId!)),
      )
      .returning();
    if (!updated) throw new AppError(404, "Asset not found");
    res.json({ data: updated });
  },
);

assetsRouter.post(
  "/:id/log",
  authenticate,
  requireRole("super_admin", "md", "inventory_manager", "quality_manager"),
  async (req: Request, res: Response) => {
    const { action, description, next_due_date, attachment_url } = z
      .object({
        action: z.string().min(1),
        description: z.string().optional(),
        next_due_date: z.string().datetime().optional(),
        attachment_url: z.string().url().optional(),
      })
      .parse(req.body);

    const [log] = await db
      .insert(asset_logs)
      .values({
        asset_id: req.params.id,
        action,
        description,
        performed_by: req.user!.id,
        next_due_date: next_due_date ? new Date(next_due_date) : null,
        attachment_url,
      })
      .returning();

    // Update asset calibration dates if applicable
    if (action === "calibrated" && next_due_date) {
      await db
        .update(assets)
        .set({
          last_calibration_date: new Date(),
          next_calibration_date: new Date(next_due_date),
          status: "operational",
          updated_at: new Date(),
        })
        .where(eq(assets.id, req.params.id));
    }

    res.status(201).json({ data: log });
  },
);

assetsRouter.get(
  "/:id/logs",
  authenticate,
  async (req: Request, res: Response) => {
    const logs = await db
      .select({
        id: asset_logs.id,
        action: asset_logs.action,
        description: asset_logs.description,
        performed_at: asset_logs.performed_at,
        next_due_date: asset_logs.next_due_date,
        performer: { full_name: users.full_name },
      })
      .from(asset_logs)
      .leftJoin(users, eq(asset_logs.performed_by, users.id))
      .where(eq(asset_logs.asset_id, req.params.id))
      .orderBy(desc(asset_logs.performed_at));
    res.json({ data: logs });
  },
);

// ════════════════════════════════════════════════════════════════
// PROCUREMENT ROUTER
// ════════════════════════════════════════════════════════════════
export const procurementRouter = Router();

const requisitionSchema = z.object({
  department: z.string().optional(),
  urgency: z.enum(["routine", "emergency"]).default("routine"),
  required_date: z.string().datetime().optional(),
  items: z
    .array(
      z.object({
        item_name: z.string(),
        reagent_id: z.string().uuid().nullable().optional(), // Link to stock item
        asset_id: z.string().uuid().nullable().optional(), // Link to asset
        quantity: z.number(),
        unit: z.string(),
        supplier_id: z.string().uuid().nullable().optional(), // Preferred supplier
        estimated_price: z.number().nullable().optional(), // Last known price
        catalog_number: z.string().optional(), // For easy reordering
        urgency: z.string().optional(),
        notes: z.string().optional(),
        source: z.string().optional(), // "inventory" or "custom"
      }),
    )
    .min(1),
});

function generateRequisitionNumber(): string {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `REQ-${year}${month}-${rand}`;
}

function generatePONumber(): string {
  const date = new Date();
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `PO-${date.getFullYear()}-${rand}`;
}

procurementRouter.get(
  "/requisitions",
  authenticate,
  requireRole(...STAFF_ROLES),
  async (req: Request, res: Response) => {
    const { status } = req.query as Record<string, string>;
    const conditions = [eq(requisitions.tenant_id, req.tenantId!)];
    if (status) conditions.push(eq(requisitions.status, status as any));

    const list = await db
      .select({
        id: requisitions.id,
        requisition_number: requisitions.requisition_number,
        department: requisitions.department,
        urgency: requisitions.urgency,
        status: requisitions.status,
        required_date: requisitions.required_date,
        items: requisitions.items,
        items_metadata: requisitions.items_metadata,
        created_at: requisitions.created_at,
        prepared_by: { full_name: users.full_name },
      })
      .from(requisitions)
      .leftJoin(users, eq(requisitions.prepared_by, users.id))
      .where(and(...conditions))
      .orderBy(desc(requisitions.created_at));
    res.json({ data: list });
  },
);

// Get single requisition
procurementRouter.get(
  "/requisitions/:id",
  authenticate,
  requireRole(...STAFF_ROLES),
  async (req: Request, res: Response) => {
    const [requisition] = await db
      .select({
        id: requisitions.id,
        requisition_number: requisitions.requisition_number,
        department: requisitions.department,
        urgency: requisitions.urgency,
        status: requisitions.status,
        required_date: requisitions.required_date,
        items: requisitions.items,
        items_metadata: requisitions.items_metadata,
        rejection_reason: requisitions.rejection_reason,
        created_at: requisitions.created_at,
        prepared_by: { full_name: users.full_name, id: users.id },
      })
      .from(requisitions)
      .leftJoin(users, eq(requisitions.prepared_by, users.id))
      .where(
        and(
          eq(requisitions.id, req.params.id),
          eq(requisitions.tenant_id, req.tenantId!),
        ),
      )
      .limit(1);

    if (!requisition) {
      return res.status(404).json({ error: "Requisition not found" });
    }

    res.json({ data: requisition });
  },
);

procurementRouter.post(
  "/requisitions",
  authenticate,
  requireRole(...STAFF_ROLES),
  async (req: Request, res: Response) => {
    const body = requisitionSchema.parse(req.body);
    const [req_] = await db
      .insert(requisitions)
      .values({
        tenant_id: req.tenantId!,
        requisition_number: generateRequisitionNumber(),
        prepared_by: req.user!.id,
        department: body.department,
        urgency: body.urgency,
        required_date: body.required_date ? new Date(body.required_date) : null,
        items: body.items as any,
        items_metadata: body.items as any, // Store enhanced metadata
      })
      .returning();
    await createAuditLog({
      tenant_id: req.tenantId!,
      user_id: req.user!.id,
      action: "CREATE",
      table_name: "requisitions",
      record_id: req_.id,
    });
    res.status(201).json({ data: req_ });
  },
);

procurementRouter.patch(
  "/requisitions/:id",
  authenticate,
  requireRole(...STAFF_ROLES),
  async (req: Request, res: Response) => {
    const body = requisitionSchema.partial().parse(req.body);
    const [updated] = await db
      .update(requisitions)
      .set({
        department: body.department,
        urgency: body.urgency,
        required_date: body.required_date
          ? new Date(body.required_date)
          : undefined,
        items: body.items as any,
        items_metadata: body.items as any,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(requisitions.id, req.params.id),
          eq(requisitions.tenant_id, req.tenantId!),
        ),
      )
      .returning();
    if (!updated) throw new AppError(404, "Requisition not found");
    await createAuditLog({
      tenant_id: req.tenantId!,
      user_id: req.user!.id,
      action: "UPDATE",
      table_name: "requisitions",
      record_id: updated.id,
    });
    res.json({ data: updated });
  },
);

procurementRouter.patch(
  "/requisitions/:id/submit",
  authenticate,
  requireRole(...STAFF_ROLES),
  async (req: Request, res: Response) => {
    const [updated] = await db
      .update(requisitions)
      .set({
        status: "pending_approval" as any,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(requisitions.id, req.params.id),
          eq(requisitions.tenant_id, req.tenantId!),
          eq(requisitions.status, "draft" as any),
        ),
      )
      .returning();
    if (!updated)
      throw new AppError(404, "Requisition not found or already submitted");
    await createAuditLog({
      tenant_id: req.tenantId!,
      user_id: req.user!.id,
      action: "SUBMIT",
      table_name: "requisitions",
      record_id: updated.id,
    });
    res.json({ data: updated });
  },
);

procurementRouter.patch(
  "/requisitions/:id/approve",
  authenticate,
  requireRole("super_admin", "md", "finance", "procurement_officer"),
  async (req: Request, res: Response) => {
    const { action, rejection_reason } = z
      .object({
        action: z.enum(["approve", "reject"]),
        rejection_reason: z.string().optional(),
      })
      .parse(req.body);

    const newStatus = action === "approve" ? "approved" : "rejected";

    // Get the requisition first to access items
    const [requisition] = await db
      .select()
      .from(requisitions)
      .where(
        and(
          eq(requisitions.id, req.params.id),
          eq(requisitions.tenant_id, req.tenantId!),
        ),
      );
    if (!requisition) throw new AppError(404, "Requisition not found");

    console.log("=== APPROVAL DEBUG ===");
    console.log("Requisition ID:", requisition.id);
    console.log("Requisition Number:", requisition.requisition_number);
    console.log("items_metadata:", requisition.items_metadata);
    console.log("items:", requisition.items);
    console.log("Action:", action);
    console.log("=====================");

    const [updated] = await db
      .update(requisitions)
      .set({
        status: newStatus as any,
        approved_by: req.user!.id,
        rejection_reason,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(requisitions.id, req.params.id),
          eq(requisitions.tenant_id, req.tenantId!),
        ),
      )
      .returning();

    // Auto-generate PO if approved
    let po = null;
    if (action === "approve") {
      // Create stock items for custom products (not linked to existing inventory)
      const items = (requisition.items_metadata ||
        requisition.items ||
        []) as any[];

      console.log("Processing items for approval:", items);

      for (const item of items) {
        console.log(
          "Checking item:",
          item.item_name,
          "reagent_id:",
          item.reagent_id,
          "asset_id:",
          item.asset_id,
        );

        if (!item.reagent_id && !item.asset_id && item.item_name) {
          // This is a custom item, add it to stock with quantity 0 (pending receipt)
          console.log("Creating stock item for:", item.item_name);

          const [newStock] = await db
            .insert(reagents)
            .values({
              tenant_id: req.tenantId!,
              name: item.item_name,
              product_type: "consumable", // Default type for custom items
              catalog_number: item.catalog_number || null,
              unit: item.unit || "units",
              quantity: 0, // Will be updated when PO is received
              unit_price: item.estimated_price || 0,
              supplier_id: item.supplier_id || null,
              reorder_level: item.quantity || 10, // Use requested quantity as reorder level
            })
            .returning();

          console.log("Created stock item:", newStock);
        }
      }

      [po] = await db
        .insert(purchase_orders)
        .values({
          tenant_id: req.tenantId!,
          po_number: generatePONumber(),
          requisition_id: updated.id,
          ordered_by: req.user!.id,
        })
        .returning();
    }

    await createAuditLog({
      tenant_id: req.tenantId!,
      user_id: req.user!.id,
      action: action === "approve" ? "APPROVE" : "REJECT",
      table_name: "requisitions",
      record_id: updated.id,
      metadata: { action, po_id: po?.id },
    });
    res.json({ data: updated, purchase_order: po });
  },
);

procurementRouter.get(
  "/purchase-orders",
  authenticate,
  requireRole(...STAFF_ROLES),
  async (req: Request, res: Response) => {
    const list = await db
      .select()
      .from(purchase_orders)
      .where(eq(purchase_orders.tenant_id, req.tenantId!))
      .orderBy(desc(purchase_orders.created_at));
    res.json({ data: list });
  },
);

// Get single purchase order
procurementRouter.get(
  "/purchase-orders/:id",
  authenticate,
  requireRole(...STAFF_ROLES),
  async (req: Request, res: Response) => {
    const [po] = await db
      .select()
      .from(purchase_orders)
      .where(
        and(
          eq(purchase_orders.id, req.params.id),
          eq(purchase_orders.tenant_id, req.tenantId!),
        ),
      )
      .limit(1);

    if (!po) {
      return res.status(404).json({ error: "Purchase order not found" });
    }

    res.json({ data: po });
  },
);

procurementRouter.patch(
  "/purchase-orders/:id",
  authenticate,
  requireRole("super_admin", "md", "procurement_officer", "finance"),
  async (req: Request, res: Response) => {
    const body = z
      .object({
        supplier_name: z.string().optional(),
        supplier_contact: z.string().optional(),
        total_amount: z.number().optional(),
        status: z
          .enum(["pending", "received", "partial", "cancelled"])
          .optional(),
        invoice_url: z.string().optional(),
        notes: z.string().optional(),
      })
      .parse(req.body);

    // Get current PO to check status change
    const [currentPO] = await db
      .select()
      .from(purchase_orders)
      .where(
        and(
          eq(purchase_orders.id, req.params.id),
          eq(purchase_orders.tenant_id, req.tenantId!),
        ),
      );
    if (!currentPO) throw new AppError(404, "Purchase order not found");

    const [updated] = await db
      .update(purchase_orders)
      .set(body as any)
      .where(
        and(
          eq(purchase_orders.id, req.params.id),
          eq(purchase_orders.tenant_id, req.tenantId!),
        ),
      )
      .returning();

    // If status changed to "received", update stock quantities
    if (
      body.status === "received" &&
      currentPO.status !== "received" &&
      currentPO.requisition_id
    ) {
      // Get the linked requisition
      const [requisition] = await db
        .select()
        .from(requisitions)
        .where(
          and(
            eq(requisitions.id, currentPO.requisition_id),
            eq(requisitions.tenant_id, req.tenantId!),
          ),
        );

      if (requisition) {
        const items = (requisition.items_metadata ||
          requisition.items ||
          []) as any[];
        for (const item of items) {
          if (item.reagent_id) {
            // Update existing stock item
            await db
              .update(reagents)
              .set({
                quantity: sql`${reagents.quantity} + ${item.quantity || 0}`,
                updated_at: new Date(),
              })
              .where(
                and(
                  eq(reagents.id, item.reagent_id),
                  eq(reagents.tenant_id, req.tenantId!),
                ),
              );
          } else if (!item.asset_id && item.item_name) {
            // Find the custom item we created during approval and update its quantity
            const [stockItem] = await db
              .select()
              .from(reagents)
              .where(
                and(
                  eq(reagents.name, item.item_name),
                  eq(reagents.tenant_id, req.tenantId!),
                  eq(reagents.quantity, 0), // Find the one with 0 quantity
                ),
              )
              .limit(1);

            if (stockItem) {
              await db
                .update(reagents)
                .set({
                  quantity: item.quantity || 0,
                  updated_at: new Date(),
                })
                .where(eq(reagents.id, stockItem.id));
            }
          }
        }
      }
    }
    if (!updated) throw new AppError(404, "Purchase order not found");
    res.json({ data: updated });
  },
);

procurementRouter.delete(
  "/requisitions/:id",
  authenticate,
  requireRole("super_admin"),
  async (req: Request, res: Response) => {
    const [deleted] = await db
      .delete(requisitions)
      .where(
        and(
          eq(requisitions.id, req.params.id),
          eq(requisitions.tenant_id, req.tenantId!),
        ),
      )
      .returning();
    if (!deleted) throw new AppError(404, "Requisition not found");

    await createAuditLog({
      tenant_id: req.tenantId!,
      user_id: req.user!.id,
      action: "DELETE",
      table_name: "requisitions",
      record_id: deleted.id,
      metadata: { requisition_number: deleted.requisition_number },
    });

    res.json({ data: deleted, message: "Requisition deleted successfully" });
  },
);

procurementRouter.delete(
  "/purchase-orders/:id",
  authenticate,
  requireRole("super_admin"),
  async (req: Request, res: Response) => {
    const [deleted] = await db
      .delete(purchase_orders)
      .where(
        and(
          eq(purchase_orders.id, req.params.id),
          eq(purchase_orders.tenant_id, req.tenantId!),
        ),
      )
      .returning();
    if (!deleted) throw new AppError(404, "Purchase order not found");

    await createAuditLog({
      tenant_id: req.tenantId!,
      user_id: req.user!.id,
      action: "DELETE",
      table_name: "purchase_orders",
      record_id: deleted.id,
      metadata: { po_number: deleted.po_number },
    });

    res.json({ data: deleted, message: "Purchase order deleted successfully" });
  },
);
