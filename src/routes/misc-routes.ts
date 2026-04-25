import { Router, Request, Response } from "express";
import { z } from "zod";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { db } from "../db";
import {
  clients,
  users,
  client_interactions,
  audit_logs,
  samples,
  results,
  reagents,
  assets,
  requisitions,
  invoices,
  notifications,
  tenants,
  sample_requests,
} from "../db/schema";
import {
  authenticate,
  requireRole,
  ADMIN_ROLES,
  STAFF_ROLES,
} from "../middleware/auth";
import { createAuditLog } from "../middleware/audit";
import { AppError } from "../middleware/errorHandler";
import { computeInvoiceTotals } from "../utils/invoiceComputation";
import { createClient as supabaseAdmin } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { lt } from "drizzle-orm";
import { sendPasswordResetEmail } from "../services/emailService";

// ════════════════════════════════════════════════════════════════
// CLIENTS ROUTER
// ════════════════════════════════════════════════════════════════
export const clientsRouter = Router();

const clientSchema = z.object({
  name: z.string().min(1).max(255),
  company: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  contact_person: z.string().optional(),
  notes: z.string().optional(),
});

clientsRouter.get("/", authenticate, async (req: Request, res: Response) => {
  const { search, created_by, from, to, status } = req.query as {
    search?: string;
    created_by?: string;
    from?: string;
    to?: string;
    status?: string;
  };

  const conditions = [eq(clients.tenant_id, req.tenantId!)];

  if (search)
    conditions.push(
      sql`(${clients.name} ILIKE ${"%" + search + "%"} OR ${clients.company} ILIKE ${"%" + search + "%"})`,
    );

  if (created_by) conditions.push(eq(clients.created_by, created_by));

  if (from) conditions.push(gte(clients.created_at, new Date(from)));
  if (to) {
    // inclusive: set time to end of day
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    conditions.push(lte(clients.created_at, toDate));
  }

  if (status && (status === "lead" || status === "active"))
    conditions.push(eq(clients.client_status, status));

  const whereClause = and(...conditions);

  // Alias users table for the join
  const creatorAlias = users;

  const [list, totalResult, leadsResult, interactionsResult] =
    await Promise.all([
      db
        .select({
          id: clients.id,
          tenant_id: clients.tenant_id,
          name: clients.name,
          company: clients.company,
          email: clients.email,
          phone: clients.phone,
          address: clients.address,
          city: clients.city,
          state: clients.state,
          postal_code: clients.postal_code,
          country: clients.country,
          tax_id: clients.tax_id,
          website: clients.website,
          contact_person: clients.contact_person,
          notes: clients.notes,
          is_active: clients.is_active,
          client_status: clients.client_status,
          created_by: clients.created_by,
          created_at: clients.created_at,
          updated_at: clients.updated_at,
          creator_name: creatorAlias.full_name,
        })
        .from(clients)
        .leftJoin(creatorAlias, eq(clients.created_by, creatorAlias.id))
        .where(whereClause)
        .orderBy(clients.name),

      db
        .select({ count: sql<number>`count(*)::int` })
        .from(clients)
        .where(whereClause),

      db
        .select({ count: sql<number>`count(*)::int` })
        .from(clients)
        .where(and(whereClause, eq(clients.client_status, "lead"))),

      db
        .select({ count: sql<number>`count(*)::int` })
        .from(client_interactions)
        .where(
          and(
            eq(client_interactions.tenant_id, req.tenantId!),
            // scope interactions to clients matching the same filters
            created_by
              ? sql`${client_interactions.client_id} IN (SELECT id FROM countrylab_lms.clients WHERE tenant_id = ${req.tenantId!} AND created_by = ${created_by})`
              : sql`${client_interactions.client_id} IN (SELECT id FROM countrylab_lms.clients WHERE tenant_id = ${req.tenantId!})`,
          ),
        ),
    ]);

  res.json({
    data: list,
    summary: {
      total: totalResult[0]?.count ?? 0,
      leads: leadsResult[0]?.count ?? 0,
      interactions: interactionsResult[0]?.count ?? 0,
    },
  });
});

