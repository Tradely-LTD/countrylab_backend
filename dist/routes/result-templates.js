"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const auth_1 = require("../middleware/auth");
const audit_1 = require("../middleware/audit");
const errorHandler_1 = require("../middleware/errorHandler");
const logger_1 = require("../utils/logger");
const multer_1 = __importDefault(require("multer"));
const router = (0, express_1.Router)();
// ─── Multer (memory storage for import) ──────────────────────────────────────
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (_req, file, cb) => {
        const allowed = /json|csv/;
        if (allowed.test(file.mimetype) || allowed.test(file.originalname)) {
            return cb(null, true);
        }
        cb(new Error("Only JSON or CSV files are allowed"));
    },
});
// ─── Validation Schemas ───────────────────────────────────────────────────────
const parameterSchema = zod_1.z.object({
    parameter_name: zod_1.z.string().min(1).max(255),
    nis_limit: zod_1.z.string().optional(),
    unit: zod_1.z.string().max(50).optional(),
    parameter_group: zod_1.z.string().max(100).optional(),
    sequence_order: zod_1.z.number().int().default(0),
    data_type: zod_1.z
        .enum(["numerical", "qualitative", "pass_fail"])
        .default("numerical"),
    spec_min: zod_1.z.number().optional().nullable(),
    spec_max: zod_1.z.number().optional().nullable(),
});
const createTemplateSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(255),
    nis_standard: zod_1.z.string().max(100).optional(),
    nis_standard_ref: zod_1.z.string().min(1).max(100),
    effective_date: zod_1.z.string().optional().nullable(),
    parameters: zod_1.z.array(parameterSchema).min(1),
});
const patchTemplateSchema = zod_1.z.discriminatedUnion("action", [
    zod_1.z.object({ action: zod_1.z.literal("deactivate") }),
    zod_1.z.object({
        action: zod_1.z.literal("new_version"),
        name: zod_1.z.string().min(1).max(255),
        nis_standard: zod_1.z.string().max(100).optional(),
        nis_standard_ref: zod_1.z.string().min(1).max(100),
        effective_date: zod_1.z.string().optional().nullable(),
        parameters: zod_1.z.array(parameterSchema).min(1),
    }),
]);
// ─── GET /result-templates ────────────────────────────────────────────────────
// Returns only the latest active version per template name, sorted alphabetically
router.get("/", auth_1.authenticate, async (req, res) => {
    try {
        // Get all active templates for tenant, then filter to latest version per name in JS
        const activeTemplates = await db_1.db
            .select({
            id: schema_1.result_templates.id,
            name: schema_1.result_templates.name,
            nis_standard_ref: schema_1.result_templates.nis_standard_ref,
            version: schema_1.result_templates.version,
            is_active: schema_1.result_templates.is_active,
        })
            .from(schema_1.result_templates)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.result_templates.tenant_id, req.tenantId), (0, drizzle_orm_1.eq)(schema_1.result_templates.is_active, true)))
            .orderBy((0, drizzle_orm_1.asc)(schema_1.result_templates.name), (0, drizzle_orm_1.desc)(schema_1.result_templates.version));
        // Keep only the latest version per name
        const latestByName = new Map();
        for (const t of activeTemplates) {
            if (!latestByName.has(t.name)) {
                latestByName.set(t.name, t);
            }
        }
        const data = Array.from(latestByName.values()).sort((a, b) => a.name.localeCompare(b.name));
        res.json({ data });
    }
    catch (error) {
        logger_1.logger.error("Error fetching active templates:", error);
        throw error;
    }
});
// ─── GET /result-templates/all ────────────────────────────────────────────────
// All templates including inactive; requires quality_manager or md
router.get("/all", auth_1.authenticate, (0, auth_1.requireRole)("quality_manager", "md", "super_admin"), async (req, res) => {
    try {
        const allTemplates = await db_1.db
            .select({
            id: schema_1.result_templates.id,
            name: schema_1.result_templates.name,
            nis_standard: schema_1.result_templates.nis_standard,
            nis_standard_ref: schema_1.result_templates.nis_standard_ref,
            effective_date: schema_1.result_templates.effective_date,
            version: schema_1.result_templates.version,
            parent_template_id: schema_1.result_templates.parent_template_id,
            is_active: schema_1.result_templates.is_active,
            created_at: schema_1.result_templates.created_at,
        })
            .from(schema_1.result_templates)
            .where((0, drizzle_orm_1.eq)(schema_1.result_templates.tenant_id, req.tenantId))
            .orderBy((0, drizzle_orm_1.asc)(schema_1.result_templates.name), (0, drizzle_orm_1.desc)(schema_1.result_templates.version));
        res.json({ data: allTemplates });
    }
    catch (error) {
        logger_1.logger.error("Error fetching all templates:", error);
        throw error;
    }
});
// ─── GET /result-templates/:id ────────────────────────────────────────────────
router.get("/:id", auth_1.authenticate, async (req, res) => {
    try {
        const [template] = await db_1.db
            .select()
            .from(schema_1.result_templates)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.result_templates.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.result_templates.tenant_id, req.tenantId)))
            .limit(1);
        if (!template)
            throw new errorHandler_1.AppError(404, "Template not found");
        const parameters = await db_1.db
            .select()
            .from(schema_1.result_template_parameters)
            .where((0, drizzle_orm_1.eq)(schema_1.result_template_parameters.template_id, template.id))
            .orderBy((0, drizzle_orm_1.asc)(schema_1.result_template_parameters.sequence_order));
        res.json({ data: { ...template, parameters } });
    }
    catch (error) {
        logger_1.logger.error("Error fetching template:", error);
        throw error;
    }
});
// ─── POST /result-templates ───────────────────────────────────────────────────
router.post("/", auth_1.authenticate, (0, auth_1.requireRole)("quality_manager", "md", "super_admin"), async (req, res) => {
    const body = createTemplateSchema.parse(req.body);
    const result = await db_1.db.transaction(async (tx) => {
        const [newTemplate] = await tx
            .insert(schema_1.result_templates)
            .values({
            tenant_id: req.tenantId,
            name: body.name,
            nis_standard: body.nis_standard,
            nis_standard_ref: body.nis_standard_ref,
            effective_date: body.effective_date ?? null,
            version: 1,
            is_active: true,
            created_by: req.user.id,
        })
            .returning();
        const paramRows = body.parameters.map((p) => ({
            template_id: newTemplate.id,
            parameter_name: p.parameter_name,
            nis_limit: p.nis_limit,
            unit: p.unit,
            parameter_group: p.parameter_group,
            sequence_order: p.sequence_order,
            data_type: p.data_type,
            spec_min: p.spec_min ?? null,
            spec_max: p.spec_max ?? null,
        }));
        const insertedParams = await tx
            .insert(schema_1.result_template_parameters)
            .values(paramRows)
            .returning();
        return { ...newTemplate, parameters: insertedParams };
    });
    await (0, audit_1.createAuditLog)({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        action: "CREATE",
        table_name: "result_templates",
        record_id: result.id,
        new_value: result,
    });
    res
        .status(201)
        .json({ data: result, message: "Template created successfully" });
});
// ─── PATCH /result-templates/:id ─────────────────────────────────────────────
router.patch("/:id", auth_1.authenticate, (0, auth_1.requireRole)("quality_manager", "md", "super_admin"), async (req, res) => {
    const body = patchTemplateSchema.parse(req.body);
    const [existing] = await db_1.db
        .select()
        .from(schema_1.result_templates)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.result_templates.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.result_templates.tenant_id, req.tenantId)))
        .limit(1);
    if (!existing)
        throw new errorHandler_1.AppError(404, "Template not found");
    if (body.action === "deactivate") {
        const [updated] = await db_1.db
            .update(schema_1.result_templates)
            .set({ is_active: false, updated_at: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.result_templates.id, existing.id))
            .returning();
        await (0, audit_1.createAuditLog)({
            tenant_id: req.tenantId,
            user_id: req.user.id,
            action: "UPDATE",
            table_name: "result_templates",
            record_id: existing.id,
            old_value: { is_active: true },
            new_value: { is_active: false },
            metadata: { action: "DEACTIVATE" },
        });
        return res.json({ data: updated, message: "Template deactivated" });
    }
    // action === "new_version"
    const result = await db_1.db.transaction(async (tx) => {
        // Deactivate the old template
        await tx
            .update(schema_1.result_templates)
            .set({ is_active: false, updated_at: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.result_templates.id, existing.id));
        // Insert new version
        const [newTemplate] = await tx
            .insert(schema_1.result_templates)
            .values({
            tenant_id: req.tenantId,
            name: body.name,
            nis_standard: body.nis_standard,
            nis_standard_ref: body.nis_standard_ref,
            effective_date: body.effective_date ?? null,
            version: (existing.version ?? 1) + 1,
            parent_template_id: existing.id,
            is_active: true,
            created_by: req.user.id,
        })
            .returning();
        const paramRows = body.parameters.map((p) => ({
            template_id: newTemplate.id,
            parameter_name: p.parameter_name,
            nis_limit: p.nis_limit,
            unit: p.unit,
            parameter_group: p.parameter_group,
            sequence_order: p.sequence_order,
            data_type: p.data_type,
            spec_min: p.spec_min ?? null,
            spec_max: p.spec_max ?? null,
        }));
        const insertedParams = await tx
            .insert(schema_1.result_template_parameters)
            .values(paramRows)
            .returning();
        return { ...newTemplate, parameters: insertedParams };
    });
    await (0, audit_1.createAuditLog)({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        action: "CREATE",
        table_name: "result_templates",
        record_id: result.id,
        new_value: result,
        metadata: { action: "NEW_VERSION", previous_id: existing.id },
    });
    res
        .status(201)
        .json({ data: result, message: "New template version created" });
});
// ─── DELETE /result-templates/:id ────────────────────────────────────────────
router.delete("/:id", auth_1.authenticate, (0, auth_1.requireRole)("quality_manager", "md", "super_admin"), async (req, res) => {
    const [existing] = await db_1.db
        .select()
        .from(schema_1.result_templates)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.result_templates.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.result_templates.tenant_id, req.tenantId)))
        .limit(1);
    if (!existing)
        throw new errorHandler_1.AppError(404, "Template not found");
    // Check if any results reference this template
    const [{ count }] = await db_1.db
        .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
        .from(schema_1.results)
        .where((0, drizzle_orm_1.eq)(schema_1.results.template_id, existing.id));
    if (count > 0) {
        throw new errorHandler_1.AppError(409, `Template is in use by ${count} result(s). Deactivate it instead.`);
    }
    await db_1.db
        .delete(schema_1.result_templates)
        .where((0, drizzle_orm_1.eq)(schema_1.result_templates.id, existing.id));
    await (0, audit_1.createAuditLog)({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        action: "DELETE",
        table_name: "result_templates",
        record_id: existing.id,
        old_value: existing,
    });
    res.json({ message: "Template deleted successfully" });
});
// ─── POST /result-templates/import ───────────────────────────────────────────
router.post("/import", auth_1.authenticate, (0, auth_1.requireRole)("quality_manager", "md", "super_admin"), upload.single("file"), async (req, res) => {
    if (!req.file) {
        throw new errorHandler_1.AppError(400, "No file uploaded. Expected a 'file' field.");
    }
    const fileContent = req.file.buffer.toString("utf-8").trim();
    const filename = req.file.originalname.toLowerCase();
    let parsed;
    if (filename.endsWith(".json") ||
        req.file.mimetype === "application/json") {
        try {
            parsed = JSON.parse(fileContent);
        }
        catch {
            throw new errorHandler_1.AppError(400, "Invalid JSON file.");
        }
    }
    else if (filename.endsWith(".csv") ||
        req.file.mimetype === "text/csv" ||
        req.file.mimetype === "application/csv") {
        parsed = parseImportCsv(fileContent);
    }
    else {
        throw new errorHandler_1.AppError(400, "Invalid file format. Expected JSON or CSV.");
    }
    // Validate the parsed payload
    const validationResult = createTemplateSchema.safeParse(parsed);
    if (!validationResult.success) {
        const missingFields = validationResult.error.issues.map((i) => i.path.join("."));
        return res.status(400).json({
            error: `Missing required fields: ${missingFields.join(", ")}`,
            fields: missingFields,
        });
    }
    const body = validationResult.data;
    const result = await db_1.db.transaction(async (tx) => {
        const [newTemplate] = await tx
            .insert(schema_1.result_templates)
            .values({
            tenant_id: req.tenantId,
            name: body.name,
            nis_standard: body.nis_standard,
            nis_standard_ref: body.nis_standard_ref,
            effective_date: body.effective_date ?? null,
            version: 1,
            is_active: true,
            created_by: req.user.id,
        })
            .returning();
        const paramRows = body.parameters.map((p) => ({
            template_id: newTemplate.id,
            parameter_name: p.parameter_name,
            nis_limit: p.nis_limit,
            unit: p.unit,
            parameter_group: p.parameter_group,
            sequence_order: p.sequence_order,
            data_type: p.data_type,
            spec_min: p.spec_min ?? null,
            spec_max: p.spec_max ?? null,
        }));
        const insertedParams = await tx
            .insert(schema_1.result_template_parameters)
            .values(paramRows)
            .returning();
        return { ...newTemplate, parameters: insertedParams };
    });
    await (0, audit_1.createAuditLog)({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        action: "CREATE",
        table_name: "result_templates",
        record_id: result.id,
        new_value: result,
        metadata: { action: "IMPORT" },
    });
    res
        .status(201)
        .json({ data: result, message: "Template imported successfully" });
});
// ─── CSV Parser ───────────────────────────────────────────────────────────────
// Parses a CSV where the first row is a header row for template metadata
// and subsequent rows are parameters.
//
// Expected CSV format:
// name,nis_standard,nis_standard_ref,effective_date
// Borehole Water,NIS 554,NIS-554-2015,2015-01-01
// parameter_name,nis_limit,unit,parameter_group,sequence_order,data_type,spec_min,spec_max
// pH,6.5 - 8.5,,Physical Tests,1,numerical,6.5,8.5
function parseImportCsv(content) {
    const lines = content.split(/\r?\n/).filter((l) => l.trim() !== "");
    if (lines.length < 4) {
        throw new errorHandler_1.AppError(400, "CSV file is too short. Expected template header row, template data row, parameter header row, and at least one parameter row.");
    }
    const templateHeaders = lines[0].split(",").map((h) => h.trim());
    const templateValues = lines[1].split(",").map((v) => v.trim());
    const templateRow = {};
    templateHeaders.forEach((h, i) => {
        templateRow[h] = templateValues[i] ?? "";
    });
    const paramHeaders = lines[2].split(",").map((h) => h.trim());
    const parameters = [];
    for (let i = 3; i < lines.length; i++) {
        const vals = lines[i].split(",").map((v) => v.trim());
        const param = {};
        paramHeaders.forEach((h, j) => {
            param[h] = vals[j] ?? "";
        });
        parameters.push({
            parameter_name: param["parameter_name"],
            nis_limit: param["nis_limit"] || undefined,
            unit: param["unit"] || undefined,
            parameter_group: param["parameter_group"] || undefined,
            sequence_order: param["sequence_order"]
                ? parseInt(param["sequence_order"])
                : 0,
            data_type: param["data_type"] || "numerical",
            spec_min: param["spec_min"] ? parseFloat(param["spec_min"]) : undefined,
            spec_max: param["spec_max"] ? parseFloat(param["spec_max"]) : undefined,
        });
    }
    return {
        name: templateRow["name"],
        nis_standard: templateRow["nis_standard"] || undefined,
        nis_standard_ref: templateRow["nis_standard_ref"],
        effective_date: templateRow["effective_date"] || undefined,
        parameters,
    };
}
exports.default = router;
//# sourceMappingURL=result-templates.js.map