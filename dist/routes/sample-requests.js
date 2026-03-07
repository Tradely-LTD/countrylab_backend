"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const auth_1 = require("../middleware/auth");
const errorHandler_1 = require("../middleware/errorHandler");
const logger_1 = require("../utils/logger");
const emailService_1 = require("../services/emailService");
const router = (0, express_1.Router)();
// ─── Validation Schemas ───────────────────────────────────────────────────────
const createRequestSchema = zod_1.z.object({
    client_id: zod_1.z.string().uuid().optional(),
    // Client info (for new clients via public form)
    client_name: zod_1.z.string().optional(),
    client_company: zod_1.z.string().optional(),
    client_email: zod_1.z.string().email().optional(),
    client_phone: zod_1.z.string().optional(),
    client_address: zod_1.z.string().optional(),
    // Representative
    representative_name: zod_1.z.string().optional(),
    representative_phone: zod_1.z.string().optional(),
    representative_email: zod_1.z.string().email().optional().or(zod_1.z.literal("")),
    // Sample Information
    product_name: zod_1.z.string().optional(),
    sample_source: zod_1.z.string().optional(),
    sample_type: zod_1.z.string().optional(),
    production_date: zod_1.z.string().optional(), // Changed from datetime
    expiry_date: zod_1.z.string().optional(), // Changed from datetime
    batch_number: zod_1.z.string().optional(),
    // Analysis
    intended_use: zod_1.z.string().optional(),
    reference_standard: zod_1.z.string().optional(),
    test_category: zod_1.z.string().optional(),
    test_category_other: zod_1.z.string().optional(),
    requested_tests: zod_1.z.array(zod_1.z.string()).optional(),
    // Additional
    sample_container: zod_1.z.string().optional(),
    sample_volume: zod_1.z.string().optional(),
    sample_condition: zod_1.z.string().optional(),
    temperature_on_receipt: zod_1.z.string().optional(),
    sampling_point: zod_1.z.string().optional(),
    manufacturer: zod_1.z.string().optional(),
    matrix: zod_1.z.string().optional(),
});
const updateRequestSchema = zod_1.z.object({
    status: zod_1.z
        .enum([
        "pending",
        "under_review",
        "approved",
        "rejected",
        "sample_received",
        "completed",
        "cancelled",
    ])
        .optional(),
    rejection_reason: zod_1.z.string().optional(),
    quotation_amount: zod_1.z.number().optional(),
    // Official use fields
    reference_standard_available: zod_1.z.boolean().optional(),
    service_offered: zod_1.z.boolean().optional(),
    test_resources_available: zod_1.z.boolean().optional(),
    sample_quantity_sufficient: zod_1.z.boolean().optional(),
    invoice_issued: zod_1.z.boolean().optional(),
    payment_confirmed: zod_1.z.boolean().optional(),
    official_remarks: zod_1.z.string().optional(),
});
// ─── Helper: Generate Request Number ─────────────────────────────────────────
async function generateRequestNumber(tenantId) {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, "0");
    const lastRequest = await db_1.db
        .select({ request_number: schema_1.sample_requests.request_number })
        .from(schema_1.sample_requests)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.sample_requests.tenant_id, tenantId), (0, drizzle_orm_1.sql) `${schema_1.sample_requests.request_number} LIKE ${`CRF${year}${month}-%`}`))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.sample_requests.created_at))
        .limit(1);
    let sequence = 1;
    if (lastRequest.length > 0) {
        const lastNum = lastRequest[0].request_number.split("-")[1];
        sequence = parseInt(lastNum) + 1;
    }
    return `CRF${year}${month}-${String(sequence).padStart(4, "0")}`;
}
// ─── POST /sample-requests (PUBLIC) ──────────────────────────────────────────
router.post("/public", async (req, res) => {
    try {
        const body = createRequestSchema.parse(req.body);
        // Get tenant_id from request or use first available tenant
        let tenantId = req.body.tenant_id;
        if (!tenantId) {
            // Get the first tenant from database
            const { tenants } = await Promise.resolve().then(() => __importStar(require("../db/schema")));
            const [firstTenant] = await db_1.db.select().from(tenants).limit(1);
            if (!firstTenant) {
                throw new errorHandler_1.AppError(500, "No tenant configured. Please contact administrator.");
            }
            tenantId = firstTenant.id;
        }
        // Create or find client
        let clientId = body.client_id;
        if (!clientId && body.client_email) {
            // Check if client exists
            const existingClient = await db_1.db
                .select()
                .from(schema_1.clients)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.clients.tenant_id, tenantId), (0, drizzle_orm_1.eq)(schema_1.clients.email, body.client_email)))
                .limit(1);
            if (existingClient.length > 0) {
                clientId = existingClient[0].id;
            }
            else {
                // Create new client
                const [newClient] = await db_1.db
                    .insert(schema_1.clients)
                    .values({
                    tenant_id: tenantId,
                    name: body.client_name || "Walk-in Customer",
                    company: body.client_company,
                    email: body.client_email,
                    phone: body.client_phone,
                    address: body.client_address,
                })
                    .returning();
                clientId = newClient.id;
            }
        }
        if (!clientId) {
            throw new errorHandler_1.AppError(400, "Client information required");
        }
        const requestNumber = await generateRequestNumber(tenantId);
        // Convert date strings to Date objects if provided (not ISO strings)
        const productionDate = body.production_date
            ? new Date(body.production_date)
            : undefined;
        const expiryDate = body.expiry_date
            ? new Date(body.expiry_date)
            : undefined;
        const [request] = await db_1.db
            .insert(schema_1.sample_requests)
            .values({
            tenant_id: tenantId,
            request_number: requestNumber,
            client_id: clientId,
            representative_name: body.representative_name,
            representative_phone: body.representative_phone,
            representative_email: body.representative_email,
            product_name: body.product_name,
            sample_source: body.sample_source,
            sample_type: body.sample_type,
            production_date: productionDate,
            expiry_date: expiryDate,
            batch_number: body.batch_number,
            intended_use: body.intended_use,
            reference_standard: body.reference_standard,
            test_category: body.test_category,
            test_category_other: body.test_category_other,
            requested_tests: body.requested_tests || [],
            sample_container: body.sample_container,
            sample_volume: body.sample_volume,
            sample_condition: body.sample_condition,
            temperature_on_receipt: body.temperature_on_receipt,
            sampling_point: body.sampling_point,
            manufacturer: body.manufacturer,
            matrix: body.matrix,
            status: "pending",
        })
            .returning();
        logger_1.logger.info(`Public sample request created: ${requestNumber}`);
        // Send confirmation emails (don't wait for completion)
        (0, emailService_1.sendRequestConfirmation)({
            requestNumber,
            clientName: body.client_name || "Customer",
            clientEmail: body.client_email,
            representativeName: body.representative_name,
            representativeEmail: body.representative_email,
            productName: body.product_name || "Sample",
            testCategory: body.test_category || "general",
        }).catch((err) => logger_1.logger.error("Email send failed:", err));
        res.status(201).json({
            success: true,
            data: request,
            message: `Request ${requestNumber} submitted successfully`,
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            const firstError = error.errors[0];
            logger_1.logger.error("Validation error:", {
                field: firstError.path,
                message: firstError.message,
            });
            throw new errorHandler_1.AppError(400, `${firstError.path.join(".")}: ${firstError.message}`);
        }
        throw error;
    }
});
// ─── GET /sample-requests ─────────────────────────────────────────────────────
router.get("/", auth_1.authenticate, async (req, res) => {
    try {
        const { page = "1", limit = "25", status, search, client_id, } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        const conditions = [(0, drizzle_orm_1.eq)(schema_1.sample_requests.tenant_id, req.tenantId)];
        if (status)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.sample_requests.status, status));
        if (client_id)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.sample_requests.client_id, client_id));
        if (search) {
            conditions.push((0, drizzle_orm_1.sql) `(${schema_1.sample_requests.request_number} ILIKE ${"%" + search + "%"} OR ${schema_1.sample_requests.product_name} ILIKE ${"%" + search + "%"})`);
        }
        const [requestList, [{ count }]] = await Promise.all([
            db_1.db
                .select({
                id: schema_1.sample_requests.id,
                request_number: schema_1.sample_requests.request_number,
                product_name: schema_1.sample_requests.product_name,
                status: schema_1.sample_requests.status,
                test_category: schema_1.sample_requests.test_category,
                quotation_amount: schema_1.sample_requests.quotation_amount,
                payment_confirmed: schema_1.sample_requests.payment_confirmed,
                created_at: schema_1.sample_requests.created_at,
                client: {
                    id: schema_1.clients.id,
                    name: schema_1.clients.name,
                    company: schema_1.clients.company,
                },
                sample: {
                    id: schema_1.samples.id,
                    ulid: schema_1.samples.ulid,
                },
            })
                .from(schema_1.sample_requests)
                .leftJoin(schema_1.clients, (0, drizzle_orm_1.eq)(schema_1.sample_requests.client_id, schema_1.clients.id))
                .leftJoin(schema_1.samples, (0, drizzle_orm_1.eq)(schema_1.sample_requests.sample_id, schema_1.samples.id))
                .where((0, drizzle_orm_1.and)(...conditions))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.sample_requests.created_at))
                .limit(parseInt(limit))
                .offset(offset),
            db_1.db
                .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
                .from(schema_1.sample_requests)
                .where((0, drizzle_orm_1.and)(...conditions)),
        ]);
        res.json({
            success: true,
            data: requestList,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: count,
                pages: Math.ceil(count / parseInt(limit)),
            },
        });
    }
    catch (error) {
        throw error;
    }
});
// ─── GET /sample-requests/:id ─────────────────────────────────────────────────
router.get("/:id", auth_1.authenticate, async (req, res) => {
    try {
        const [request] = await db_1.db
            .select({
            request: schema_1.sample_requests,
            client: schema_1.clients,
            received_by_user: schema_1.users,
            sample: schema_1.samples,
        })
            .from(schema_1.sample_requests)
            .leftJoin(schema_1.clients, (0, drizzle_orm_1.eq)(schema_1.sample_requests.client_id, schema_1.clients.id))
            .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.sample_requests.received_by, schema_1.users.id))
            .leftJoin(schema_1.samples, (0, drizzle_orm_1.eq)(schema_1.sample_requests.sample_id, schema_1.samples.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.sample_requests.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.sample_requests.tenant_id, req.tenantId)))
            .limit(1);
        if (!request) {
            throw new errorHandler_1.AppError(404, "Request not found");
        }
        res.json({
            success: true,
            data: {
                ...request.request,
                client: request.client,
                received_by: request.received_by_user,
                sample: request.sample,
            },
        });
    }
    catch (error) {
        throw error;
    }
});
// ─── PUT /sample-requests/:id ─────────────────────────────────────────────────
router.put("/:id", auth_1.authenticate, (0, auth_1.requireRole)(...auth_1.STAFF_ROLES), async (req, res) => {
    try {
        const body = updateRequestSchema.parse(req.body);
        const updateData = { ...body, updated_at: new Date() };
        if (body.status === "under_review") {
            updateData.reviewed_by = req.user.id;
            updateData.reviewed_at = new Date();
        }
        if (body.status === "approved") {
            updateData.approved_by = req.user.id;
            updateData.approved_at = new Date();
        }
        const [updated] = await db_1.db
            .update(schema_1.sample_requests)
            .set(updateData)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.sample_requests.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.sample_requests.tenant_id, req.tenantId)))
            .returning();
        if (!updated) {
            throw new errorHandler_1.AppError(404, "Request not found");
        }
        logger_1.logger.info(`Sample request updated: ${updated.request_number} by ${req.user.id}`);
        // Send approval email if status changed to approved
        if (body.status === "approved" && body.quotation_amount) {
            const [requestWithClient] = await db_1.db
                .select({
                request: schema_1.sample_requests,
                client: schema_1.clients,
            })
                .from(schema_1.sample_requests)
                .leftJoin(schema_1.clients, (0, drizzle_orm_1.eq)(schema_1.sample_requests.client_id, schema_1.clients.id))
                .where((0, drizzle_orm_1.eq)(schema_1.sample_requests.id, req.params.id))
                .limit(1);
            if (requestWithClient?.client?.email) {
                (0, emailService_1.sendRequestApprovalEmail)({
                    requestNumber: updated.request_number,
                    clientName: requestWithClient.client.name,
                    clientEmail: requestWithClient.client.email,
                    quotationAmount: body.quotation_amount,
                }).catch((err) => logger_1.logger.error("Approval email failed:", err));
            }
        }
        res.json({ success: true, data: updated });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            throw new errorHandler_1.AppError(400, error.errors[0].message);
        }
        throw error;
    }
});
// ─── POST /sample-requests/:id/convert-to-sample ──────────────────────────────
router.post("/:id/convert-to-sample", auth_1.authenticate, (0, auth_1.requireRole)(...auth_1.STAFF_ROLES), async (req, res) => {
    try {
        const [request] = await db_1.db
            .select()
            .from(schema_1.sample_requests)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.sample_requests.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.sample_requests.tenant_id, req.tenantId)))
            .limit(1);
        if (!request) {
            throw new errorHandler_1.AppError(404, "Request not found");
        }
        if (request.sample_id) {
            throw new errorHandler_1.AppError(400, "Request already converted to sample");
        }
        // Generate ULID for sample
        const { generateULID } = await Promise.resolve().then(() => __importStar(require("../services/barcodeService")));
        const ulid = generateULID();
        // Create sample from request
        const [sample] = await db_1.db
            .insert(schema_1.samples)
            .values({
            tenant_id: req.tenantId,
            ulid,
            client_id: request.client_id,
            name: request.product_name || "Sample from Request",
            description: request.intended_use,
            matrix: request.matrix,
            collection_date: request.production_date,
            storage_location: req.body.storage_location,
            assigned_analyst_id: req.body.assigned_analyst_id,
            sample_container: request.sample_container,
            sample_volume: request.sample_volume,
            reference_standard: request.reference_standard,
            batch_number: request.batch_number,
            sample_condition: request.sample_condition,
            temperature_on_receipt: request.temperature_on_receipt,
            sampling_point: request.sampling_point,
            production_date: request.production_date,
            expiry_date: request.expiry_date,
            manufacturer: request.manufacturer,
            received_by: req.user.id,
            status: "received",
        })
            .returning();
        // Update request with sample_id
        await db_1.db
            .update(schema_1.sample_requests)
            .set({
            sample_id: sample.id,
            status: "sample_received",
            updated_at: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(schema_1.sample_requests.id, req.params.id));
        logger_1.logger.info(`Request ${request.request_number} converted to sample ${ulid}`);
        res.json({
            success: true,
            data: sample,
            message: `Sample ${ulid} created successfully`,
        });
    }
    catch (error) {
        throw error;
    }
});
exports.default = router;
//# sourceMappingURL=sample-requests.js.map