import { Router, Request, Response } from "express";
import { z } from "zod";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { db } from "../db";
import { users, leads, clients, tenants } from "../db/schema";
import { authenticate, requireRole, ADMIN_ROLES } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";

const router = Router();

const LEAD_STATUS = [
  "new",
  "contacted",
  "interested",
  "sample_submitted",
  "converted",
  "lost",
] as const;

// ─── PUBLIC: Get org info by referral code ────────────────────────────────────
// No auth — used by the public referral landing page

router.get("/ref/:code", async (req: Request, res: Response) => {
  const [marketer] = await db
    .select({
      id: users.id,
      full_name: users.full_name,
      tenant_id: users.tenant_id,
    })
    .from(users)
    .where(eq(users.referral_code, req.params.code))
    .limit(1);

  if (!marketer) throw new AppError(404, "Invalid referral link");

  const [tenant] = await db
    .select({
      name: tenants.name,
      logo_url: tenants.logo_url,
      phone: tenants.phone,
      email: tenants.email,
      address: tenants.address,
    })
    .from(tenants)
    .where(eq(tenants.id, marketer.tenant_id))
    .limit(1);

  res.json({
    data: {
      marketer_name: marketer.full_name,
      organization: tenant?.name || "",
      logo_url: tenant?.logo_url || null,
      org_phone: tenant?.phone || null,
      org_email: tenant?.email || null,
    },
  });
});

// ─── PUBLIC: Submit lead via referral link ────────────────────────────────────

router.post("/ref/:code", async (req: Request, res: Response) => {
  const body = z
    .object({
      name: z.string().min(1).max(255),
      phone: z.string().min(1).max(50),
      company: z.string().optional(),
      email: z.string().email().optional().or(z.literal("")),
      city: z.string().optional(),
      state: z.string().optional(),
      notes: z.string().optional(),
    })
    .parse(req.body);

  const [marketer] = await db
    .select({ id: users.id, tenant_id: users.tenant_id })
    .from(users)
    .where(eq(users.referral_code, req.params.code))
    .limit(1);

  if (!marketer) throw new AppError(404, "Invalid referral link");

  await db.insert(leads).values({
    tenant_id: marketer.tenant_id,
    marketer_id: marketer.id,
    referral_code: req.params.code,
    name: body.name,
    phone: body.phone,
    company: body.company,
    email: body.email || undefined,
    city: body.city,
    state: body.state,
    notes: body.notes,
    status: "new",
  });

  res.status(201).json({ message: "Thank you! We will be in touch soon." });
});

// ─── GET All Marketers with stats (admin only) ────────────────────────────────

router.get(
  "/",
  authenticate,
  requireRole(...ADMIN_ROLES),
  async (req: Request, res: Response) => {
    const marketers = await db
      .select({
        id: users.id,
        full_name: users.full_name,
        email: users.email,
        phone: users.phone,
        referral_code: users.referral_code,
        is_active: users.is_active,
        last_login_at: users.last_login_at,
        created_at: users.created_at,
      })
      .from(users)
      .where(
        and(eq(users.tenant_id, req.tenantId!), eq(users.role, "marketer")),
      )
      .orderBy(users.full_name);

    const stats = await db
      .select({
        marketer_id: leads.marketer_id,
        total: sql<number>`count(*)::int`,
        converted: sql<number>`count(*) filter (where ${leads.status} = 'converted')::int`,
      })
      .from(leads)
      .where(eq(leads.tenant_id, req.tenantId!))
      .groupBy(leads.marketer_id);

    const statsMap = Object.fromEntries(
      stats.map((s) => [s.marketer_id, s]),
    );

    const result = marketers.map((m) => ({
      ...m,
      total_leads: statsMap[m.id]?.total ?? 0,
      converted_leads: statsMap[m.id]?.converted ?? 0,
      conversion_rate:
        statsMap[m.id]?.total
          ? Math.round((statsMap[m.id].converted / statsMap[m.id].total) * 100)
          : 0,
    }));

    res.json({ data: result });
  },
);

// ─── GET Leads (marketer sees own; admin sees all) ────────────────────────────

