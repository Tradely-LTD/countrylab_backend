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
exports.invoicesRouter = exports.notificationsRouter = exports.dashboardRouter = exports.auditRouter = exports.usersRouter = exports.clientsRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const auth_1 = require("../middleware/auth");
const audit_1 = require("../middleware/audit");
const errorHandler_1 = require("../middleware/errorHandler");
const supabase_js_1 = require("@supabase/supabase-js");
const drizzle_orm_2 = require("drizzle-orm");
// ════════════════════════════════════════════════════════════════
// CLIENTS ROUTER
// ════════════════════════════════════════════════════════════════
exports.clientsRouter = (0, express_1.Router)();
const clientSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(255),
    company: zod_1.z.string().optional(),
    email: zod_1.z.string().email().optional(),
    phone: zod_1.z.string().optional(),
    address: zod_1.z.string().optional(),
    contact_person: zod_1.z.string().optional(),
    notes: zod_1.z.string().optional(),
});
exports.clientsRouter.get("/", auth_1.authenticate, async (req, res) => {
    const { search } = req.query;
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.clients.tenant_id, req.tenantId)];
    if (search)
        conditions.push((0, drizzle_orm_1.sql) `(${schema_1.clients.name} ILIKE ${"%" + search + "%"} OR ${schema_1.clients.company} ILIKE ${"%" + search + "%"})`);
    const list = await db_1.db
        .select()
        .from(schema_1.clients)
        .where((0, drizzle_orm_1.and)(...conditions))
        .orderBy(schema_1.clients.name);
    res.json({ data: list });
});
exports.clientsRouter.get("/:id", auth_1.authenticate, async (req, res) => {
    const [client] = await db_1.db
        .select()
        .from(schema_1.clients)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.clients.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.clients.tenant_id, req.tenantId)))
        .limit(1);
    if (!client)
        throw new errorHandler_1.AppError(404, "Client not found");
    res.json({ data: client });
});
exports.clientsRouter.post("/", auth_1.authenticate, (0, auth_1.requireRole)("super_admin", "md", "quality_manager", "business_development", "finance"), async (req, res) => {
    const body = clientSchema.parse(req.body);
    const [newClient] = await db_1.db
        .insert(schema_1.clients)
        .values({ tenant_id: req.tenantId, ...body, created_by: req.user.id })
        .returning();
    await (0, audit_1.createAuditLog)({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        action: "CREATE",
        table_name: "clients",
        record_id: newClient.id,
    });
    res.status(201).json({ data: newClient });
});
exports.clientsRouter.put("/:id", auth_1.authenticate, (0, auth_1.requireRole)("super_admin", "md", "quality_manager", "business_development", "finance"), async (req, res) => {
    const body = clientSchema.partial().parse(req.body);
    const [updated] = await db_1.db
        .update(schema_1.clients)
        .set({ ...body, updated_at: new Date() })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.clients.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.clients.tenant_id, req.tenantId)))
        .returning();
    if (!updated)
        throw new errorHandler_1.AppError(404, "Client not found");
    res.json({ data: updated });
});
// Get client history (invoices, samples, sample requests)
exports.clientsRouter.get("/:id/history", auth_1.authenticate, async (req, res) => {
    const { id } = req.params;
    console.log("Fetching history for client:", id, "tenant:", req.tenantId);
    // Get invoices for this client
    const clientInvoices = await db_1.db
        .select({
        id: schema_1.invoices.id,
        invoice_number: schema_1.invoices.invoice_number,
        invoice_date: schema_1.invoices.created_at,
        total_amount: schema_1.invoices.total,
        status: schema_1.invoices.status,
    })
        .from(schema_1.invoices)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.invoices.client_id, id), (0, drizzle_orm_1.eq)(schema_1.invoices.tenant_id, req.tenantId)))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.invoices.created_at))
        .limit(20);
    console.log("Found invoices:", clientInvoices.length);
    // Get sample requests for this client
    const sampleRequests = await db_1.db
        .select({
        id: schema_1.sample_requests.id,
        request_number: schema_1.sample_requests.request_number,
        sample_description: schema_1.sample_requests.product_name,
        status: schema_1.sample_requests.status,
        created_at: schema_1.sample_requests.created_at,
    })
        .from(schema_1.sample_requests)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.sample_requests.client_id, id), (0, drizzle_orm_1.eq)(schema_1.sample_requests.tenant_id, req.tenantId)))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.sample_requests.created_at))
        .limit(20);
    console.log("Found sample requests:", sampleRequests.length);
    // Get samples for this client
    const clientSamples = await db_1.db
        .select({
        id: schema_1.samples.id,
        sample_id: schema_1.samples.ulid,
        sample_name: schema_1.samples.name,
        status: schema_1.samples.status,
        received_date: schema_1.samples.received_at,
    })
        .from(schema_1.samples)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.samples.client_id, id), (0, drizzle_orm_1.eq)(schema_1.samples.tenant_id, req.tenantId)))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.samples.received_at))
        .limit(20);
    console.log("Found samples:", clientSamples.length);
    res.json({
        success: true,
        data: {
            invoices: clientInvoices,
            sample_requests: sampleRequests,
            samples: clientSamples,
        },
    });
});
// ════════════════════════════════════════════════════════════════
// USERS / TEAM ROUTER
// ════════════════════════════════════════════════════════════════
exports.usersRouter = (0, express_1.Router)();
const adminSupabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
// Get current user profile
exports.usersRouter.get("/me", auth_1.authenticate, async (req, res) => {
    const [user] = await db_1.db
        .select({
        id: schema_1.users.id,
        email: schema_1.users.email,
        full_name: schema_1.users.full_name,
        role: schema_1.users.role,
        department: schema_1.users.department,
        tenant_id: schema_1.users.tenant_id,
        avatar_url: schema_1.users.avatar_url,
        phone: schema_1.users.phone,
        is_active: schema_1.users.is_active,
    })
        .from(schema_1.users)
        .where((0, drizzle_orm_1.eq)(schema_1.users.id, req.user.id))
        .limit(1);
    if (!user)
        throw new errorHandler_1.AppError(404, "User not found");
    res.json({ data: user });
});
exports.usersRouter.get("/", auth_1.authenticate, (0, auth_1.requireRole)(...auth_1.ADMIN_ROLES, "quality_manager"), async (req, res) => {
    const list = await db_1.db
        .select({
        id: schema_1.users.id,
        email: schema_1.users.email,
        full_name: schema_1.users.full_name,
        role: schema_1.users.role,
        department: schema_1.users.department,
        is_active: schema_1.users.is_active,
        last_login_at: schema_1.users.last_login_at,
        created_at: schema_1.users.created_at,
    })
        .from(schema_1.users)
        .where((0, drizzle_orm_1.eq)(schema_1.users.tenant_id, req.tenantId))
        .orderBy(schema_1.users.full_name);
    res.json({ data: list });
});
exports.usersRouter.post("/", auth_1.authenticate, (0, auth_1.requireRole)(...auth_1.ADMIN_ROLES), async (req, res) => {
    const body = zod_1.z
        .object({
        email: zod_1.z.string().email(),
        full_name: zod_1.z.string().min(1),
        role: zod_1.z.enum([
            "super_admin",
            "md",
            "quality_manager",
            "lab_analyst",
            "procurement_officer",
            "inventory_manager",
            "customer",
            "finance",
            "business_development",
        ]),
        department: zod_1.z.string().optional(),
        phone: zod_1.z.string().optional(),
    })
        .parse(req.body);
    // Create Supabase auth user
    const { data: authUser, error } = await adminSupabase.auth.admin.createUser({
        email: body.email,
        password: Math.random().toString(36).slice(-12) + "A1!",
        email_confirm: true,
    });
    if (error)
        throw new errorHandler_1.AppError(400, `Failed to create auth user: ${error.message}`);
    const [newUser] = await db_1.db
        .insert(schema_1.users)
        .values({
        tenant_id: req.tenantId,
        supabase_user_id: authUser.user.id,
        email: body.email,
        full_name: body.full_name,
        role: body.role,
        department: body.department,
        phone: body.phone,
        requires_2fa: ["md", "super_admin", "finance"].includes(body.role),
    })
        .returning();
    await (0, audit_1.createAuditLog)({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        action: "CREATE",
        table_name: "users",
        record_id: newUser.id,
    });
    res.status(201).json({
        data: newUser,
        message: "User created. An invitation email has been sent.",
    });
});
exports.usersRouter.patch("/:id", auth_1.authenticate, (0, auth_1.requireRole)(...auth_1.ADMIN_ROLES), async (req, res) => {
    const body = zod_1.z
        .object({
        full_name: zod_1.z.string().optional(),
        role: zod_1.z.string().optional(),
        department: zod_1.z.string().optional(),
        is_active: zod_1.z.boolean().optional(),
    })
        .parse(req.body);
    const [updated] = await db_1.db
        .update(schema_1.users)
        .set({ ...body, updated_at: new Date() })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.users.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.users.tenant_id, req.tenantId)))
        .returning();
    if (!updated)
        throw new errorHandler_1.AppError(404, "User not found");
    await (0, audit_1.createAuditLog)({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        action: "UPDATE",
        table_name: "users",
        record_id: updated.id,
    });
    res.json({ data: updated });
});
// ════════════════════════════════════════════════════════════════
// AUDIT LOGS ROUTER
// ════════════════════════════════════════════════════════════════
exports.auditRouter = (0, express_1.Router)();
exports.auditRouter.get("/", auth_1.authenticate, (0, auth_1.requireRole)("super_admin", "md", "quality_manager"), async (req, res) => {
    const { page = "1", limit = "50", action, table_name, user_id, from, to, } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.audit_logs.tenant_id, req.tenantId)];
    if (action)
        conditions.push((0, drizzle_orm_1.eq)(schema_1.audit_logs.action, action));
    if (table_name)
        conditions.push((0, drizzle_orm_1.eq)(schema_1.audit_logs.table_name, table_name));
    if (user_id)
        conditions.push((0, drizzle_orm_1.eq)(schema_1.audit_logs.user_id, user_id));
    if (from)
        conditions.push((0, drizzle_orm_1.gte)(schema_1.audit_logs.created_at, new Date(from)));
    const [logList, [{ count }]] = await Promise.all([
        db_1.db
            .select({
            id: schema_1.audit_logs.id,
            action: schema_1.audit_logs.action,
            table_name: schema_1.audit_logs.table_name,
            record_id: schema_1.audit_logs.record_id,
            ip_address: schema_1.audit_logs.ip_address,
            created_at: schema_1.audit_logs.created_at,
            metadata: schema_1.audit_logs.metadata,
            user: { full_name: schema_1.users.full_name, email: schema_1.users.email },
        })
            .from(schema_1.audit_logs)
            .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.audit_logs.user_id, schema_1.users.id))
            .where((0, drizzle_orm_1.and)(...conditions))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.audit_logs.created_at))
            .limit(parseInt(limit))
            .offset(offset),
        db_1.db
            .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(schema_1.audit_logs)
            .where((0, drizzle_orm_1.and)(...conditions)),
    ]);
    res.json({
        data: logList,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: count,
        },
    });
});
// ════════════════════════════════════════════════════════════════
// DASHBOARD ROUTER
// ════════════════════════════════════════════════════════════════
exports.dashboardRouter = (0, express_1.Router)();
exports.dashboardRouter.get("/widgets", auth_1.authenticate, async (req, res) => {
    const role = req.user.role;
    const tenantId = req.tenantId;
    const now = new Date();
    const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    // Get date range from query params or default to current month
    const startDate = req.query.startDate
        ? new Date(req.query.startDate)
        : new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = req.query.endDate
        ? new Date(req.query.endDate)
        : now;
    const [sampleStats, pendingApprovals, lowStockReagents, expiringReagents, calibrationDue, monthRevenue, todaySamples,] = await Promise.all([
        db_1.db
            .select({ status: schema_1.samples.status, count: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(schema_1.samples)
            .where((0, drizzle_orm_1.eq)(schema_1.samples.tenant_id, tenantId))
            .groupBy(schema_1.samples.status),
        db_1.db
            .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(schema_1.results)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.results.tenant_id, tenantId), (0, drizzle_orm_1.sql) `${schema_1.results.overall_status} IN ('submitted', 'under_review')`)),
        db_1.db
            .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(schema_1.reagents)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.reagents.tenant_id, tenantId), (0, drizzle_orm_1.sql) `${schema_1.reagents.quantity} <= ${schema_1.reagents.reorder_level}`)),
        db_1.db
            .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(schema_1.reagents)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.reagents.tenant_id, tenantId), (0, drizzle_orm_2.lte)(schema_1.reagents.expiry_date, thirtyDays), (0, drizzle_orm_1.sql) `${schema_1.reagents.expiry_date} > ${now}`)),
        db_1.db
            .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(schema_1.assets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.assets.tenant_id, tenantId), (0, drizzle_orm_2.lte)(schema_1.assets.next_calibration_date, thirtyDays))),
        ["md", "super_admin", "finance"].includes(role)
            ? db_1.db
                .select({
                total: (0, drizzle_orm_1.sql) `COALESCE(SUM(${schema_1.invoices.total}), 0)::float`,
            })
                .from(schema_1.invoices)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.invoices.tenant_id, tenantId), (0, drizzle_orm_1.gte)(schema_1.invoices.created_at, startDate), (0, drizzle_orm_2.lte)(schema_1.invoices.created_at, endDate), (0, drizzle_orm_1.eq)(schema_1.invoices.status, "paid")))
            : [{ total: 0 }],
        db_1.db
            .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(schema_1.samples)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.samples.tenant_id, tenantId), (0, drizzle_orm_1.gte)(schema_1.samples.received_at, new Date(now.setHours(0, 0, 0, 0))))),
    ]);
    const pendingResult = pendingApprovals[0] || { count: 0 };
    res.json({
        data: {
            samples: {
                byStatus: sampleStats,
                todayCount: todaySamples[0]?.count || 0,
            },
            pendingApprovals: pendingResult.count || 0,
            inventory: {
                lowStock: lowStockReagents[0]?.count || 0,
                expiringSoon: expiringReagents[0]?.count || 0,
            },
            assets: {
                calibrationDue: calibrationDue[0]?.count || 0,
            },
            finance: {
                monthRevenue: monthRevenue[0]?.total || 0,
            },
        },
    });
});
exports.dashboardRouter.get("/recent-activity", auth_1.authenticate, async (req, res) => {
    const recentSamples = await db_1.db
        .select({
        id: schema_1.samples.id,
        ulid: schema_1.samples.ulid,
        name: schema_1.samples.name,
        status: schema_1.samples.status,
        received_at: schema_1.samples.received_at,
        client: { name: schema_1.clients.name },
    })
        .from(schema_1.samples)
        .leftJoin(schema_1.clients, (0, drizzle_orm_1.eq)(schema_1.samples.client_id, schema_1.clients.id))
        .where((0, drizzle_orm_1.eq)(schema_1.samples.tenant_id, req.tenantId))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.samples.received_at))
        .limit(5);
    const recentApprovals = await db_1.db
        .select({
        id: schema_1.results.id,
        approved_at: schema_1.results.approved_at,
        sample: { ulid: schema_1.samples.ulid, name: schema_1.samples.name },
    })
        .from(schema_1.results)
        .leftJoin(schema_1.samples, (0, drizzle_orm_1.eq)(schema_1.results.sample_id, schema_1.samples.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.results.tenant_id, req.tenantId), (0, drizzle_orm_1.eq)(schema_1.results.overall_status, "approved")))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.results.approved_at))
        .limit(5);
    res.json({ data: { recentSamples, recentApprovals } });
});
// ════════════════════════════════════════════════════════════════
// NOTIFICATIONS ROUTER
// ════════════════════════════════════════════════════════════════
exports.notificationsRouter = (0, express_1.Router)();
exports.notificationsRouter.get("/", auth_1.authenticate, async (req, res) => {
    const list = await db_1.db
        .select()
        .from(schema_1.notifications)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.notifications.user_id, req.user.id), (0, drizzle_orm_1.eq)(schema_1.notifications.tenant_id, req.tenantId)))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.notifications.created_at))
        .limit(30);
    const unreadCount = list.filter((n) => !n.is_read).length;
    res.json({ data: list, unreadCount });
});
exports.notificationsRouter.patch("/:id/read", auth_1.authenticate, async (req, res) => {
    await db_1.db
        .update(schema_1.notifications)
        .set({ is_read: true })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.notifications.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.notifications.user_id, req.user.id)));
    res.json({ success: true });
});
exports.notificationsRouter.patch("/mark-all-read", auth_1.authenticate, async (req, res) => {
    await db_1.db
        .update(schema_1.notifications)
        .set({ is_read: true })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.notifications.user_id, req.user.id), (0, drizzle_orm_1.eq)(schema_1.notifications.tenant_id, req.tenantId)));
    res.json({ success: true });
});
// ════════════════════════════════════════════════════════════════
// INVOICES ROUTER
// ════════════════════════════════════════════════════════════════
exports.invoicesRouter = (0, express_1.Router)();
exports.invoicesRouter.get("/", auth_1.authenticate, (0, auth_1.requireRole)("super_admin", "md", "finance", "business_development"), async (req, res) => {
    const { status, client_id } = req.query;
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.invoices.tenant_id, req.tenantId)];
    if (status)
        conditions.push((0, drizzle_orm_1.eq)(schema_1.invoices.status, status));
    if (client_id)
        conditions.push((0, drizzle_orm_1.eq)(schema_1.invoices.client_id, client_id));
    const list = await db_1.db
        .select({
        id: schema_1.invoices.id,
        invoice_number: schema_1.invoices.invoice_number,
        total: schema_1.invoices.total,
        subtotal: schema_1.invoices.subtotal,
        tax_rate: schema_1.invoices.tax_rate,
        tax_amount: schema_1.invoices.tax_amount,
        currency: schema_1.invoices.currency,
        status: schema_1.invoices.status,
        due_date: schema_1.invoices.due_date,
        paid_at: schema_1.invoices.paid_at,
        payment_method: schema_1.invoices.payment_method,
        created_at: schema_1.invoices.created_at,
        client: {
            id: schema_1.clients.id,
            name: schema_1.clients.name,
            company: schema_1.clients.company,
            email: schema_1.clients.email,
            phone: schema_1.clients.phone,
            address: schema_1.clients.address,
        },
    })
        .from(schema_1.invoices)
        .leftJoin(schema_1.clients, (0, drizzle_orm_1.eq)(schema_1.invoices.client_id, schema_1.clients.id))
        .where((0, drizzle_orm_1.and)(...conditions))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.invoices.created_at));
    res.json({ data: list });
});
exports.invoicesRouter.get("/:id", auth_1.authenticate, (0, auth_1.requireRole)("super_admin", "md", "finance", "business_development"), async (req, res) => {
    const [invoice] = await db_1.db
        .select({
        id: schema_1.invoices.id,
        invoice_number: schema_1.invoices.invoice_number,
        line_items: schema_1.invoices.line_items,
        subtotal: schema_1.invoices.subtotal,
        tax_rate: schema_1.invoices.tax_rate,
        tax_amount: schema_1.invoices.tax_amount,
        total: schema_1.invoices.total,
        currency: schema_1.invoices.currency,
        status: schema_1.invoices.status,
        due_date: schema_1.invoices.due_date,
        paid_at: schema_1.invoices.paid_at,
        payment_method: schema_1.invoices.payment_method,
        notes: schema_1.invoices.notes,
        created_at: schema_1.invoices.created_at,
        updated_at: schema_1.invoices.updated_at,
        client: {
            id: schema_1.clients.id,
            name: schema_1.clients.name,
            company: schema_1.clients.company,
            email: schema_1.clients.email,
            phone: schema_1.clients.phone,
            address: schema_1.clients.address,
            contact_person: schema_1.clients.contact_person,
        },
        sample: {
            id: schema_1.samples.id,
            ulid: schema_1.samples.ulid,
            name: schema_1.samples.name,
        },
    })
        .from(schema_1.invoices)
        .leftJoin(schema_1.clients, (0, drizzle_orm_1.eq)(schema_1.invoices.client_id, schema_1.clients.id))
        .leftJoin(schema_1.samples, (0, drizzle_orm_1.eq)(schema_1.invoices.sample_id, schema_1.samples.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.invoices.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.invoices.tenant_id, req.tenantId)))
        .limit(1);
    if (!invoice)
        throw new errorHandler_1.AppError(404, "Invoice not found");
    // Get tenant/organization info
    const [tenant] = await db_1.db
        .select()
        .from(schema_1.tenants)
        .where((0, drizzle_orm_1.eq)(schema_1.tenants.id, req.tenantId))
        .limit(1);
    res.json({ data: { ...invoice, organization: tenant } });
});
exports.invoicesRouter.post("/", auth_1.authenticate, (0, auth_1.requireRole)("super_admin", "md", "finance", "business_development"), async (req, res) => {
    const body = zod_1.z
        .object({
        client_id: zod_1.z.string().uuid(),
        sample_id: zod_1.z.string().uuid().optional().or(zod_1.z.literal("")),
        result_id: zod_1.z.string().uuid().optional().or(zod_1.z.literal("")),
        request_id: zod_1.z.string().uuid().optional(), // Add request_id
        line_items: zod_1.z.array(zod_1.z.object({
            description: zod_1.z.string(),
            quantity: zod_1.z.number(),
            unit_price: zod_1.z.number(),
            amount: zod_1.z.number(),
        })),
        tax_rate: zod_1.z.number().default(7.5), // Default VAT in Nigeria
        due_date: zod_1.z.string().optional().or(zod_1.z.literal("")),
        notes: zod_1.z.string().optional(),
        currency: zod_1.z.string().default("NGN"),
    })
        .parse(req.body);
    const subtotal = body.line_items.reduce((sum, item) => sum + item.amount, 0);
    const taxAmount = subtotal * (body.tax_rate / 100);
    const total = subtotal + taxAmount;
    // Generate invoice number with date prefix
    const now = new Date();
    const datePrefix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const randomSuffix = Math.floor(Math.random() * 10000)
        .toString()
        .padStart(4, "0");
    const invNum = `INV${datePrefix}-${randomSuffix}`;
    const [inv] = await db_1.db
        .insert(schema_1.invoices)
        .values({
        tenant_id: req.tenantId,
        invoice_number: invNum,
        client_id: body.client_id,
        sample_id: body.sample_id && body.sample_id !== "" ? body.sample_id : undefined,
        result_id: body.result_id && body.result_id !== "" ? body.result_id : undefined,
        line_items: body.line_items,
        subtotal,
        tax_rate: body.tax_rate,
        tax_amount: taxAmount,
        total,
        currency: body.currency,
        due_date: body.due_date && body.due_date !== ""
            ? new Date(body.due_date)
            : null,
        notes: body.notes,
        created_by: req.user.id,
    })
        .returning();
    // If request_id is provided, link the invoice to the request
    if (body.request_id) {
        const { sample_requests } = await Promise.resolve().then(() => __importStar(require("../db/schema")));
        await db_1.db
            .update(sample_requests)
            .set({
            invoice_id: inv.id,
            invoice_issued: true,
            updated_at: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(sample_requests.id, body.request_id));
    }
    await (0, audit_1.createAuditLog)({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        action: "CREATE",
        table_name: "invoices",
        record_id: inv.id,
    });
    res.status(201).json({ data: inv });
});
exports.invoicesRouter.put("/:id", auth_1.authenticate, (0, auth_1.requireRole)("super_admin", "md", "finance"), async (req, res) => {
    const body = zod_1.z
        .object({
        line_items: zod_1.z
            .array(zod_1.z.object({
            description: zod_1.z.string(),
            quantity: zod_1.z.number(),
            unit_price: zod_1.z.number(),
            amount: zod_1.z.number(),
        }))
            .optional(),
        tax_rate: zod_1.z.number().optional(),
        due_date: zod_1.z.string().datetime().optional(),
        notes: zod_1.z.string().optional(),
        status: zod_1.z.enum(["unpaid", "paid", "partial", "voided"]).optional(),
    })
        .parse(req.body);
    const [existing] = await db_1.db
        .select()
        .from(schema_1.invoices)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.invoices.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.invoices.tenant_id, req.tenantId)))
        .limit(1);
    if (!existing)
        throw new errorHandler_1.AppError(404, "Invoice not found");
    if (existing.status === "paid") {
        throw new errorHandler_1.AppError(400, "Cannot edit a paid invoice");
    }
    let updateData = { updated_at: new Date() };
    if (body.line_items) {
        const subtotal = body.line_items.reduce((sum, item) => sum + item.amount, 0);
        const taxRate = body.tax_rate ?? existing.tax_rate ?? 0;
        const taxAmount = subtotal * (taxRate / 100);
        const total = subtotal + taxAmount;
        updateData = {
            ...updateData,
            line_items: body.line_items,
            subtotal,
            tax_rate: taxRate,
            tax_amount: taxAmount,
            total,
        };
    }
    if (body.due_date)
        updateData.due_date = new Date(body.due_date);
    if (body.notes !== undefined)
        updateData.notes = body.notes;
    if (body.status)
        updateData.status = body.status;
    const [updated] = await db_1.db
        .update(schema_1.invoices)
        .set(updateData)
        .where((0, drizzle_orm_1.eq)(schema_1.invoices.id, req.params.id))
        .returning();
    await (0, audit_1.createAuditLog)({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        action: "UPDATE",
        table_name: "invoices",
        record_id: updated.id,
    });
    res.json({ data: updated });
});
exports.invoicesRouter.patch("/:id/payment", auth_1.authenticate, (0, auth_1.requireRole)("super_admin", "md", "finance"), async (req, res) => {
    const { payment_method } = zod_1.z
        .object({ payment_method: zod_1.z.string() })
        .parse(req.body);
    const [updated] = await db_1.db
        .update(schema_1.invoices)
        .set({
        status: "paid",
        paid_at: new Date(),
        payment_method,
        updated_at: new Date(),
    })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.invoices.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.invoices.tenant_id, req.tenantId)))
        .returning();
    if (!updated)
        throw new errorHandler_1.AppError(404, "Invoice not found");
    await (0, audit_1.createAuditLog)({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        action: "UPDATE",
        table_name: "invoices",
        record_id: updated.id,
        metadata: { action: "mark_paid", payment_method },
    });
    res.json({ data: updated });
});
exports.invoicesRouter.delete("/:id", auth_1.authenticate, (0, auth_1.requireRole)("super_admin", "md"), async (req, res) => {
    const [existing] = await db_1.db
        .select()
        .from(schema_1.invoices)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.invoices.id, req.params.id), (0, drizzle_orm_1.eq)(schema_1.invoices.tenant_id, req.tenantId)))
        .limit(1);
    if (!existing)
        throw new errorHandler_1.AppError(404, "Invoice not found");
    if (existing.status === "paid") {
        throw new errorHandler_1.AppError(400, "Cannot delete a paid invoice");
    }
    const [voided] = await db_1.db
        .update(schema_1.invoices)
        .set({ status: "voided", updated_at: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.invoices.id, req.params.id))
        .returning();
    await (0, audit_1.createAuditLog)({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        action: "DELETE",
        table_name: "invoices",
        record_id: voided.id,
    });
    res.json({ message: "Invoice voided successfully" });
});
//# sourceMappingURL=misc-routes.js.map