// GET /clients/export — must be registered BEFORE /:id to avoid path conflict
clientsRouter.get(
  "/export",
  authenticate,
  async (req: Request, res: Response) => {
    const { created_by, from, to, status } = req.query as {
      created_by?: string;
      from?: string;
      to?: string;
      status?: string;
    };

    const conditions = [eq(clients.tenant_id, req.tenantId!)];

    if (created_by) conditions.push(eq(clients.created_by, created_by));

    if (from) conditions.push(gte(clients.created_at, new Date(from)));
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      conditions.push(lte(clients.created_at, toDate));
    }

    if (status && (status === "lead" || status === "active"))
      conditions.push(eq(clients.client_status, status));

    const list = await db
      .select({
        name: clients.name,
        company: clients.company,
        contact_person: clients.contact_person,
        email: clients.email,
        phone: clients.phone,
        created_at: clients.created_at,
        creator_name: users.full_name,
      })
      .from(clients)
      .leftJoin(users, eq(clients.created_by, users.id))
      .where(and(...conditions))
      .orderBy(clients.name);

    if (list.length === 0) {
      res.status(400).json({ message: "No data to export" });
      return;
    }

    const csvEscape = (v: any) =>
      '"' + String(v ?? "").replace(/"/g, '""') + '"';

    const header =
      "Client Name,Company,Contact Person,Email,Phone,Created By,Created Date";
    const rows = list.map((r) =>
      [
        csvEscape(r.name),
        csvEscape(r.company),
        csvEscape(r.contact_person),
        csvEscape(r.email),
        csvEscape(r.phone),
        csvEscape(r.creator_name),
        csvEscape(
          r.created_at
            ? new Date(r.created_at).toISOString().split("T")[0]
            : "",
        ),
      ].join(","),
    );

    const csv = [header, ...rows].join("\r\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="clients-export.csv"',
    );
    res.send(csv);
  },
);

clientsRouter.get("/:id", authenticate, async (req: Request, res: Response) => {
  const [client] = await db
    .select()
    .from(clients)
    .where(
      and(eq(clients.id, req.params.id), eq(clients.tenant_id, req.tenantId!)),
    )
    .limit(1);
  if (!client) throw new AppError(404, "Client not found");
  res.json({ data: client });
});

clientsRouter.post(
  "/",
  authenticate,
  requireRole(
    "super_admin",
    "md",
    "quality_manager",
    "business_development",
    "finance",
    "marketer",
  ),
  async (req: Request, res: Response) => {
    const body = clientSchema.parse(req.body);
    const [newClient] = await db
      .insert(clients)
      .values({ tenant_id: req.tenantId!, ...body, created_by: req.user!.id })
      .returning();
    await createAuditLog({
      tenant_id: req.tenantId!,
      user_id: req.user!.id,
      action: "CREATE",
      table_name: "clients",
      record_id: newClient.id,
    });
    res.status(201).json({ data: newClient });
  },
);

clientsRouter.put(
  "/:id",
  authenticate,
  requireRole(
    "super_admin",
    "md",
    "quality_manager",
    "business_development",
    "finance",
  ),
  async (req: Request, res: Response) => {
    const body = clientSchema.partial().parse(req.body);
    const [updated] = await db
      .update(clients)
      .set({ ...body, updated_at: new Date() })
      .where(
        and(
          eq(clients.id, req.params.id),
          eq(clients.tenant_id, req.tenantId!),
        ),
      )
      .returning();
    if (!updated) throw new AppError(404, "Client not found");
    res.json({ data: updated });
  },
);

// Get client history (invoices, samples, sample requests)
clientsRouter.get(
  "/:id/history",
  authenticate,
  async (req: Request, res: Response) => {
    const { id } = req.params;

    console.log("Fetching history for client:", id, "tenant:", req.tenantId);

    // Get invoices for this client
    const clientInvoices = await db
      .select({
        id: invoices.id,
        invoice_number: invoices.invoice_number,
        invoice_date: invoices.created_at,
        total_amount: invoices.total,
        status: invoices.status,
      })
      .from(invoices)
      .where(
        and(eq(invoices.client_id, id), eq(invoices.tenant_id, req.tenantId!)),
      )
      .orderBy(desc(invoices.created_at))
      .limit(20);

    console.log("Found invoices:", clientInvoices.length);

    // Get sample requests for this client
    const sampleRequests = await db
      .select({
        id: sample_requests.id,
        request_number: sample_requests.request_number,
        sample_description: sample_requests.product_name,
        status: sample_requests.status,
        created_at: sample_requests.created_at,
      })
      .from(sample_requests)
      .where(
        and(
          eq(sample_requests.client_id, id),
          eq(sample_requests.tenant_id, req.tenantId!),
        ),
      )
      .orderBy(desc(sample_requests.created_at))
      .limit(20);

    console.log("Found sample requests:", sampleRequests.length);

    // Get samples for this client
    const clientSamples = await db
      .select({
        id: samples.id,
        sample_id: samples.ulid,
        sample_name: samples.name,
        status: samples.status,
        received_date: samples.received_at,
      })
      .from(samples)
      .where(
        and(eq(samples.client_id, id), eq(samples.tenant_id, req.tenantId!)),
      )
      .orderBy(desc(samples.received_at))
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
  },
);