router.get(
  "/leads",
  authenticate,
  requireRole(...ADMIN_ROLES, "marketer"),
  async (req: Request, res: Response) => {
    const { status, marketer_id, from, to, search } = req.query as Record<
      string,
      string
    >;
    const isMarketer = req.user!.role === "marketer";

    const conditions = [eq(leads.tenant_id, req.tenantId!)];

    if (isMarketer) {
      conditions.push(eq(leads.marketer_id, req.user!.id));
    } else if (marketer_id) {
      conditions.push(eq(leads.marketer_id, marketer_id));
    }

    if (status) conditions.push(eq(leads.status, status));
    if (from) conditions.push(gte(leads.created_at, new Date(from)));
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      conditions.push(lte(leads.created_at, toDate));
    }
    if (search) {
      conditions.push(
        sql`(${leads.name} ILIKE ${"%" + search + "%"} OR ${leads.phone} ILIKE ${"%" + search + "%"} OR COALESCE(${leads.company}, '') ILIKE ${"%" + search + "%"})`,
      );
    }

    const list = await db
      .select({
        id: leads.id,
        marketer_id: leads.marketer_id,
        name: leads.name,
        company: leads.company,
        phone: leads.phone,
        email: leads.email,
        city: leads.city,
        state: leads.state,
        notes: leads.notes,
        status: leads.status,
        referral_code: leads.referral_code,
        converted_client_id: leads.converted_client_id,
        converted_at: leads.converted_at,
        created_at: leads.created_at,
        updated_at: leads.updated_at,
        marketer_name: users.full_name,
      })
      .from(leads)
      .leftJoin(users, eq(leads.marketer_id, users.id))
      .where(and(...conditions))
      .orderBy(desc(leads.created_at));

    // Summary stats across all matching (without filter restrictions)
    const summaryConditions = [eq(leads.tenant_id, req.tenantId!)];
    if (isMarketer) summaryConditions.push(eq(leads.marketer_id, req.user!.id));
    else if (marketer_id)
      summaryConditions.push(eq(leads.marketer_id, marketer_id));

    const [summary] = await db
      .select({
        total: sql<number>`count(*)::int`,
        new_count: sql<number>`count(*) filter (where ${leads.status} = 'new')::int`,
        converted: sql<number>`count(*) filter (where ${leads.status} = 'converted')::int`,
        in_pipeline: sql<number>`count(*) filter (where ${leads.status} not in ('converted', 'lost'))::int`,
      })
      .from(leads)
      .where(and(...summaryConditions));

    res.json({ data: list, summary });
  },
);

// ─── POST Lead (marketer or admin) ───────────────────────────────────────────

router.post(
  "/leads",
  authenticate,
  requireRole(...ADMIN_ROLES, "marketer"),
  async (req: Request, res: Response) => {
    const body = z
      .object({
        name: z.string().min(1).max(255),
        phone: z.string().min(1).max(50),
        company: z.string().optional(),
        email: z.string().email().optional().or(z.literal("")),
        city: z.string().optional(),
        state: z.string().optional(),
        notes: z.string().optional(),
        marketer_id: z.string().uuid().optional(), // admin can assign to a marketer
      })
      .parse(req.body);

    const marketerId =
      req.user!.role === "marketer"
        ? req.user!.id
        : body.marketer_id || req.user!.id;

    const [lead] = await db
      .insert(leads)
      .values({
        tenant_id: req.tenantId!,
        marketer_id: marketerId,
        name: body.name,
        phone: body.phone,
        company: body.company,
        email: body.email || undefined,
        city: body.city,
        state: body.state,
        notes: body.notes,
        status: "new",
      })
      .returning();

    res.status(201).json({ data: lead });
  },
);

// ─── PUT Lead ─────────────────────────────────────────────────────────────────

router.put(
  "/leads/:id",
  authenticate,
  requireRole(...ADMIN_ROLES, "marketer"),
  async (req: Request, res: Response) => {
    const body = z
      .object({
        name: z.string().min(1).max(255).optional(),
        phone: z.string().min(1).max(50).optional(),
        company: z.string().optional(),
        email: z.string().email().optional().or(z.literal("")),
        city: z.string().optional(),
        state: z.string().optional(),
        notes: z.string().optional(),
      })
      .parse(req.body);

    const conditions = [
      eq(leads.id, req.params.id),
      eq(leads.tenant_id, req.tenantId!),
    ];
    if (req.user!.role === "marketer") {
      conditions.push(eq(leads.marketer_id, req.user!.id));
    }

    const [updated] = await db
      .update(leads)
      .set({ ...body, email: body.email || null, updated_at: new Date() })
      .where(and(...conditions))
      .returning();

    if (!updated) throw new AppError(404, "Lead not found");
    res.json({ data: updated });
  },
);

