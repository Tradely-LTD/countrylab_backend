import { Router, Request, Response } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { tenants } from "../db/schema";
import { authenticate, requireRole, ADMIN_ROLES } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = Router();

// ─── File Upload Configuration ────────────────────────────────────────────────

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "assets");

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tenantDir = path.join(UPLOAD_DIR, req.tenantId!);
    if (!fs.existsSync(tenantDir)) {
      fs.mkdirSync(tenantDir, { recursive: true });
    }
    cb(null, tenantDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `logo-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
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

    if (!tenant) throw new AppError(404, "Organization not found");

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

    const [updated] = await db
      .update(tenants)
      .set({ ...body, updated_at: new Date() })
      .where(eq(tenants.id, req.tenantId!))
      .returning();

    if (!updated) throw new AppError(404, "Organization not found");

    res.json({ data: updated });
  },
);

// ─── UPLOAD Organization Logo ─────────────────────────────────────────────────

router.post(
  "/organization/logo",
  authenticate,
  requireRole(...ADMIN_ROLES),
  upload.single("logo"),
  async (req: Request, res: Response) => {
    if (!req.file) {
      throw new AppError(400, "No file uploaded");
    }

    const logoUrl = `/uploads/assets/${req.tenantId}/${req.file.filename}`;

    // Get current tenant to delete old logo if exists
    const [currentTenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, req.tenantId!))
      .limit(1);

    // Delete old logo file if exists
    if (currentTenant?.logo_url) {
      const oldLogoPath = path.join(process.cwd(), currentTenant.logo_url);
      if (fs.existsSync(oldLogoPath)) {
        fs.unlinkSync(oldLogoPath);
      }
    }

    // Update tenant with new logo URL
    const [updated] = await db
      .update(tenants)
      .set({ logo_url: logoUrl, updated_at: new Date() })
      .where(eq(tenants.id, req.tenantId!))
      .returning();

    res.json({
      data: { logo_url: logoUrl },
      message: "Logo uploaded successfully",
    });
  },
);

// ─── DELETE Organization Logo ─────────────────────────────────────────────────

router.delete(
  "/organization/logo",
  authenticate,
  requireRole(...ADMIN_ROLES),
  async (req: Request, res: Response) => {
    const [currentTenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, req.tenantId!))
      .limit(1);

    if (currentTenant?.logo_url) {
      const logoPath = path.join(process.cwd(), currentTenant.logo_url);
      if (fs.existsSync(logoPath)) {
        fs.unlinkSync(logoPath);
      }
    }

    const [updated] = await db
      .update(tenants)
      .set({ logo_url: null, updated_at: new Date() })
      .where(eq(tenants.id, req.tenantId!))
      .returning();

    res.json({ message: "Logo deleted successfully" });
  },
);

export default router;