// PATCH /clients/:id/status — update lead/active status
clientsRouter.patch(
  "/:id/status",
  authenticate,
  requireRole(
    "super_admin",
    "md",
    "quality_manager",
    "business_development",
    "finance",
  ),
  async (req: Request, res: Response) => {
    const { status } = z
      .object({ status: z.enum(["lead", "active"]) })
      .parse(req.body);

    const [updated] = await db
      .update(clients)
      .set({ client_status: status, updated_at: new Date() })
      .where(
        and(
          eq(clients.id, req.params.id),
          eq(clients.tenant_id, req.tenantId!),
        ),
      )
      .returning();

    if (!updated) throw new AppError(404, "Client not found");

    await createAuditLog({
      tenant_id: req.tenantId!,
      user_id: req.user!.id,
      action: "UPDATE",
      table_name: "clients",
      record_id: updated.id,
      metadata: { action: "status_change", status },
    });

    res.json({ data: updated });
  },
);

// POST /clients/:id/interactions — log a CRM interaction
clientsRouter.post(
  "/:id/interactions",
  authenticate,
  requireRole(
    "super_admin",
    "md",
    "quality_manager",
    "business_development",
    "finance",
  ),
  async (req: Request, res: Response) => {
    const body = z
      .object({
        type: z.enum(["Call", "Email", "Visit", "Meeting", "Other"]),
        date: z.string(),
        notes: z.string().optional(),
        outcome: z
          .enum([
            "Interested",
            "Not Interested",
            "Follow-up Required",
            "Converted",
          ])
          .optional(),
      })
      .parse(req.body);

    // Verify client belongs to tenant
    const [client] = await db
      .select({ id: clients.id, client_status: clients.client_status })
      .from(clients)
      .where(
        and(
          eq(clients.id, req.params.id),
          eq(clients.tenant_id, req.tenantId!),
        ),
      )
      .limit(1);

    if (!client) throw new AppError(404, "Client not found");

    const [interaction] = await db
      .insert(client_interactions)
      .values({
        tenant_id: req.tenantId!,
        client_id: req.params.id,
        staff_id: req.user!.id,
        type: body.type,
        date: new Date(body.date),
        notes: body.notes,
        outcome: body.outcome,
      })
      .returning();

    // If outcome is Converted, promote client to active
    if (body.outcome === "Converted") {
      await db
        .update(clients)
        .set({ client_status: "active", updated_at: new Date() })
        .where(eq(clients.id, req.params.id));
    }

    // Return interaction with staff name
    const [result] = await db
      .select({
        id: client_interactions.id,
        tenant_id: client_interactions.tenant_id,
        client_id: client_interactions.client_id,
        staff_id: client_interactions.staff_id,
        type: client_interactions.type,
        date: client_interactions.date,
        notes: client_interactions.notes,
        outcome: client_interactions.outcome,
        created_at: client_interactions.created_at,
        staff_name: users.full_name,
      })
      .from(client_interactions)
      .leftJoin(users, eq(client_interactions.staff_id, users.id))
      .where(eq(client_interactions.id, interaction.id))
      .limit(1);

    res.status(201).json({ data: result });
  },
);

// GET /clients/:id/interactions — list interactions for a client
clientsRouter.get(
  "/:id/interactions",
  authenticate,
  async (req: Request, res: Response) => {
    const conditions = [
      eq(client_interactions.client_id, req.params.id),
      eq(client_interactions.tenant_id, req.tenantId!),
    ];

    // Staff can only see their own interactions
    if (req.user!.role === "staff") {
      conditions.push(eq(client_interactions.staff_id, req.user!.id));
    }

    const list = await db
      .select({
        id: client_interactions.id,
        tenant_id: client_interactions.tenant_id,
        client_id: client_interactions.client_id,
        staff_id: client_interactions.staff_id,
        type: client_interactions.type,
        date: client_interactions.date,
        notes: client_interactions.notes,
        outcome: client_interactions.outcome,
        created_at: client_interactions.created_at,
        staff_name: users.full_name,
      })
      .from(client_interactions)
      .leftJoin(users, eq(client_interactions.staff_id, users.id))
      .where(and(...conditions))
      .orderBy(desc(client_interactions.date));

    res.json({ data: list });
  },
);