// ─── PATCH Lead Status ────────────────────────────────────────────────────────

router.patch(
  "/leads/:id/status",
  authenticate,
  requireRole(...ADMIN_ROLES, "marketer"),
  async (req: Request, res: Response) => {
    const { status, client_id } = z
      .object({
        status: z.enum(LEAD_STATUS),
        client_id: z.string().uuid().optional(),
      })
      .parse(req.body);

    const conditions = [
      eq(leads.id, req.params.id),
      eq(leads.tenant_id, req.tenantId!),
    ];
    if (req.user!.role === "marketer") {
      conditions.push(eq(leads.marketer_id, req.user!.id));
    }

    const updateData: Record<string, any> = { status, updated_at: new Date() };
    if (status === "converted") {
      updateData.converted_at = new Date();
      if (client_id) updateData.converted_client_id = client_id;
    }

    const [updated] = await db
      .update(leads)
      .set(updateData)
      .where(and(...conditions))
      .returning();

    if (!updated) throw new AppError(404, "Lead not found");
    res.json({ data: updated });
  },
);

// ─── GET Analytics / Leaderboard (admin only) ────────────────────────────────

router.get(
  "/analytics",
  authenticate,
  requireRole(...ADMIN_ROLES),
  async (req: Request, res: Response) => {
    const { from, to } = req.query as Record<string, string>;

    const conditions = [eq(leads.tenant_id, req.tenantId!)];
    if (from) conditions.push(gte(leads.created_at, new Date(from)));
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      conditions.push(lte(leads.created_at, toDate));
    }

    const [overview] = await db
      .select({
        total_leads: sql<number>`count(*)::int`,
        converted: sql<number>`count(*) filter (where ${leads.status} = 'converted')::int`,
        in_pipeline: sql<number>`count(*) filter (where ${leads.status} not in ('converted', 'lost'))::int`,
        lost: sql<number>`count(*) filter (where ${leads.status} = 'lost')::int`,
      })
      .from(leads)
      .where(and(...conditions));

    const leaderboard = await db
      .select({
        marketer_id: leads.marketer_id,
        marketer_name: users.full_name,
        total_leads: sql<number>`count(*)::int`,
        converted: sql<number>`count(*) filter (where ${leads.status} = 'converted')::int`,
        in_pipeline: sql<number>`count(*) filter (where ${leads.status} not in ('converted', 'lost'))::int`,
      })
      .from(leads)
      .leftJoin(users, eq(leads.marketer_id, users.id))
      .where(and(...conditions))
      .groupBy(leads.marketer_id, users.full_name)
      .orderBy(
        sql`count(*) filter (where ${leads.status} = 'converted') desc`,
      );

    const byStatus = await db
      .select({
        status: leads.status,
        count: sql<number>`count(*)::int`,
      })
      .from(leads)
      .where(and(...conditions))
      .groupBy(leads.status);

    res.json({
      data: {
        overview,
        leaderboard: leaderboard.map((l) => ({
          ...l,
          conversion_rate: l.total_leads
            ? Math.round((l.converted / l.total_leads) * 100)
            : 0,
        })),
        byStatus,
      },
    });
  },
);

// ─── GET My Stats (marketer's personal dashboard) ────────────────────────────

router.get(
  "/my-stats",
  authenticate,
  requireRole("marketer"),
  async (req: Request, res: Response) => {
    const [marketer] = await db
      .select({
        id: users.id,
        full_name: users.full_name,
        referral_code: users.referral_code,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, req.user!.id))
      .limit(1);

    const [stats] = await db
      .select({
        total_leads: sql<number>`count(*)::int`,
        converted: sql<number>`count(*) filter (where ${leads.status} = 'converted')::int`,
        in_pipeline: sql<number>`count(*) filter (where ${leads.status} not in ('converted', 'lost'))::int`,
        this_month: sql<number>`count(*) filter (where date_trunc('month', ${leads.created_at}) = date_trunc('month', now()))::int`,
      })
      .from(leads)
      .where(
        and(
          eq(leads.tenant_id, req.tenantId!),
          eq(leads.marketer_id, req.user!.id),
        ),
      );

    res.json({
      data: {
        marketer,
        stats,
        referral_link: marketer.referral_code
          ? `/ref/${marketer.referral_code}`
          : null,
      },
    });
  },
);

export default router;
