"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.procurementRouter = exports.assetsRouter = exports.inventoryRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const auth_1 = require("../middleware/auth");
const audit_1 = require("../middleware/audit");
const errorHandler_1 = require("../middleware/errorHandler");
// ════════════════════════════════════════════════════════════════
// INVENTORY / REAGENTS ROUTER
// ════════════════════════════════════════════════════════════════
exports.inventoryRouter = (0, express_1.Router)();
const reagentSchema = zod_1.z.object({
    product_type: zod_1.z
        .enum(["reagent", "consumable", "standard", "supply", "kit"])
        .default("reagent"),
    name: zod_1.z.string().min(1).max(255),
    chemical_name: zod_1.z.string().optional(),
    cas_number: zod_1.z.string().optional(),
    catalog_number: zod_1.z.string().optional(),
    lot_number: zod_1.z.string().optional(),
    manufacturer: zod_1.z.string().optional(),
    supplier_id: zod_1.z.string().uuid().optional(),
    grade: zod_1.z.enum(["AR", "HPLC", "GR", "LR", "Technical"]).optional(),
    category: zod_1.z.string().optional(),
    batch_number: zod_1.z.string().optional(),
    quantity: zod_1.z.number().min(0).default(0),
    unit: zod_1.z.string().default("units"),
    reorder_level: zod_1.z.number().default(10),
    unit_price: zod_1.z.number().min(0).default(0).optional(),
    expiry_date: zod_1.z
        .string()
        .optional()
        .transform((val) => (val ? new Date(val) : undefined)),
    storage_conditions: zod_1.z.string().optional(),
    storage_location: zod_1.z.string().optional(),
});
exports.inventoryRouter.get("/reagents", auth_1.authenticate, async (req, res) => {
    const { page = "1", limit = "50", low_stock, expiring_soon, } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.reagents.tenant_id, req.tenantId)];
    if (low_stock === "true") {
        conditions.push((0, drizzle_orm_1.sql) `${schema_1.reagents.quantity} <= ${schema_1.reagents.reorder_level}`);
    }
    if (expiring_soon === "true") {
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        conditions.push((0, drizzle_orm_1.lte)(schema_1.reagents.expiry_date, thirtyDaysFromNow));
    }
    const list = await db_1.db
        .select()
        .from(schema_1.reagents)
        .where((0, drizzle_orm_1.and)(...conditions))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.reagents.updated_at))
        .limit(parseInt(limit))
        .offset(offset);
    res.json({ data: list });
});
exports.inventoryRouter.post("/reagents", auth_1.authenticate, (0, auth_1.requireRole)(...auth_1.INVENTORY_ROLES), async (req, res) => {
    const body = reagentSchema.parse(req.body);
    const [newReagent] = await db_1.db
        .insert(schema_1.reagents)
        .values({
        tenant_id: req.tenantId,
        ...body,
        expiry_date: body.expiry_date ? new Date(body.expiry_date) : null,
        created_by: req.user.id,
    })
        .returning();
    await (0, audit_1.createAuditLog)({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        action: "CREATE",
        table_name: "reagents",
        record_id: newReagent.id,
    });
    res.status(201).json({ data: newReagent });
});
exports.inventoryRouter.patch("/reagents/:id", auth_1.authenticate, (0, auth_1.requireRole)(...auth_1.INVENTORY_ROLES), async (req, res) => {
    const body = reagentSchema.partial().parse(req.body);
    const [updated] = await db_1.db
        .update(schema_1.reagents)
        .set({ ...body, updated_at: new Date() })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.reagents.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.reagents.tenant_id, req.tenantId)))
        .returning();
    if (!updated)
        throw new errorHandler_1.AppError(404, "Reagent not found");
    await (0, audit_1.createAuditLog)({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        action: "UPDATE",
        table_name: "reagents",
        record_id: updated.id,
    });
    res.json({ data: updated });
});
exports.inventoryRouter.patch("/reagents/:id/stock", auth_1.authenticate, (0, auth_1.requireRole)(...auth_1.INVENTORY_ROLES), async (req, res) => {
    const { adjustment, type } = zod_1.z
        .object({
        adjustment: zod_1.z.number(),
        type: zod_1.z.enum(["add", "subtract", "set"]),
    })
        .parse(req.body);
    const [existing] = await db_1.db
        .select()
        .from(schema_1.reagents)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.reagents.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.reagents.tenant_id, req.tenantId)))
        .limit(1);
    if (!existing)
        throw new errorHandler_1.AppError(404, "Reagent not found");
    let newQuantity;
    if (type === "set")
        newQuantity = adjustment;
    else if (type === "add")
        newQuantity = (existing.quantity || 0) + adjustment;
    else
        newQuantity = Math.max(0, (existing.quantity || 0) - adjustment);
    const [updated] = await db_1.db
        .update(schema_1.reagents)
        .set({ quantity: newQuantity, updated_at: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.reagents.id, req.params.id))
        .returning();
    await (0, audit_1.createAuditLog)({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        action: "UPDATE",
        table_name: "reagents",
        record_id: updated.id,
        metadata: { action: "STOCK_ADJUSTMENT", type, adjustment, newQuantity },
    });
    res.json({ data: updated });
});
exports.inventoryRouter.get("/reagents/alerts", auth_1.authenticate, async (req, res) => {
    const now = new Date();
    const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const [lowStock, expiringSoon, expired] = await Promise.all([
        db_1.db
            .select()
            .from(schema_1.reagents)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.reagents.tenant_id, req.tenantId), (0, drizzle_orm_1.sql) `${schema_1.reagents.quantity} <= ${schema_1.reagents.reorder_level}`, (0, drizzle_orm_1.eq)(schema_1.reagents.is_active, true))),
        db_1.db
            .select()
            .from(schema_1.reagents)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.reagents.tenant_id, req.tenantId), (0, drizzle_orm_1.lte)(schema_1.reagents.expiry_date, thirtyDays), (0, drizzle_orm_1.sql) `${schema_1.reagents.expiry_date} > ${now}`)),
        db_1.db
            .select()
            .from(schema_1.reagents)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.reagents.tenant_id, req.tenantId), (0, drizzle_orm_1.lt)(schema_1.reagents.expiry_date, now))),
    ]);
    res.json({ data: { lowStock, expiringSoon, expired } });
});
// ════════════════════════════════════════════════════════════════
// ASSETS ROUTER
// ════════════════════════════════════════════════════════════════
exports.assetsRouter = (0, express_1.Router)();
const assetSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    asset_tag: zod_1.z.string().optional(),
    model: zod_1.z.string().optional(),
    serial_number: zod_1.z.string().optional(),
    manufacturer: zod_1.z.string().optional(),
    purchase_date: zod_1.z
        .string()
        .optional()
        .transform((val) => (val ? new Date(val) : undefined)),
    warranty_expiry: zod_1.z
        .string()
        .optional()
        .transform((val) => (val ? new Date(val) : undefined)),
    status: zod_1.z
        .enum(["operational", "under_repair", "calibration_due", "decommissioned"])
        .optional(),
    custodian_id: zod_1.z.string().uuid().optional(),
    location: zod_1.z.string().optional(),
    calibration_frequency_days: zod_1.z.number().optional(),
    notes: zod_1.z.string().optional(),
});
exports.assetsRouter.get("/", auth_1.authenticate, async (req, res) => {
    const list = await db_1.db
        .select({
        id: schema_1.assets.id,
        name: schema_1.assets.name,
        asset_tag: schema_1.assets.asset_tag,
        model: schema_1.assets.model,
        serial_number: schema_1.assets.serial_number,
        status: schema_1.assets.status,
        location: schema_1.assets.location,
        next_calibration_date: schema_1.assets.next_calibration_date,
        last_calibration_date: schema_1.assets.last_calibration_date,
        custodian: { id: schema_1.users.id, full_name: schema_1.users.full_name },
    })
        .from(schema_1.assets)
        .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.assets.custodian_id, schema_1.users.id))
        .where((0, drizzle_orm_1.eq)(schema_1.assets.tenant_id, req.tenantId))
        .orderBy(schema_1.assets.name);
    res.json({ data: list });
});
exports.assetsRouter.get("/due-calibration", auth_1.authenticate, async (req, res) => {
    const thirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const list = await db_1.db
        .select()
        .from(schema_1.assets)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.assets.tenant_id, req.tenantId), (0, drizzle_orm_1.lte)(schema_1.assets.next_calibration_date, thirtyDays)));
    res.json({ data: list, count: list.length });
});
exports.assetsRouter.post("/", auth_1.authenticate, (0, auth_1.requireRole)("super_admin", "md", "inventory_manager"), async (req, res) => {
    const body = assetSchema.parse(req.body);
    const [newAsset] = await db_1.db
        .insert(schema_1.assets)
        .values({
        tenant_id: req.tenantId,
        ...body,
        purchase_date: body.purchase_date ? new Date(body.purchase_date) : null,
        warranty_expiry: body.warranty_expiry
            ? new Date(body.warranty_expiry)
            : null,
    })
        .returning();
    await (0, audit_1.createAuditLog)({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        action: "CREATE",
        table_name: "assets",
        record_id: newAsset.id,
    });
    res.status(201).json({ data: newAsset });
});
exports.assetsRouter.patch("/:id", auth_1.authenticate, (0, auth_1.requireRole)("super_admin", "md", "inventory_manager"), async (req, res) => {
    const body = assetSchema.partial().parse(req.body);
    const [updated] = await db_1.db
        .update(schema_1.assets)
        .set({ ...body, updated_at: new Date() })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.assets.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.assets.tenant_id, req.tenantId)))
        .returning();
    if (!updated)
        throw new errorHandler_1.AppError(404, "Asset not found");
    res.json({ data: updated });
});
exports.assetsRouter.post("/:id/log", auth_1.authenticate, (0, auth_1.requireRole)("super_admin", "md", "inventory_manager", "quality_manager"), async (req, res) => {
    const { action, description, next_due_date, attachment_url } = zod_1.z
        .object({
        action: zod_1.z.string().min(1),
        description: zod_1.z.string().optional(),
        next_due_date: zod_1.z.string().datetime().optional(),
        attachment_url: zod_1.z.string().url().optional(),
    })
        .parse(req.body);
    const [log] = await db_1.db
        .insert(schema_1.asset_logs)
        .values({
        asset_id: req.params.id,
        action,
        description,
        performed_by: req.user.id,
        next_due_date: next_due_date ? new Date(next_due_date) : null,
        attachment_url,
    })
        .returning();
    // Update asset calibration dates if applicable
    if (action === "calibrated" && next_due_date) {
        await db_1.db
            .update(schema_1.assets)
            .set({
            last_calibration_date: new Date(),
            next_calibration_date: new Date(next_due_date),
            status: "operational",
            updated_at: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(schema_1.assets.id, req.params.id));
    }
    res.status(201).json({ data: log });
});
exports.assetsRouter.get("/:id/logs", auth_1.authenticate, async (req, res) => {
    const logs = await db_1.db
        .select({
        id: schema_1.asset_logs.id,
        action: schema_1.asset_logs.action,
        description: schema_1.asset_logs.description,
        performed_at: schema_1.asset_logs.performed_at,
        next_due_date: schema_1.asset_logs.next_due_date,
        performer: { full_name: schema_1.users.full_name },
    })
        .from(schema_1.asset_logs)
        .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.asset_logs.performed_by, schema_1.users.id))
        .where((0, drizzle_orm_1.eq)(schema_1.asset_logs.asset_id, req.params.id))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.asset_logs.performed_at));
    res.json({ data: logs });
});
// ════════════════════════════════════════════════════════════════
// PROCUREMENT ROUTER
// ════════════════════════════════════════════════════════════════
exports.procurementRouter = (0, express_1.Router)();
const requisitionSchema = zod_1.z.object({
    department: zod_1.z.string().optional(),
    urgency: zod_1.z.enum(["routine", "emergency"]).default("routine"),
    required_date: zod_1.z.string().datetime().optional(),
    items: zod_1.z
        .array(zod_1.z.object({
        item_name: zod_1.z.string(),
        reagent_id: zod_1.z.string().uuid().nullable().optional(), // Link to stock item
        asset_id: zod_1.z.string().uuid().nullable().optional(), // Link to asset
        quantity: zod_1.z.number(),
        unit: zod_1.z.string(),
        supplier_id: zod_1.z.string().uuid().nullable().optional(), // Preferred supplier
        estimated_price: zod_1.z.number().nullable().optional(), // Last known price
        catalog_number: zod_1.z.string().optional(), // For easy reordering
        urgency: zod_1.z.string().optional(),
        notes: zod_1.z.string().optional(),
        source: zod_1.z.string().optional(), // "inventory" or "custom"
    }))
        .min(1),
});
function generateRequisitionNumber() {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const rand = Math.floor(Math.random() * 9000 + 1000);
    return `REQ-${year}${month}-${rand}`;
}
function generatePONumber() {
    const date = new Date();
    const rand = Math.floor(Math.random() * 9000 + 1000);
    return `PO-${date.getFullYear()}-${rand}`;
}
exports.procurementRouter.get("/requisitions", auth_1.authenticate, (0, auth_1.requireRole)(...auth_1.STAFF_ROLES), async (req, res) => {
    const { status } = req.query;
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.requisitions.tenant_id, req.tenantId)];
    if (status)
        conditions.push((0, drizzle_orm_1.eq)(schema_1.requisitions.status, status));
    const list = await db_1.db
        .select({
        id: schema_1.requisitions.id,
        requisition_number: schema_1.requisitions.requisition_number,
        department: schema_1.requisitions.department,
        urgency: schema_1.requisitions.urgency,
        status: schema_1.requisitions.status,
        required_date: schema_1.requisitions.required_date,
        items: schema_1.requisitions.items,
        items_metadata: schema_1.requisitions.items_metadata,
        created_at: schema_1.requisitions.created_at,
        prepared_by: { full_name: schema_1.users.full_name },
    })
        .from(schema_1.requisitions)
        .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.requisitions.prepared_by, schema_1.users.id))
        .where((0, drizzle_orm_1.and)(...conditions))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.requisitions.created_at));
    res.json({ data: list });
});
// Get single requisition
exports.procurementRouter.get("/requisitions/:id", auth_1.authenticate, (0, auth_1.requireRole)(...auth_1.STAFF_ROLES), async (req, res) => {
    const [requisition] = await db_1.db
        .select({
        id: schema_1.requisitions.id,
        requisition_number: schema_1.requisitions.requisition_number,
        department: schema_1.requisitions.department,
        urgency: schema_1.requisitions.urgency,
        status: schema_1.requisitions.status,
        required_date: schema_1.requisitions.required_date,
        items: schema_1.requisitions.items,
        items_metadata: schema_1.requisitions.items_metadata,
        rejection_reason: schema_1.requisitions.rejection_reason,
        created_at: schema_1.requisitions.created_at,
        prepared_by: { full_name: schema_1.users.full_name, id: schema_1.users.id },
    })
        .from(schema_1.requisitions)
        .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.requisitions.prepared_by, schema_1.users.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.requisitions.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.requisitions.tenant_id, req.tenantId)))
        .limit(1);
    if (!requisition) {
        return res.status(404).json({ error: "Requisition not found" });
    }
    res.json({ data: requisition });
});
exports.procurementRouter.post("/requisitions", auth_1.authenticate, (0, auth_1.requireRole)(...auth_1.STAFF_ROLES), async (req, res) => {
    const body = requisitionSchema.parse(req.body);
    const [req_] = await db_1.db
        .insert(schema_1.requisitions)
        .values({
        tenant_id: req.tenantId,
        requisition_number: generateRequisitionNumber(),
        prepared_by: req.user.id,
        department: body.department,
        urgency: body.urgency,
        required_date: body.required_date ? new Date(body.required_date) : null,
        items: body.items,
        items_metadata: body.items, // Store enhanced metadata
    })
        .returning();
    await (0, audit_1.createAuditLog)({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        action: "CREATE",
        table_name: "requisitions",
        record_id: req_.id,
    });
    res.status(201).json({ data: req_ });
});
exports.procurementRouter.patch("/requisitions/:id", auth_1.authenticate, (0, auth_1.requireRole)(...auth_1.STAFF_ROLES), async (req, res) => {
    const body = requisitionSchema.partial().parse(req.body);
    const [updated] = await db_1.db
        .update(schema_1.requisitions)
        .set({
        department: body.department,
        urgency: body.urgency,
        required_date: body.required_date
            ? new Date(body.required_date)
            : undefined,
        items: body.items,
        items_metadata: body.items,
        updated_at: new Date(),
    })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.requisitions.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.requisitions.tenant_id, req.tenantId)))
        .returning();
    if (!updated)
        throw new errorHandler_1.AppError(404, "Requisition not found");
    await (0, audit_1.createAuditLog)({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        action: "UPDATE",
        table_name: "requisitions",
        record_id: updated.id,
    });
    res.json({ data: updated });
});
exports.procurementRouter.patch("/requisitions/:id/submit", auth_1.authenticate, (0, auth_1.requireRole)(...auth_1.STAFF_ROLES), async (req, res) => {
    const [updated] = await db_1.db
        .update(schema_1.requisitions)
        .set({
        status: "pending_approval",
        updated_at: new Date(),
    })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.requisitions.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.requisitions.tenant_id, req.tenantId), (0, drizzle_orm_1.eq)(schema_1.requisitions.status, "draft")))
        .returning();
    if (!updated)
        throw new errorHandler_1.AppError(404, "Requisition not found or already submitted");
    await (0, audit_1.createAuditLog)({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        action: "SUBMIT",
        table_name: "requisitions",
        record_id: updated.id,
    });
    res.json({ data: updated });
});
exports.procurementRouter.patch("/requisitions/:id/approve", auth_1.authenticate, (0, auth_1.requireRole)("super_admin", "md", "finance", "procurement_officer"), async (req, res) => {
    const { action, rejection_reason } = zod_1.z
        .object({
        action: zod_1.z.enum(["approve", "reject"]),
        rejection_reason: zod_1.z.string().optional(),
    })
        .parse(req.body);
    const newStatus = action === "approve" ? "approved" : "rejected";
    // Get the requisition first to access items
    const [requisition] = await db_1.db
        .select()
        .from(schema_1.requisitions)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.requisitions.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.requisitions.tenant_id, req.tenantId)));
    if (!requisition)
        throw new errorHandler_1.AppError(404, "Requisition not found");
    console.log("=== APPROVAL DEBUG ===");
    console.log("Requisition ID:", requisition.id);
    console.log("Requisition Number:", requisition.requisition_number);
    console.log("items_metadata:", requisition.items_metadata);
    console.log("items:", requisition.items);
    console.log("Action:", action);
    console.log("=====================");
    const [updated] = await db_1.db
        .update(schema_1.requisitions)
        .set({
        status: newStatus,
        approved_by: req.user.id,
        rejection_reason,
        updated_at: new Date(),
    })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.requisitions.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.requisitions.tenant_id, req.tenantId)))
        .returning();
    // Auto-generate PO if approved
    let po = null;
    if (action === "approve") {
        // Create stock items for custom products (not linked to existing inventory)
        const items = (requisition.items_metadata ||
            requisition.items ||
            []);
        console.log("Processing items for approval:", items);
        for (const item of items) {
            console.log("Checking item:", item.item_name, "reagent_id:", item.reagent_id, "asset_id:", item.asset_id);
            if (!item.reagent_id && !item.asset_id && item.item_name) {
                // This is a custom item, add it to stock with quantity 0 (pending receipt)
                console.log("Creating stock item for:", item.item_name);
                const [newStock] = await db_1.db
                    .insert(schema_1.reagents)
                    .values({
                    tenant_id: req.tenantId,
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
        [po] = await db_1.db
            .insert(schema_1.purchase_orders)
            .values({
            tenant_id: req.tenantId,
            po_number: generatePONumber(),
            requisition_id: updated.id,
            ordered_by: req.user.id,
        })
            .returning();
    }
    await (0, audit_1.createAuditLog)({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        action: action === "approve" ? "APPROVE" : "REJECT",
        table_name: "requisitions",
        record_id: updated.id,
        metadata: { action, po_id: po?.id },
    });
    res.json({ data: updated, purchase_order: po });
});
exports.procurementRouter.get("/purchase-orders", auth_1.authenticate, (0, auth_1.requireRole)(...auth_1.STAFF_ROLES), async (req, res) => {
    const list = await db_1.db
        .select()
        .from(schema_1.purchase_orders)
        .where((0, drizzle_orm_1.eq)(schema_1.purchase_orders.tenant_id, req.tenantId))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.purchase_orders.created_at));
    res.json({ data: list });
});
// Get single purchase order
exports.procurementRouter.get("/purchase-orders/:id", auth_1.authenticate, (0, auth_1.requireRole)(...auth_1.STAFF_ROLES), async (req, res) => {
    const [po] = await db_1.db
        .select()
        .from(schema_1.purchase_orders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.purchase_orders.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.purchase_orders.tenant_id, req.tenantId)))
        .limit(1);
    if (!po) {
        return res.status(404).json({ error: "Purchase order not found" });
    }
    res.json({ data: po });
});
exports.procurementRouter.patch("/purchase-orders/:id", auth_1.authenticate, (0, auth_1.requireRole)("super_admin", "md", "procurement_officer", "finance"), async (req, res) => {
    const body = zod_1.z
        .object({
        supplier_name: zod_1.z.string().optional(),
        supplier_contact: zod_1.z.string().optional(),
        total_amount: zod_1.z.number().optional(),
        status: zod_1.z
            .enum(["pending", "received", "partial", "cancelled"])
            .optional(),
        invoice_url: zod_1.z.string().optional(),
        notes: zod_1.z.string().optional(),
    })
        .parse(req.body);
    // Get current PO to check status change
    const [currentPO] = await db_1.db
        .select()
        .from(schema_1.purchase_orders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.purchase_orders.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.purchase_orders.tenant_id, req.tenantId)));
    if (!currentPO)
        throw new errorHandler_1.AppError(404, "Purchase order not found");
    const [updated] = await db_1.db
        .update(schema_1.purchase_orders)
        .set(body)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.purchase_orders.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.purchase_orders.tenant_id, req.tenantId)))
        .returning();
    // If status changed to "received", update stock quantities
    if (body.status === "received" &&
        currentPO.status !== "received" &&
        currentPO.requisition_id) {
        // Get the linked requisition
        const [requisition] = await db_1.db
            .select()
            .from(schema_1.requisitions)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.requisitions.id, currentPO.requisition_id), (0, drizzle_orm_1.eq)(schema_1.requisitions.tenant_id, req.tenantId)));
        if (requisition) {
            const items = (requisition.items_metadata ||
                requisition.items ||
                []);
            for (const item of items) {
                if (item.reagent_id) {
                    // Update existing stock item
                    await db_1.db
                        .update(schema_1.reagents)
                        .set({
                        quantity: (0, drizzle_orm_1.sql) `${schema_1.reagents.quantity} + ${item.quantity || 0}`,
                        updated_at: new Date(),
                    })
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.reagents.id, item.reagent_id), (0, drizzle_orm_1.eq)(schema_1.reagents.tenant_id, req.tenantId)));
                }
                else if (!item.asset_id && item.item_name) {
                    // Find the custom item we created during approval and update its quantity
                    const [stockItem] = await db_1.db
                        .select()
                        .from(schema_1.reagents)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.reagents.name, item.item_name), (0, drizzle_orm_1.eq)(schema_1.reagents.tenant_id, req.tenantId), (0, drizzle_orm_1.eq)(schema_1.reagents.quantity, 0)))
                        .limit(1);
                    if (stockItem) {
                        await db_1.db
                            .update(schema_1.reagents)
                            .set({
                            quantity: item.quantity || 0,
                            updated_at: new Date(),
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.reagents.id, stockItem.id));
                    }
                }
            }
        }
    }
    if (!updated)
        throw new errorHandler_1.AppError(404, "Purchase order not found");
    res.json({ data: updated });
});
exports.procurementRouter.delete("/requisitions/:id", auth_1.authenticate, (0, auth_1.requireRole)("super_admin"), async (req, res) => {
    const [deleted] = await db_1.db
        .delete(schema_1.requisitions)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.requisitions.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.requisitions.tenant_id, req.tenantId)))
        .returning();
    if (!deleted)
        throw new errorHandler_1.AppError(404, "Requisition not found");
    await (0, audit_1.createAuditLog)({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        action: "DELETE",
        table_name: "requisitions",
        record_id: deleted.id,
        metadata: { requisition_number: deleted.requisition_number },
    });
    res.json({ data: deleted, message: "Requisition deleted successfully" });
});
exports.procurementRouter.delete("/purchase-orders/:id", auth_1.authenticate, (0, auth_1.requireRole)("super_admin"), async (req, res) => {
    const [deleted] = await db_1.db
        .delete(schema_1.purchase_orders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.purchase_orders.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.purchase_orders.tenant_id, req.tenantId)))
        .returning();
    if (!deleted)
        throw new errorHandler_1.AppError(404, "Purchase order not found");
    await (0, audit_1.createAuditLog)({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        action: "DELETE",
        table_name: "purchase_orders",
        record_id: deleted.id,
        metadata: { po_number: deleted.po_number },
    });
    res.json({ data: deleted, message: "Purchase order deleted successfully" });
});
//# sourceMappingURL=inventory-assets-procurement.js.map