// ════════════════════════════════════════════════════════════════
// USERS / TEAM ROUTER
// ════════════════════════════════════════════════════════════════
export const usersRouter = Router();

const adminSupabase = supabaseAdmin(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Get current user profile
usersRouter.get("/me", authenticate, async (req: Request, res: Response) => {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      full_name: users.full_name,
      role: users.role,
      department: users.department,
      tenant_id: users.tenant_id,
      avatar_url: users.avatar_url,
      phone: users.phone,
      is_active: users.is_active,
    })
    .from(users)
    .where(eq(users.id, req.user!.id))
    .limit(1);

  if (!user) throw new AppError(404, "User not found");
  res.json({ data: user });
});

usersRouter.get(
  "/",
  authenticate,
  requireRole(...ADMIN_ROLES, "quality_manager"),
  async (req: Request, res: Response) => {
    const list = await db
      .select({
        id: users.id,
        email: users.email,
        full_name: users.full_name,
        role: users.role,
        department: users.department,
        is_active: users.is_active,
        last_login_at: users.last_login_at,
        created_at: users.created_at,
      })
      .from(users)
      .where(eq(users.tenant_id, req.tenantId!))
      .orderBy(users.full_name);
    res.json({ data: list });
  },
);

usersRouter.post(
  "/",
  authenticate,
  requireRole(...ADMIN_ROLES),
  async (req: Request, res: Response) => {
    const body = z
      .object({
        email: z.string().email(),
        full_name: z.string().min(1),
        role: z.enum([
          "super_admin",
          "md",
          "quality_manager",
          "lab_analyst",
          "procurement_officer",
          "inventory_manager",
          "customer",
          "finance",
          "business_development",
          "marketer",
        ]),
        department: z.string().optional(),
        phone: z.string().optional(),
      })
      .parse(req.body);

    // Create Supabase auth user
    const { data: authUser, error } = await adminSupabase.auth.admin.createUser(
      {
        email: body.email,
        password: Math.random().toString(36).slice(-12) + "A1!",
        email_confirm: true,
      },
    );
    if (error)
      throw new AppError(400, `Failed to create auth user: ${error.message}`);

    // Auto-generate unique referral code for marketers (8-char alphanumeric)
    let referralCode: string | undefined;
    if (body.role === "marketer") {
      const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
      let code = "";
      for (let i = 0; i < 8; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
      referralCode = code;
    }

    const [newUser] = await db
      .insert(users)
      .values({
        tenant_id: req.tenantId!,
        supabase_user_id: authUser.user.id,
        email: body.email,
        full_name: body.full_name,
        role: body.role,
        department: body.department,
        phone: body.phone,
        requires_2fa: ["md", "super_admin", "finance"].includes(body.role),
        referral_code: referralCode,
      })
      .returning();

    await createAuditLog({
      tenant_id: req.tenantId!,
      user_id: req.user!.id,
      action: "CREATE",
      table_name: "users",
      record_id: newUser.id,
    });
    res.status(201).json({
      data: newUser,
      message: "User created. An invitation email has been sent.",
    });
  },
);

usersRouter.patch(
  "/:id",
  authenticate,
  requireRole(...ADMIN_ROLES),
  async (req: Request, res: Response) => {
    const body = z
      .object({
        full_name: z.string().optional(),
        role: z.string().optional(),
        department: z.string().optional(),
        is_active: z.boolean().optional(),
      })
      .parse(req.body);

    const [updated] = await db
      .update(users)
      .set({ ...(body as any), updated_at: new Date() })
      .where(
        and(eq(users.id, req.params.id), eq(users.tenant_id, req.tenantId!)),
      )
      .returning();
    if (!updated) throw new AppError(404, "User not found");
    await createAuditLog({
      tenant_id: req.tenantId!,
      user_id: req.user!.id,
      action: "UPDATE",
      table_name: "users",
      record_id: updated.id,
    });
    res.json({ data: updated });
  },
);

usersRouter.post(
  "/:id/reset-password",
  authenticate,
  requireRole(...ADMIN_ROLES),
  async (req: Request, res: Response) => {
    const [user] = await db
      .select({ id: users.id, email: users.email, full_name: users.full_name })
      .from(users)
      .where(
        and(eq(users.id, req.params.id), eq(users.tenant_id, req.tenantId!)),
      )
      .limit(1);

    if (!user) throw new AppError(404, "User not found");

    // Generate a secure recovery link via Supabase admin (does not send email)
    const { data: linkData, error } =
      await adminSupabase.auth.admin.generateLink({
        type: "recovery",
        email: user.email,
        options: {
          redirectTo: `${process.env.FRONTEND_URL || ""}/reset-password`,
        },
      });

    if (error || !linkData?.properties?.action_link)
      throw new AppError(400, `Failed to generate reset link: ${error?.message}`);

    // Send the link via the project's own SMTP (branded email)
    await sendPasswordResetEmail({
      recipientEmail: user.email,
      recipientName: user.full_name,
      resetLink: linkData.properties.action_link,
    });

    res.json({ message: "Password reset email sent." });
  },
);

// ════════════════════════════════════════════════════════════════
// AUDIT LOGS ROUTER
// ════════════════════════════════════════════════════════════════
export const auditRouter = Router();

auditRouter.get(
  "/",
  authenticate,
  requireRole("super_admin", "md", "quality_manager"),
  async (req: Request, res: Response) => {
    const {
      page = "1",
      limit = "50",
      action,
      table_name,
      user_id,
      from,
      to,
    } = req.query as Record<string, string>;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conditions = [eq(audit_logs.tenant_id, req.tenantId!)];
    if (action) conditions.push(eq(audit_logs.action, action));
    if (table_name) conditions.push(eq(audit_logs.table_name, table_name));
    if (user_id) conditions.push(eq(audit_logs.user_id, user_id));
    if (from) conditions.push(gte(audit_logs.created_at, new Date(from)));

    const [logList, [{ count }]] = await Promise.all([
      db
        .select({
          id: audit_logs.id,
          action: audit_logs.action,
          table_name: audit_logs.table_name,
          record_id: audit_logs.record_id,
          ip_address: audit_logs.ip_address,
          created_at: audit_logs.created_at,
          metadata: audit_logs.metadata,
          user: { full_name: users.full_name, email: users.email },
        })
        .from(audit_logs)
        .leftJoin(users, eq(audit_logs.user_id, users.id))
        .where(and(...conditions))
        .orderBy(desc(audit_logs.created_at))
        .limit(parseInt(limit))
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(audit_logs)
        .where(and(...conditions)),
    ]);

    res.json({
      data: logList,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
      },
    });
  },
);

