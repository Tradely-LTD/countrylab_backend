import { Router, Request, Response } from "express";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { tenants } from "../db/schema";
import { authenticate, requireRole, ADMIN_ROLES } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import multer from "multer";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const router = Router();

// ─── Supabase Storage ─────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "countrylab-files";

// ─── File Upload Configuration (memory — no disk writes) ──────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|svg/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase(),
    );
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error("Only image files (jpeg, jpg, png, svg) are allowed"));
  },
});

// Error handler for multer errors
const handleMulterError = (
  err: any,
  req: Request,
  res: Response,
  next: any,
) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "File size must be less than 5MB" });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message || "File upload failed" });
  }
  next();
};

// Helper: extract storage path from a Supabase public URL
function storagePathFromUrl(url: string): string | null {
  try {
    const marker = `/object/public/${BUCKET}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    return url.slice(idx + marker.length);
  } catch {
    return null;
  }
}

// ─── GET Organization Settings ────────────────────────────────────────────────

router.get(
  "/organization",
  authenticate,
  async (req: Request, res: Response) => {
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, req.tenantId!))
      .limit(1);

    // Return empty defaults instead of 404 — tenant may not be configured yet
    if (!tenant) {
      return res.json({
        data: {
          id: req.tenantId,
          name: "",
          slug: "",
          logo_url: null,
          address: null,
          phone: null,
          email: null,
          accreditation_number: null,
          is_active: true,
          settings: {},
          created_at: null,
          updated_at: null,
        },
      });
    }

    res.json({ data: tenant });
  },
);

// ─── UPDATE Organization Settings ─────────────────────────────────────────────

router.put(
  "/organization",
  authenticate,
  requireRole(...ADMIN_ROLES),
  async (req: Request, res: Response) => {
    const schema = z.object({
      name: z.string().min(1, "Organization name is required"),
      address: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional().or(z.literal("")),
      accreditation_number: z.string().optional(),
    });

    const body = schema.parse(req.body);

    // Check if tenant exists first
    const [existing] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, req.tenantId!))
      .limit(1);

    let result;
    if (existing) {
      const [updated] = await db
        .update(tenants)
        .set({ ...body, updated_at: new Date() })
        .where(eq(tenants.id, req.tenantId!))
        .returning();
      result = updated;
    } else {
      // Auto-create tenant record on first save
      let slug = body.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      // Check for slug conflict and append a 4-char hex suffix if taken
      const [slugConflict] = await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.slug, slug))
        .limit(1);
      if (slugConflict) {
        slug = `${slug}-${Math.random().toString(16).slice(2, 6)}`;
      }

      const [created] = await db
        .insert(tenants)
        .values({ id: req.tenantId!, slug, ...body })
        .returning();
      result = created;
    }

    res.json({ data: result });
  },
);

// ─── UPLOAD Organization Logo ─────────────────────────────────────────────────

router.post(
  "/organization/logo",
  authenticate,
  requireRole(...ADMIN_ROLES),
  (req, res, next) => {
    upload.single("logo")(req, res, (err) => {
      if (err) return handleMulterError(err, req, res, next);
      next();
    });
  },
  async (req: Request, res: Response) => {
    if (!req.file) {
      throw new AppError(400, "No file uploaded");
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    const filename = `logo-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    const storagePath = `logos/${req.tenantId}/${filename}`;

    // Delete old logo from Supabase Storage if one exists
    const [currentTenant] = await db
      .select({ logo_url: tenants.logo_url })
      .from(tenants)
      .where(eq(tenants.id, req.tenantId!))
      .limit(1);

    if (currentTenant?.logo_url) {
      const oldPath = storagePathFromUrl(currentTenant.logo_url);
      if (oldPath) {
        await supabase.storage.from(BUCKET).remove([oldPath]);
      }
    }

    // Upload new logo to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true,
      });

    if (uploadError) {
      throw new AppError(500, `Storage upload failed: ${uploadError.message}`);
    }

    // Get the permanent public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(storagePath);

    const logoUrl = urlData.publicUrl;

    // Upsert tenant record with new logo URL
    if (!currentTenant) {
      await db.insert(tenants).values({
        id: req.tenantId!,
        name: "New Organization",
        slug: `tenant-${req.tenantId!.slice(0, 8)}`,
        logo_url: logoUrl,
      });
    } else {
      await db
        .update(tenants)
        .set({ logo_url: logoUrl, updated_at: new Date() })
        .where(eq(tenants.id, req.tenantId!));
    }

    res.json({ data: { logo_url: logoUrl }, message: "Logo uploaded successfully" });
  },
);

// ─── DELETE Organization Logo ─────────────────────────────────────────────────

router.delete(
  "/organization/logo",
  authenticate,
  requireRole(...ADMIN_ROLES),
  async (req: Request, res: Response) => {
    const [currentTenant] = await db
      .select({ logo_url: tenants.logo_url })
      .from(tenants)
      .where(eq(tenants.id, req.tenantId!))
      .limit(1);

    if (!currentTenant) {
      return res.json({ message: "No logo to delete" });
    }

    if (currentTenant.logo_url) {
      const storagePath = storagePathFromUrl(currentTenant.logo_url);
      if (storagePath) {
        await supabase.storage.from(BUCKET).remove([storagePath]);
      }
    }

    await db
      .update(tenants)
      .set({ logo_url: null, updated_at: new Date() })
      .where(eq(tenants.id, req.tenantId!));

    res.json({ message: "Logo deleted successfully" });
  },
);

// ─── GET Bank Accounts ────────────────────────────────────────────────────────

router.get(
  "/bank-accounts",
  authenticate,
  async (req: Request, res: Response) => {
    const [tenant] = await db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, req.tenantId!))
      .limit(1);

    const accounts = (tenant?.settings as any)?.bank_accounts ?? [];
    res.json({ data: accounts });
  },
);

// ─── PUT Bank Accounts ────────────────────────────────────────────────────────

router.put(
  "/bank-accounts",
  authenticate,
  requireRole("super_admin", "md", "finance"),
  async (req: Request, res: Response) => {
    const schema = z.array(
      z.object({
        id: z.string().uuid(),
        account_number: z.string().min(1),
        account_name: z.string().min(1),
        bank_name: z.string().min(1),
        label: z.string().optional(),
        is_active: z.boolean().default(true),
      }),
    );

    const accounts = schema.parse(req.body.accounts);

    await db
      .update(tenants)
      .set({
        settings: sql`settings || ${JSON.stringify({ bank_accounts: accounts })}::jsonb`,
        updated_at: new Date(),
      })
      .where(eq(tenants.id, req.tenantId!));

    res.json({ data: accounts, message: "Bank accounts saved" });
  },
);

export default router;
