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
const pdfService_1 = require("../services/pdfService");
const qrService_1 = require("../services/qrService");
const notificationService_1 = require("../services/notificationService");
const resultComputation_1 = require("../utils/resultComputation");
const router = (0, express_1.Router)();
// ─── Validation ───────────────────────────────────────────────────────────────
const parameterSchema = zod_1.z.object({
    param_name: zod_1.z.string().min(1, "Parameter name is required"),
    raw_value: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]).optional().nullable(),
    calculated_value: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]).optional().nullable(),
    unit: zod_1.z.string().optional().nullable(),
    spec_min: zod_1.z.number().optional().nullable(),
    spec_max: zod_1.z.number().optional().nullable(),
    pass: zod_1.z.boolean().optional(),
    warning: zod_1.z.boolean().optional().default(false),
    data_type: zod_1.z.enum(["numerical", "qualitative"]).default("numerical"),
});
const createResultSchema = zod_1.z.object({
    sample_id: zod_1.z.string().uuid(),
    test_method_id: zod_1.z.string().uuid().optional(),
    template_id: zod_1.z.string().uuid().optional(),
    template_version: zod_1.z.number().int().optional(),
    parameters: zod_1.z.array(parameterSchema).min(1),
    notes: zod_1.z.string().optional(),
});
const updateResultSchema = zod_1.z.object({
    parameters: zod_1.z.array(parameterSchema).optional(),
    notes: zod_1.z.string().optional(),
    reason_for_change: zod_1.z
        .string()
        .min(10, "Please provide a detailed reason for the change"),
});
// ─── GET /results ─────────────────────────────────────────────────────────────
router.get("/", auth_1.authenticate, async (req, res) => {
    const { page = "1", limit = "25", status, sample_id, } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.results.tenant_id, req.tenantId)];
    if (status)
        conditions.push((0, drizzle_orm_1.eq)(schema_1.results.overall_status, status));
    if (sample_id)
        conditions.push((0, drizzle_orm_1.eq)(schema_1.results.sample_id, sample_id));
    const [resultList, [{ count }]] = await Promise.all([
        db_1.db
            .select({
            id: schema_1.results.id,
            overall_status: schema_1.results.overall_status,
            coa_url: schema_1.results.coa_url,
            qr_hash: schema_1.results.qr_hash,
            approved_at: schema_1.results.approved_at,
            created_at: schema_1.results.created_at,
            sample: {
                id: schema_1.samples.id,
                ulid: schema_1.samples.ulid,
                name: schema_1.samples.name,
                matrix: schema_1.samples.matrix,
            },
            analyst: {
                id: schema_1.users.id,
                full_name: schema_1.users.full_name,
            },
        })
            .from(schema_1.results)
            .leftJoin(schema_1.samples, (0, drizzle_orm_1.eq)(schema_1.results.sample_id, schema_1.samples.id))
            .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.results.analyst_id, schema_1.users.id))
            .where((0, drizzle_orm_1.and)(...conditions))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.results.created_at))
            .limit(parseInt(limit))
            .offset(offset),
        db_1.db
            .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(schema_1.results)
            .where((0, drizzle_orm_1.and)(...conditions)),
    ]);
    res.json({
        data: resultList,
        pagination: { page: parseInt(page), limit: parseInt(limit), total: count },
    });
});
// ─── GET /results/:id ─────────────────────────────────────────────────────────
router.get("/:id", auth_1.authenticate, async (req, res) => {
    const [result] = await db_1.db
        .select({
        id: schema_1.results.id,
        tenant_id: schema_1.results.tenant_id,
        sample_id: schema_1.results.sample_id,
        test_method_id: schema_1.results.test_method_id,
        analyst_id: schema_1.results.analyst_id,
        approver_id: schema_1.results.approver_id,
        parameters: schema_1.results.parameters,
        notes: schema_1.results.notes,
        overall_status: schema_1.results.overall_status,
        qr_hash: schema_1.results.qr_hash,
        qr_code_url: schema_1.results.qr_code_url,
        coa_url: schema_1.results.coa_url,
        locked_at: schema_1.results.locked_at,
        voided_at: schema_1.results.voided_at,
        approved_at: schema_1.results.approved_at,
        reviewed_at: schema_1.results.reviewed_at,
        created_at: schema_1.results.created_at,
        updated_at: schema_1.results.updated_at,
        sample: {
            id: schema_1.samples.id,
            ulid: schema_1.samples.ulid,
            name: schema_1.samples.name,
            matrix: schema_1.samples.matrix,
            collection_date: schema_1.samples.collection_date,
        },
        analyst: {
            id: schema_1.users.id,
            full_name: schema_1.users.full_name,
            email: schema_1.users.email,
            role: schema_1.users.role,
        },
    })
        .from(schema_1.results)
        .leftJoin(schema_1.samples, (0, drizzle_orm_1.eq)(schema_1.results.sample_id, schema_1.samples.id))
        .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.results.analyst_id, schema_1.users.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.results.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.results.tenant_id, req.tenantId)))
        .limit(1);
    if (!result)
        throw new errorHandler_1.AppError(404, "Result not found");
    // Get change history
    const changes = await db_1.db
        .select()
        .from(schema_1.result_changes)
        .where((0, drizzle_orm_1.eq)(schema_1.result_changes.result_id, result.id))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.result_changes.created_at));
    res.json({ data: { ...result, changes } });
});
// ─── POST /results ────────────────────────────────────────────────────────────
router.post("/", auth_1.authenticate, (0, auth_1.requireRole)(...auth_1.LAB_ROLES), async (req, res) => {
    const body = createResultSchema.parse(req.body);
    // Verify sample belongs to tenant
    const [sample] = await db_1.db
        .select()
        .from(schema_1.samples)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.samples.id, body.sample_id), (0, drizzle_orm_1.eq)(schema_1.samples.tenant_id, req.tenantId)))
        .limit(1);
    if (!sample)
        throw new errorHandler_1.AppError(404, "Sample not found");
    if (sample.status === "approved")
        throw new errorHandler_1.AppError(400, "Sample already has an approved result");
    // Check for outliers
    const parameters = (0, resultComputation_1.computeParameters)(body.parameters);
    const [newResult] = await db_1.db
        .insert(schema_1.results)
        .values({
        tenant_id: req.tenantId,
        sample_id: body.sample_id,
        test_method_id: body.test_method_id,
        template_id: body.template_id,
        template_version: body.template_version,
        analyst_id: req.user.id,
        parameters: parameters,
        notes: body.notes,
        overall_status: "draft",
    })
        .returning();
    // Update sample status
    await db_1.db
        .update(schema_1.samples)
        .set({ status: "in_testing", updated_at: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.samples.id, body.sample_id));
    await (0, audit_1.createAuditLog)({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        action: "CREATE",
        table_name: "results",
        record_id: newResult.id,
        new_value: newResult,
    });
    res.status(201).json({
        data: newResult,
        message: "Result created successfully",
        hasOutliers: parameters.some((p) => p.warning),
    });
});
// ─── PUT /results/:id ─────────────────────────────────────────────────────────
router.put("/:id", auth_1.authenticate, (0, auth_1.requireRole)(...auth_1.LAB_ROLES), async (req, res) => {
    const body = updateResultSchema.parse(req.body);
    const [existing] = await db_1.db
        .select()
        .from(schema_1.results)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.results.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.results.tenant_id, req.tenantId)))
        .limit(1);
    if (!existing)
        throw new errorHandler_1.AppError(404, "Result not found");
    if (existing.locked_at)
        throw new errorHandler_1.AppError(400, "Result is locked after approval");
    if (existing.voided_at)
        throw new errorHandler_1.AppError(400, "Cannot modify a voided result");
    // Log the change
    await db_1.db.insert(schema_1.result_changes).values({
        result_id: existing.id,
        changed_by: req.user.id,
        reason: body.reason_for_change,
        old_parameters: existing.parameters,
        new_parameters: body.parameters,
    });
    const [updated] = await db_1.db
        .update(schema_1.results)
        .set({
        parameters: body.parameters,
        notes: body.notes,
        overall_status: "draft", // Reset to draft on edit
        updated_at: new Date(),
    })
        .where((0, drizzle_orm_1.eq)(schema_1.results.id, req.params.id))
        .returning();
    await (0, audit_1.createAuditLog)({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        action: "UPDATE",
        table_name: "results",
        record_id: existing.id,
        old_value: { parameters: existing.parameters },
        new_value: { parameters: body.parameters },
        metadata: { reason: body.reason_for_change },
    });
    res.json({ data: updated });
});
// ─── POST /results/:id/submit ─────────────────────────────────────────────────
router.post("/:id/submit", auth_1.authenticate, (0, auth_1.requireRole)(...auth_1.LAB_ROLES), async (req, res) => {
    const [existing] = await db_1.db
        .select()
        .from(schema_1.results)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.results.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.results.tenant_id, req.tenantId)))
        .limit(1);
    if (!existing)
        throw new errorHandler_1.AppError(404, "Result not found");
    if (existing.overall_status !== "draft") {
        throw new errorHandler_1.AppError(400, `Result is already in '${existing.overall_status}' status`);
    }
    const [updated] = await db_1.db
        .update(schema_1.results)
        .set({ overall_status: "submitted", updated_at: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.results.id, req.params.id))
        .returning();
    // Update sample status
    await db_1.db
        .update(schema_1.samples)
        .set({ status: "pending_review", updated_at: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.samples.id, existing.sample_id));
    // Notify MD/approvers
    await (0, notificationService_1.sendNotification)({
        tenant_id: req.tenantId,
        type: "RESULT_PENDING_REVIEW",
        title: "Result Submitted for Review",
        message: `A result has been submitted and awaits your approval.`,
        roles: ["md", "super_admin"],
        link: `/results/${existing.id}`,
    });
    await (0, audit_1.createAuditLog)({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        action: "UPDATE",
        table_name: "results",
        record_id: existing.id,
        new_value: { status: "submitted" },
        metadata: { action: "SUBMITTED_FOR_REVIEW" },
    });
    res.json({ data: updated, message: "Result submitted for review" });
});
// ─── POST /results/:id/approve ────────────────────────────────────────────────
router.post("/:id/approve", auth_1.authenticate, (0, auth_1.requireRole)(...auth_1.APPROVAL_ROLES), async (req, res) => {
    const [existing] = await db_1.db
        .select()
        .from(schema_1.results)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.results.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.results.tenant_id, req.tenantId)))
        .limit(1);
    if (!existing)
        throw new errorHandler_1.AppError(404, "Result not found");
    if (!["submitted", "under_review"].includes(existing.overall_status || "")) {
        throw new errorHandler_1.AppError(400, "Result must be submitted before approval");
    }
    const now = new Date();
    const qrHash = (0, qrService_1.generateQRHash)(existing.id);
    const qrCodeUrl = await (0, qrService_1.generateQRCode)(qrHash, req.tenantId);
    // Generate CoA PDF
    const coaUrl = await (0, pdfService_1.generateCoaPdf)({
        result_id: existing.id,
        tenant_id: req.tenantId,
        qr_hash: qrHash,
    });
    const [updated] = await db_1.db
        .update(schema_1.results)
        .set({
        overall_status: "approved",
        approver_id: req.user.id,
        approved_at: now,
        locked_at: now,
        qr_hash: qrHash,
        qr_code_url: qrCodeUrl,
        coa_url: coaUrl,
        updated_at: now,
    })
        .where((0, drizzle_orm_1.eq)(schema_1.results.id, req.params.id))
        .returning();
    // Update sample status to approved
    await db_1.db
        .update(schema_1.samples)
        .set({ status: "approved", updated_at: now })
        .where((0, drizzle_orm_1.eq)(schema_1.samples.id, existing.sample_id));
    await (0, audit_1.createAuditLog)({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        action: "APPROVE",
        table_name: "results",
        record_id: existing.id,
        metadata: { action: "APPROVED", qr_hash: qrHash },
    });
    res.json({
        data: updated,
        message: "Result approved. CoA has been generated.",
    });
});
// ─── POST /results/:id/reject ─────────────────────────────────────────────────
router.post("/:id/reject", auth_1.authenticate, (0, auth_1.requireRole)(...auth_1.APPROVAL_ROLES), async (req, res) => {
    const { reason } = zod_1.z.object({ reason: zod_1.z.string().min(10) }).parse(req.body);
    const [updated] = await db_1.db
        .update(schema_1.results)
        .set({ overall_status: "rejected", updated_at: new Date() })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.results.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.results.tenant_id, req.tenantId)))
        .returning();
    if (!updated)
        throw new errorHandler_1.AppError(404, "Result not found");
    await (0, audit_1.createAuditLog)({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        action: "REJECT",
        table_name: "results",
        record_id: updated.id,
        metadata: { reason },
    });
    res.json({ data: updated, message: "Result rejected" });
});
// ─── GET /results/:id/coa (Download CoA PDF) ──────────────────────────────────
router.get("/:id/coa", auth_1.authenticate, async (req, res) => {
    const [result] = await db_1.db
        .select()
        .from(schema_1.results)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.results.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.results.tenant_id, req.tenantId)))
        .limit(1);
    if (!result)
        throw new errorHandler_1.AppError(404, "Result not found");
    if (result.overall_status !== "approved")
        throw new errorHandler_1.AppError(400, "CoA only available for approved results");
    if (!result.coa_url)
        throw new errorHandler_1.AppError(404, "CoA not yet generated");
    res.json({ data: { coa_url: result.coa_url, qr_hash: result.qr_hash } });
});
// ─── GET /verify/:qrHash (PUBLIC — no auth) ───────────────────────────────────
router.get("/verify/:qrHash", async (req, res) => {
    const [result] = await db_1.db
        .select({
        id: schema_1.results.id,
        overall_status: schema_1.results.overall_status,
        approved_at: schema_1.results.approved_at,
        parameters: schema_1.results.parameters,
        qr_hash: schema_1.results.qr_hash,
        qr_code_url: schema_1.results.qr_code_url,
        sample: {
            ulid: schema_1.samples.ulid,
            name: schema_1.samples.name,
            matrix: schema_1.samples.matrix,
            collection_date: schema_1.samples.collection_date,
        },
    })
        .from(schema_1.results)
        .leftJoin(schema_1.samples, (0, drizzle_orm_1.eq)(schema_1.results.sample_id, schema_1.samples.id))
        .where((0, drizzle_orm_1.eq)(schema_1.results.qr_hash, req.params.qrHash))
        .limit(1);
    if (!result) {
        return res.json({
            verified: false,
            message: "No record found. This report may be fraudulent.",
        });
    }
    res.json({
        verified: true,
        message: "Authentic Report — Verified by Countrylab",
        data: {
            sample: result.sample,
            approved_at: result.approved_at,
            status: result.overall_status,
            parameters: result.parameters,
            qr_code_url: result.qr_code_url,
            qr_hash: result.qr_hash,
        },
    });
});
// ─── GET /results/meta/queue (MD approval queue) ──────────────────────────────
router.get("/meta/queue", auth_1.authenticate, (0, auth_1.requireRole)(...auth_1.APPROVAL_ROLES), async (req, res) => {
    const queue = await db_1.db
        .select({
        id: schema_1.results.id,
        overall_status: schema_1.results.overall_status,
        created_at: schema_1.results.created_at,
        notes: schema_1.results.notes,
        sample: {
            id: schema_1.samples.id,
            ulid: schema_1.samples.ulid,
            name: schema_1.samples.name,
            matrix: schema_1.samples.matrix,
        },
        analyst: {
            id: schema_1.users.id,
            full_name: schema_1.users.full_name,
        },
    })
        .from(schema_1.results)
        .leftJoin(schema_1.samples, (0, drizzle_orm_1.eq)(schema_1.results.sample_id, schema_1.samples.id))
        .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.results.analyst_id, schema_1.users.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.results.tenant_id, req.tenantId), (0, drizzle_orm_1.sql) `${schema_1.results.overall_status} IN ('submitted', 'under_review')`))
        .orderBy(schema_1.results.created_at);
    res.json({ data: queue, count: queue.length });
});
// ─── POST /results/:id/regenerate-qr ──────────────────────────────────────────
router.post("/:id/regenerate-qr", auth_1.authenticate, (0, auth_1.requireRole)(...auth_1.APPROVAL_ROLES), async (req, res) => {
    const [existing] = await db_1.db
        .select()
        .from(schema_1.results)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.results.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.results.tenant_id, req.tenantId)))
        .limit(1);
    if (!existing)
        throw new errorHandler_1.AppError(404, "Result not found");
    if (existing.overall_status !== "approved") {
        throw new errorHandler_1.AppError(400, "Only approved results can have QR codes regenerated");
    }
    const qrHash = existing.qr_hash || (0, qrService_1.generateQRHash)(existing.id);
    const qrCodeUrl = await (0, qrService_1.generateQRCode)(qrHash, req.tenantId);
    const [updated] = await db_1.db
        .update(schema_1.results)
        .set({
        qr_hash: qrHash,
        qr_code_url: qrCodeUrl,
        updated_at: new Date(),
    })
        .where((0, drizzle_orm_1.eq)(schema_1.results.id, req.params.id))
        .returning();
    res.json({
        data: updated,
        message: "QR code regenerated successfully",
        qr_code_url: qrCodeUrl,
    });
});
// ─── DELETE /results/:id ──────────────────────────────────────────────────────
router.delete("/:id", auth_1.authenticate, (0, auth_1.requireRole)(...auth_1.LAB_ROLES), async (req, res) => {
    const [existing] = await db_1.db
        .select()
        .from(schema_1.results)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.results.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.results.tenant_id, req.tenantId)))
        .limit(1);
    if (!existing)
        throw new errorHandler_1.AppError(404, "Result not found");
    // Only allow deletion of draft results
    if (existing.overall_status !== "draft") {
        throw new errorHandler_1.AppError(400, "Only draft results can be deleted");
    }
    // Delete the result
    await db_1.db.delete(schema_1.results).where((0, drizzle_orm_1.eq)(schema_1.results.id, req.params.id));
    await (0, audit_1.createAuditLog)({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        action: "DELETE",
        table_name: "results",
        record_id: existing.id,
        old_value: existing,
    });
    res.json({ message: "Result deleted successfully" });
});
exports.default = router;
//# sourceMappingURL=results.js.map