// ════════════════════════════════════════════════════════════════
// DASHBOARD ROUTER
// ════════════════════════════════════════════════════════════════
export const dashboardRouter = Router();

dashboardRouter.get(
  "/widgets",
  authenticate,
  async (req: Request, res: Response) => {
    const role = req.user!.role;
    const tenantId = req.tenantId!;
    const now = new Date();
    const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Get date range from query params or default to current month
    const startDate = req.query.startDate
      ? new Date(req.query.startDate as string)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = req.query.endDate
      ? new Date(req.query.endDate as string)
      : now;

    const [
      sampleStats,
      pendingApprovals,
      lowStockReagents,
      expiringReagents,
      calibrationDue,
      monthRevenue,
      todaySamples,
    ] = await Promise.all([
      db
        .select({ status: samples.status, count: sql<number>`count(*)::int` })
        .from(samples)
        .where(eq(samples.tenant_id, tenantId))
        .groupBy(samples.status),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(results)
        .where(
          and(
            eq(results.tenant_id, tenantId),
            sql`${results.overall_status} IN ('submitted', 'under_review')`,
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(reagents)
        .where(
          and(
            eq(reagents.tenant_id, tenantId),
            sql`${reagents.quantity} <= ${reagents.reorder_level}`,
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(reagents)
        .where(
          and(
            eq(reagents.tenant_id, tenantId),
            lte(reagents.expiry_date, thirtyDays),
            sql`${reagents.expiry_date} > ${now}`,
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(assets)
        .where(
          and(
            eq(assets.tenant_id, tenantId),
            lte(assets.next_calibration_date, thirtyDays),
          ),
        ),
      ["md", "super_admin", "finance"].includes(role)
        ? db
            .select({
              total: sql<number>`COALESCE(SUM(${invoices.total}), 0)::float`,
            })
            .from(invoices)
            .where(
              and(
                eq(invoices.tenant_id, tenantId),
                gte(invoices.created_at, startDate),
                lte(invoices.created_at, endDate),
                eq(invoices.status, "paid"),
              ),
            )
        : [{ total: 0 }],
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(samples)
        .where(
          and(
            eq(samples.tenant_id, tenantId),
            gte(samples.received_at, new Date(now.setHours(0, 0, 0, 0))),
          ),
        ),
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
          monthRevenue: (monthRevenue[0] as any)?.total || 0,
        },
      },
    });
  },
);

dashboardRouter.get(
  "/recent-activity",
  authenticate,
  async (req: Request, res: Response) => {
    const recentSamples = await db
      .select({
        id: samples.id,
        ulid: samples.ulid,
        name: samples.name,
        status: samples.status,
        received_at: samples.received_at,
        client: { name: clients.name },
      })
      .from(samples)
      .leftJoin(clients, eq(samples.client_id, clients.id))
      .where(eq(samples.tenant_id, req.tenantId!))
      .orderBy(desc(samples.received_at))
      .limit(5);

    const recentApprovals = await db
      .select({
        id: results.id,
        approved_at: results.approved_at,
        sample: { ulid: samples.ulid, name: samples.name },
      })
      .from(results)
      .leftJoin(samples, eq(results.sample_id, samples.id))
      .where(
        and(
          eq(results.tenant_id, req.tenantId!),
          eq(results.overall_status, "approved"),
        ),
      )
      .orderBy(desc(results.approved_at))
      .limit(5);

    res.json({ data: { recentSamples, recentApprovals } });
  },
);

// ════════════════════════════════════════════════════════════════
// NOTIFICATIONS ROUTER
// ════════════════════════════════════════════════════════════════
export const notificationsRouter = Router();

notificationsRouter.get(
  "/",
  authenticate,
  async (req: Request, res: Response) => {
    const list = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.user_id, req.user!.id),
          eq(notifications.tenant_id, req.tenantId!),
        ),
      )
      .orderBy(desc(notifications.created_at))
      .limit(30);

    const unreadCount = list.filter((n) => !n.is_read).length;
    res.json({ data: list, unreadCount });
  },
);

notificationsRouter.patch(
  "/:id/read",
  authenticate,
  async (req: Request, res: Response) => {
    await db
      .update(notifications)
      .set({ is_read: true })
      .where(
        and(
          eq(notifications.id, req.params.id),
          eq(notifications.user_id, req.user!.id),
        ),
      );
    res.json({ success: true });
  },
);

notificationsRouter.patch(
  "/mark-all-read",
  authenticate,
  async (req: Request, res: Response) => {
    await db
      .update(notifications)
      .set({ is_read: true })
      .where(
        and(
          eq(notifications.user_id, req.user!.id),
          eq(notifications.tenant_id, req.tenantId!),
        ),
      );
    res.json({ success: true });
  },
);

// ════════════════════════════════════════════════════════════════
// INVOICES ROUTER
// ════════════════════════════════════════════════════════════════
export const invoicesRouter = Router();

invoicesRouter.get(
  "/",
  authenticate,
  requireRole("super_admin", "md", "finance", "business_development"),
  async (req: Request, res: Response) => {
    const { status, client_id } = req.query as Record<string, string>;
    const conditions = [eq(invoices.tenant_id, req.tenantId!)];

    if (status) conditions.push(eq(invoices.status, status));
    if (client_id) conditions.push(eq(invoices.client_id, client_id));

    const list = await db
      .select({
        id: invoices.id,
        invoice_number: invoices.invoice_number,
        total: invoices.total,
        subtotal: invoices.subtotal,
        tax_rate: invoices.tax_rate,
        tax_amount: invoices.tax_amount,
        currency: invoices.currency,
        status: invoices.status,
        due_date: invoices.due_date,
        paid_at: invoices.paid_at,
        payment_method: invoices.payment_method,
        created_at: invoices.created_at,
        client: {
          id: clients.id,
          name: clients.name,
          company: clients.company,
          email: clients.email,
          phone: clients.phone,
          address: clients.address,
        },
      })
      .from(invoices)
      .leftJoin(clients, eq(invoices.client_id, clients.id))
      .where(and(...conditions))
      .orderBy(desc(invoices.created_at));
    res.json({ data: list });
  },
);

invoicesRouter.get(
  "/:id",
  authenticate,
  requireRole("super_admin", "md", "finance", "business_development"),
  async (req: Request, res: Response) => {
    const [invoice] = await db
      .select({
        id: invoices.id,
        invoice_number: invoices.invoice_number,
        line_items: invoices.line_items,
        subtotal: invoices.subtotal,
        discount_type: invoices.discount_type,
        discount_value: invoices.discount_value,
        discount_amount: invoices.discount_amount,
        tax_rate: invoices.tax_rate,
        tax_amount: invoices.tax_amount,
        total: invoices.total,
        currency: invoices.currency,
        status: invoices.status,
        due_date: invoices.due_date,
        paid_at: invoices.paid_at,
        payment_method: invoices.payment_method,
        notes: invoices.notes,
        created_at: invoices.created_at,
        updated_at: invoices.updated_at,
        client: {
          id: clients.id,
          name: clients.name,
          company: clients.company,
          email: clients.email,
          phone: clients.phone,
          address: clients.address,
          contact_person: clients.contact_person,
        },
        sample: {
          id: samples.id,
          ulid: samples.ulid,
          name: samples.name,
        },
      })
      .from(invoices)
      .leftJoin(clients, eq(invoices.client_id, clients.id))
      .leftJoin(samples, eq(invoices.sample_id, samples.id))
      .where(
        and(
          eq(invoices.id, req.params.id),
          eq(invoices.tenant_id, req.tenantId!),
        ),
      )
      .limit(1);

    if (!invoice) throw new AppError(404, "Invoice not found");

    // Get tenant/organization info
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, req.tenantId!))
      .limit(1);

    res.json({ data: { ...invoice, organization: tenant } });
  },
);

