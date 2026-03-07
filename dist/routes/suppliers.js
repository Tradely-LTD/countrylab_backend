"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const auth_1 = require("../middleware/auth");
const audit_1 = require("../middleware/audit");
const errorHandler_1 = require("../middleware/errorHandler");
const router = (0, express_1.Router)();
// ─── Validation ───────────────────────────────────────────────────────────────
const createSupplierSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, "Supplier name is required"),
    company: zod_1.z.string().optional(),
    email: zod_1.z.string().email().optional().or(zod_1.z.literal("")),
    phone: zod_1.z.string().optional(),
    address: zod_1.z.string().optional(),
    contact_person: zod_1.z.string().optional(),
    website: zod_1.z.string().url().optional().or(zod_1.z.literal("")),
    tax_id: zod_1.z.string().optional(),
    payment_terms: zod_1.z.string().optional(),
    currency: zod_1.z.string().default("NGN"),
    notes: zod_1.z.string().optional(),
});
const updateSupplierSchema = createSupplierSchema.partial();
// ─── GET /suppliers ───────────────────────────────────────────────────────────
router.get("/", auth_1.authenticate, (0, auth_1.requireRole)("super_admin", "md", "procurement_officer", "inventory_manager"), async (req, res) => {
    const { search, page = "1", limit = "50", } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.suppliers.tenant_id, req.tenantId)];
    if (search) {
        conditions.push((0, drizzle_orm_1.sql) `(${schema_1.suppliers.name} ILIKE ${`%${search}%`} OR ${schema_1.suppliers.company} ILIKE ${`%${search}%`})`);
    }
    const [supplierList, [{ count }]] = await Promise.all([
        db_1.db
            .select()
            .from(schema_1.suppliers)
            .where((0, drizzle_orm_1.and)(...conditions))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.suppliers.created_at))
            .limit(parseInt(limit))
            .offset(offset),
        db_1.db
            .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(schema_1.suppliers)
            .where((0, drizzle_orm_1.and)(...conditions)),
    ]);
    res.json({
        data: supplierList,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: count,
        },
    });
});
// ─── GET /suppliers/:id ───────────────────────────────────────────────────────
router.get("/:id", auth_1.authenticate, (0, auth_1.requireRole)("super_admin", "md", "procurement_officer", "inventory_manager"), async (req, res) => {
    const [supplier] = await db_1.db
        .select()
        .from(schema_1.suppliers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.suppliers.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.suppliers.tenant_id, req.tenantId)))
        .limit(1);
    if (!supplier)
        throw new errorHandler_1.AppError(404, "Supplier not found");
    res.json({ data: supplier });
});
// ─── POST /suppliers ──────────────────────────────────────────────────────────
router.post("/", auth_1.authenticate, (0, auth_1.requireRole)("super_admin", "procurement_officer", "inventory_manager"), async (req, res) => {
    const body = createSupplierSchema.parse(req.body);
    const [newSupplier] = await db_1.db
        .insert(schema_1.suppliers)
        .values({
        ...body,
        tenant_id: req.tenantId,
        created_by: req.user.id,
    })
        .returning();
    await (0, audit_1.createAuditLog)({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        action: "CREATE",
        table_name: "suppliers",
        record_id: newSupplier.id,
        new_value: newSupplier,
    });
    res.status(201).json({ data: newSupplier });
});
// ─── PUT /suppliers/:id ───────────────────────────────────────────────────────
router.put("/:id", auth_1.authenticate, (0, auth_1.requireRole)("super_admin", "procurement_officer", "inventory_manager"), async (req, res) => {
    const body = updateSupplierSchema.parse(req.body);
    const [existing] = await db_1.db
        .select()
        .from(schema_1.suppliers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.suppliers.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.suppliers.tenant_id, req.tenantId)))
        .limit(1);
    if (!existing)
        throw new errorHandler_1.AppError(404, "Supplier not found");
    const [updated] = await db_1.db
        .update(schema_1.suppliers)
        .set({ ...body, updated_at: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.suppliers.id, req.params.id))
        .returning();
    await (0, audit_1.createAuditLog)({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        action: "UPDATE",
        table_name: "suppliers",
        record_id: existing.id,
        old_value: existing,
        new_value: updated,
    });
    res.json({ data: updated });
});
// ─── DELETE /suppliers/:id ────────────────────────────────────────────────────
router.delete("/:id", auth_1.authenticate, (0, auth_1.requireRole)("super_admin"), async (req, res) => {
    const [existing] = await db_1.db
        .select()
        .from(schema_1.suppliers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.suppliers.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.suppliers.tenant_id, req.tenantId)))
        .limit(1);
    if (!existing)
        throw new errorHandler_1.AppError(404, "Supplier not found");
    // Soft delete by setting is_active to false
    const [deleted] = await db_1.db
        .update(schema_1.suppliers)
        .set({ is_active: false, updated_at: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.suppliers.id, req.params.id))
        .returning();
    await (0, audit_1.createAuditLog)({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        action: "DELETE",
        table_name: "suppliers",
        record_id: existing.id,
        old_value: existing,
    });
    res.json({ message: "Supplier deactivated successfully" });
});
// Get supplier history (purchase orders, requisitions)
router.get("/:id/history", auth_1.authenticate, (0, auth_1.requireRole)("super_admin", "md", "procurement_officer", "inventory_manager"), async (req, res) => {
    const { id } = req.params;
    // Get purchase orders for this supplier
    const pos = await db_1.db
        .select({
        id: schema_1.purchase_orders.id,
        po_number: schema_1.purchase_orders.po_number,
        total_amount: schema_1.purchase_orders.total_amount,
        status: schema_1.purchase_orders.status,
        created_at: schema_1.purchase_orders.created_at,
    })
        .from(schema_1.purchase_orders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.purchase_orders.supplier_id, id), (0, drizzle_orm_1.eq)(schema_1.purchase_orders.tenant_id, req.tenantId)))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.purchase_orders.created_at))
        .limit(20);
    // Get requisitions (recent ones, not supplier-specific)
    const reqs = await db_1.db
        .select({
        id: schema_1.requisitions.id,
        requisition_number: schema_1.requisitions.requisition_number,
        department: schema_1.requisitions.department,
        status: schema_1.requisitions.status,
        created_at: schema_1.requisitions.created_at,
    })
        .from(schema_1.requisitions)
        .where((0, drizzle_orm_1.eq)(schema_1.requisitions.tenant_id, req.tenantId))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.requisitions.created_at))
        .limit(10);
    res.json({
        success: true,
        data: {
            purchase_orders: pos,
            requisitions: reqs,
        },
    });
});
exports.default = router;
//# sourceMappingURL=suppliers.js.map