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
const barcodeService_1 = require("../services/barcodeService");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
// ─── Validation Schemas ───────────────────────────────────────────────────────
const createSampleSchema = zod_1.z.object({
    client_id: zod_1.z.string().uuid(),
    name: zod_1.z.string().min(1).max(255),
    description: zod_1.z.string().optional(),
    matrix: zod_1.z.string().optional(),
    collection_date: zod_1.z.string().datetime().optional(),
    storage_zone: zod_1.z.string().optional(),
    storage_location: zod_1.z.string().optional(),
    assigned_analyst_id: zod_1.z.string().uuid().optional(),
    notes: zod_1.z.string().optional(),
    // Enhanced CoA fields
    sample_container: zod_1.z.string().optional(),
    sample_volume: zod_1.z.string().optional(),
    reference_standard: zod_1.z.string().optional(),
    batch_number: zod_1.z.string().optional(),
    sample_condition: zod_1.z.string().optional(),
    temperature_on_receipt: zod_1.z.string().optional(),
    sampling_point: zod_1.z.string().optional(),
    production_date: zod_1.z.string().datetime().optional(),
    expiry_date: zod_1.z.string().datetime().optional(),
    manufacturer: zod_1.z.string().optional(),
});
const updateStatusSchema = zod_1.z.object({
    status: zod_1.z.enum([
        "received",
        "in_testing",
        "pending_review",
        "approved",
        "disposed",
        "voided",
    ]),
    reason: zod_1.z.string().optional(),
});
// ─── GET /samples ─────────────────────────────────────────────────────────────
router.get("/", auth_1.authenticate, async (req, res) => {
    try {
        const { page = "1", limit = "25", status, search, client_id, analyst_id, } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        const conditions = [(0, drizzle_orm_1.eq)(schema_1.samples.tenant_id, req.tenantId)];
        if (status)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.samples.status, status));
        if (client_id)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.samples.client_id, client_id));
        if (analyst_id)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.samples.assigned_analyst_id, analyst_id));
        if (search) {
            conditions.push((0, drizzle_orm_1.sql) `(${schema_1.samples.name} ILIKE ${"%" + search + "%"} OR ${schema_1.samples.ulid} ILIKE ${"%" + search + "%"})`);
        }
        const [sampleList, [{ count }]] = await Promise.all([
            db_1.db
                .select({
                id: schema_1.samples.id,
                ulid: schema_1.samples.ulid,
                name: schema_1.samples.name,
                matrix: schema_1.samples.matrix,
                status: schema_1.samples.status,
                storage_location: schema_1.samples.storage_location,
                received_at: schema_1.samples.received_at,
                collection_date: schema_1.samples.collection_date,
                notes: schema_1.samples.notes,
                client: {
                    id: schema_1.clients.id,
                    name: schema_1.clients.name,
                    company: schema_1.clients.company,
                },
                analyst: {
                    id: schema_1.users.id,
                    full_name: schema_1.users.full_name,
                },
            })
                .from(schema_1.samples)
                .leftJoin(schema_1.clients, (0, drizzle_orm_1.eq)(schema_1.samples.client_id, schema_1.clients.id))
                .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.samples.assigned_analyst_id, schema_1.users.id))
                .where((0, drizzle_orm_1.and)(...conditions))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.samples.received_at))
                .limit(parseInt(limit))
                .offset(offset),
            db_1.db
                .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
                .from(schema_1.samples)
                .where((0, drizzle_orm_1.and)(...conditions)),
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
    }
    catch (error) {
        logger_1.logger.error("Error fetching samples:", error);
        throw error;
    }
});
// ─── GET /samples/:id ─────────────────────────────────────────────────────────
router.get("/:id", auth_1.authenticate, async (req, res) => {
    const [sample] = await db_1.db
        .select({
        id: schema_1.samples.id,
        tenant_id: schema_1.samples.tenant_id,
        ulid: schema_1.samples.ulid,
        name: schema_1.samples.name,
        description: schema_1.samples.description,
        matrix: schema_1.samples.matrix,
        collection_date: schema_1.samples.collection_date,
        received_at: schema_1.samples.received_at,
        status: schema_1.samples.status,
        storage_zone: schema_1.samples.storage_zone,
        storage_location: schema_1.samples.storage_location,
        barcode_url: schema_1.samples.barcode_url,
        disposed_at: schema_1.samples.disposed_at,
        voided_at: schema_1.samples.voided_at,
        void_reason: schema_1.samples.void_reason,
        notes: schema_1.samples.notes,
        created_at: schema_1.samples.created_at,
        updated_at: schema_1.samples.updated_at,
        client: {
            id: schema_1.clients.id,
            name: schema_1.clients.name,
            company: schema_1.clients.company,
            email: schema_1.clients.email,
            phone: schema_1.clients.phone,
        },
        analyst: {
            id: schema_1.users.id,
            full_name: schema_1.users.full_name,
            email: schema_1.users.email,
            role: schema_1.users.role,
        },
    })
        .from(schema_1.samples)
        .leftJoin(schema_1.clients, (0, drizzle_orm_1.eq)(schema_1.samples.client_id, schema_1.clients.id))
        .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.samples.assigned_analyst_id, schema_1.users.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.samples.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.samples.tenant_id, req.tenantId)))
        .limit(1);
    if (!sample)
        throw new errorHandler_1.AppError(404, "Sample not found");
    await (0, audit_1.createAuditLog)({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        action: "READ",
        table_name: "samples",
        record_id: sample.id,
    });
    res.json({ data: sample });
});
// ─── POST /samples ────────────────────────────────────────────────────────────
router.post("/", auth_1.authenticate, (0, auth_1.requireRole)(...auth_1.LAB_ROLES, "inventory_manager"), async (req, res) => {
    const body = createSampleSchema.parse(req.body);
    // Verify client belongs to tenant
    const [client] = await db_1.db
        .select()
        .from(schema_1.clients)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.clients.id, body.client_id), (0, drizzle_orm_1.eq)(schema_1.clients.tenant_id, req.tenantId)))
        .limit(1);
    if (!client)
        throw new errorHandler_1.AppError(404, "Client not found");
    const ulid = (0, barcodeService_1.generateULID)();
    const barcodeUrl = await (0, barcodeService_1.generateBarcode)(ulid);
    const [newSample] = await db_1.db
        .insert(schema_1.samples)
        .values({
        tenant_id: req.tenantId,
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
        received_by: req.user.id,
    })
        .returning();
    await (0, audit_1.createAuditLog)({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        action: "CREATE",
        table_name: "samples",
        record_id: newSample.id,
        new_value: newSample,
    });
    res
        .status(201)
        .json({ data: newSample, message: "Sample registered successfully" });
});
// ─── PATCH /samples/:id ───────────────────────────────────────────────────────
router.patch("/:id", auth_1.authenticate, (0, auth_1.requireRole)(...auth_1.LAB_ROLES), async (req, res) => {
    const [existing] = await db_1.db
        .select()
        .from(schema_1.samples)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.samples.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.samples.tenant_id, req.tenantId)))
        .limit(1);
    if (!existing)
        throw new errorHandler_1.AppError(404, "Sample not found");
    if (existing.voided_at)
        throw new errorHandler_1.AppError(400, "Cannot modify a voided sample");
    const body = createSampleSchema.partial().parse(req.body);
    // Convert date strings to Date objects
    const updateData = { ...body, updated_at: new Date() };
    if (body.collection_date) {
        updateData.collection_date = new Date(body.collection_date);
    }
    if (body.production_date) {
        updateData.production_date = new Date(body.production_date);
    }
    if (body.expiry_date) {
        updateData.expiry_date = new Date(body.expiry_date);
    }
    const [updated] = await db_1.db
        .update(schema_1.samples)
        .set(updateData)
        .where((0, drizzle_orm_1.eq)(schema_1.samples.id, req.params.id))
        .returning();
    await (0, audit_1.createAuditLog)({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        action: "UPDATE",
        table_name: "samples",
        record_id: existing.id,
        old_value: existing,
        new_value: updated,
    });
    res.json({ data: updated });
});
// ─── PATCH /samples/:id/status ────────────────────────────────────────────────
router.patch("/:id/status", auth_1.authenticate, (0, auth_1.requireRole)(...auth_1.STAFF_ROLES), async (req, res) => {
    const { status, reason } = updateStatusSchema.parse(req.body);
    const [existing] = await db_1.db
        .select()
        .from(schema_1.samples)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.samples.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.samples.tenant_id, req.tenantId)))
        .limit(1);
    if (!existing)
        throw new errorHandler_1.AppError(404, "Sample not found");
    const updateData = {
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
    const [updated] = await db_1.db
        .update(schema_1.samples)
        .set(updateData)
        .where((0, drizzle_orm_1.eq)(schema_1.samples.id, req.params.id))
        .returning();
    await (0, audit_1.createAuditLog)({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        action: "UPDATE",
        table_name: "samples",
        record_id: existing.id,
        old_value: { status: existing.status },
        new_value: { status, reason },
        metadata: { action: "STATUS_CHANGE" },
    });
    res.json({ data: updated, message: `Sample status updated to ${status}` });
});
// ─── GET /samples/stats ───────────────────────────────────────────────────────
router.get("/meta/stats", auth_1.authenticate, async (req, res) => {
    const stats = await db_1.db
        .select({
        status: schema_1.samples.status,
        count: (0, drizzle_orm_1.sql) `count(*)::int`,
    })
        .from(schema_1.samples)
        .where((0, drizzle_orm_1.eq)(schema_1.samples.tenant_id, req.tenantId))
        .groupBy(schema_1.samples.status);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [todayCount] = await db_1.db
        .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
        .from(schema_1.samples)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.samples.tenant_id, req.tenantId), (0, drizzle_orm_1.sql) `${schema_1.samples.received_at} >= ${today}`));
    res.json({
        data: {
            byStatus: stats,
            receivedToday: todayCount.count,
        },
    });
});
exports.default = router;
//# sourceMappingURL=samples.js.map