invoicesRouter.post(
  "/",
  authenticate,
  requireRole("super_admin", "md", "finance", "business_development"),
  async (req: Request, res: Response) => {
    const body = z
      .object({
        client_id: z.string().uuid(),
        sample_id: z.string().uuid().optional().or(z.literal("")),
        result_id: z.string().uuid().optional().or(z.literal("")),
        request_id: z.string().uuid().optional(), // Add request_id
        line_items: z.array(
          z.object({
            description: z.string(),
            quantity: z.number(),
            unit_price: z.number(),
            amount: z.number(),
          }),
        ),
        tax_rate: z.number().default(7.5), // Default VAT in Nigeria
        discount_type: z.enum(["percentage", "fixed"]).default("percentage"),
        discount_value: z.number().min(0).default(0),
        due_date: z.string().optional().or(z.literal("")),
        notes: z.string().optional(),
        currency: z.string().default("NGN"),
      })
      .superRefine((data, ctx) => {
        if (data.discount_type === "percentage" && data.discount_value > 100) {
          ctx.addIssue({
            code: z.ZodIssueCode.too_big,
            maximum: 100,
            type: "number",
            inclusive: true,
            message: "Percentage discount must be between 0 and 100",
            path: ["discount_value"],
          });
        }
      })
      .parse(req.body);

    const subtotal = body.line_items.reduce(
      (sum, item) => sum + item.amount,
      0,
    );
    const { discountAmount, taxAmount, total } = computeInvoiceTotals(
      subtotal,
      body.tax_rate,
      body.discount_type,
      body.discount_value,
    );

    // Generate invoice number with date prefix
    const now = new Date();
    const datePrefix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const randomSuffix = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0");
    const invNum = `INV${datePrefix}-${randomSuffix}`;

    const [inv] = await db
      .insert(invoices)
      .values({
        tenant_id: req.tenantId!,
        invoice_number: invNum,
        client_id: body.client_id,
        sample_id:
          body.sample_id && body.sample_id !== "" ? body.sample_id : undefined,
        result_id:
          body.result_id && body.result_id !== "" ? body.result_id : undefined,
        line_items: body.line_items as any,
        subtotal,
        discount_type: body.discount_type,
        discount_value: body.discount_value,
        discount_amount: discountAmount,
        tax_rate: body.tax_rate,
        tax_amount: taxAmount,
        total,
        currency: body.currency,
        due_date:
          body.due_date && body.due_date !== ""
            ? new Date(body.due_date)
            : null,
        notes: body.notes,
        created_by: req.user!.id,
      })
      .returning();

    // If request_id is provided, link the invoice to the request
    if (body.request_id) {
      const { sample_requests } = await import("../db/schema");
      await db
        .update(sample_requests)
        .set({
          invoice_id: inv.id,
          invoice_issued: true,
          updated_at: new Date(),
        })
        .where(eq(sample_requests.id, body.request_id));
    }

    await createAuditLog({
      tenant_id: req.tenantId!,
      user_id: req.user!.id,
      action: "CREATE",
      table_name: "invoices",
      record_id: inv.id,
    });

    res.status(201).json({ data: inv });
  },
);

invoicesRouter.put(
  "/:id",
  authenticate,
  requireRole("super_admin", "md", "finance"),
  async (req: Request, res: Response) => {
    const body = z
      .object({
        line_items: z
          .array(
            z.object({
              description: z.string(),
              quantity: z.number(),
              unit_price: z.number(),
              amount: z.number(),
            }),
          )
          .optional(),
        tax_rate: z.number().optional(),
        discount_type: z.enum(["percentage", "fixed"]).optional(),
        discount_value: z.number().min(0).optional(),
        due_date: z.string().datetime().optional(),
        notes: z.string().optional(),
        status: z.enum(["unpaid", "paid", "partial", "voided"]).optional(),
      })
      .superRefine((data, ctx) => {
        if (
          data.discount_type === "percentage" &&
          data.discount_value !== undefined &&
          data.discount_value > 100
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.too_big,
            maximum: 100,
            type: "number",
            inclusive: true,
            message: "Percentage discount must be between 0 and 100",
            path: ["discount_value"],
          });
        }
      })
      .parse(req.body);

    const [existing] = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.id, req.params.id),
          eq(invoices.tenant_id, req.tenantId!),
        ),
      )
      .limit(1);

    if (!existing) throw new AppError(404, "Invoice not found");
    if (existing.status === "paid") {
      throw new AppError(400, "Cannot edit a paid invoice");
    }

    let updateData: any = { updated_at: new Date() };

    if (
      body.line_items ||
      body.discount_type !== undefined ||
      body.discount_value !== undefined ||
      body.tax_rate !== undefined
    ) {
      const lineItems = body.line_items ?? (existing.line_items as any[]);
      const subtotal = lineItems.reduce(
        (sum: number, item: any) => sum + item.amount,
        0,
      );
      const taxRate = body.tax_rate ?? existing.tax_rate ?? 0;
      const discountType = (body.discount_type ??
        existing.discount_type ??
        "percentage") as "percentage" | "fixed";
      const discountValue = body.discount_value ?? existing.discount_value ?? 0;

      const { discountAmount, taxAmount, total } = computeInvoiceTotals(
        subtotal,
        taxRate,
        discountType,
        discountValue,
      );

      updateData = {
        ...updateData,
        ...(body.line_items ? { line_items: body.line_items } : {}),
        subtotal,
        discount_type: discountType,
        discount_value: discountValue,
        discount_amount: discountAmount,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total,
      };
    }

    if (body.due_date) updateData.due_date = new Date(body.due_date);
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.status) updateData.status = body.status;

    const [updated] = await db
      .update(invoices)
      .set(updateData)
      .where(eq(invoices.id, req.params.id))
      .returning();

    await createAuditLog({
      tenant_id: req.tenantId!,
      user_id: req.user!.id,
      action: "UPDATE",
      table_name: "invoices",
      record_id: updated.id,
    });

    res.json({ data: updated });
  },
);

invoicesRouter.patch(
  "/:id/payment",
  authenticate,
  requireRole("super_admin", "md", "finance"),
  async (req: Request, res: Response) => {
    const { payment_method } = z
      .object({ payment_method: z.string() })
      .parse(req.body);
    const [updated] = await db
      .update(invoices)
      .set({
        status: "paid",
        paid_at: new Date(),
        payment_method,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(invoices.id, req.params.id),
          eq(invoices.tenant_id, req.tenantId!),
        ),
      )
      .returning();
    if (!updated) throw new AppError(404, "Invoice not found");

    await createAuditLog({
      tenant_id: req.tenantId!,
      user_id: req.user!.id,
      action: "UPDATE",
      table_name: "invoices",
      record_id: updated.id,
      metadata: { action: "mark_paid", payment_method },
    });

    res.json({ data: updated });
  },
);

invoicesRouter.delete(
  "/:id",
  authenticate,
  requireRole("super_admin", "md"),
  async (req: Request, res: Response) => {
    const [existing] = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.id, req.params.id),
          eq(invoices.tenant_id, req.tenantId!),
        ),
      )
      .limit(1);

    if (!existing) throw new AppError(404, "Invoice not found");
    if (existing.status === "paid") {
      throw new AppError(400, "Cannot delete a paid invoice");
    }

    const [voided] = await db
      .update(invoices)
      .set({ status: "voided", updated_at: new Date() })
      .where(eq(invoices.id, req.params.id))
      .returning();

    await createAuditLog({
      tenant_id: req.tenantId!,
      user_id: req.user!.id,
      action: "DELETE",
      table_name: "invoices",
      record_id: voided.id,
    });

    res.json({ message: "Invoice voided successfully" });
  },
);
