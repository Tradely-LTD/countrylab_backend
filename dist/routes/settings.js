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
const errorHandler_1 = require("../middleware/errorHandler");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const router = (0, express_1.Router)();
// ─── File Upload Configuration ────────────────────────────────────────────────
const UPLOAD_DIR = path_1.default.join(process.cwd(), "uploads", "assets");
// Ensure upload directory exists
if (!fs_1.default.existsSync(UPLOAD_DIR)) {
    fs_1.default.mkdirSync(UPLOAD_DIR, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        // tenantId is set by authenticate middleware which runs before multer
        const tenantId = req.tenantId || req.user?.tenant_id;
        if (!tenantId) {
            return cb(new Error("Tenant ID not found"), "");
        }
        const tenantDir = path_1.default.join(UPLOAD_DIR, tenantId);
        if (!fs_1.default.existsSync(tenantDir)) {
            fs_1.default.mkdirSync(tenantDir, { recursive: true });
        }
        cb(null, tenantDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, `logo-${uniqueSuffix}${path_1.default.extname(file.originalname)}`);
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|svg/;
        const extname = allowedTypes.test(path_1.default.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error("Only image files (jpeg, jpg, png, svg) are allowed"));
    },
});
// Error handler for multer errors
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer_1.default.MulterError) {
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
// ─── GET Organization Settings ────────────────────────────────────────────────
router.get("/organization", auth_1.authenticate, async (req, res) => {
    const [tenant] = await db_1.db
        .select()
        .from(schema_1.tenants)
        .where((0, drizzle_orm_1.eq)(schema_1.tenants.id, req.tenantId))
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
});
// ─── UPDATE Organization Settings ─────────────────────────────────────────────
router.put("/organization", auth_1.authenticate, (0, auth_1.requireRole)(...auth_1.ADMIN_ROLES), async (req, res) => {
    const schema = zod_1.z.object({
        name: zod_1.z.string().min(1, "Organization name is required"),
        address: zod_1.z.string().optional(),
        phone: zod_1.z.string().optional(),
        email: zod_1.z.string().email().optional().or(zod_1.z.literal("")),
        accreditation_number: zod_1.z.string().optional(),
    });
    const body = schema.parse(req.body);
    // Check if tenant exists first
    const [existing] = await db_1.db
        .select({ id: schema_1.tenants.id })
        .from(schema_1.tenants)
        .where((0, drizzle_orm_1.eq)(schema_1.tenants.id, req.tenantId))
        .limit(1);
    let result;
    if (existing) {
        const [updated] = await db_1.db
            .update(schema_1.tenants)
            .set({ ...body, updated_at: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.tenants.id, req.tenantId))
            .returning();
        result = updated;
    }
    else {
        // Auto-create tenant record on first save
        let slug = body.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
        // Check for slug conflict and append a 4-char hex suffix if taken
        const [slugConflict] = await db_1.db
            .select({ id: schema_1.tenants.id })
            .from(schema_1.tenants)
            .where((0, drizzle_orm_1.eq)(schema_1.tenants.slug, slug))
            .limit(1);
        if (slugConflict) {
            slug = `${slug}-${Math.random().toString(16).slice(2, 6)}`;
        }
        const [created] = await db_1.db
            .insert(schema_1.tenants)
            .values({ id: req.tenantId, slug, ...body })
            .returning();
        result = created;
    }
    res.json({ data: result });
});
// ─── UPLOAD Organization Logo ─────────────────────────────────────────────────
router.post("/organization/logo", auth_1.authenticate, (0, auth_1.requireRole)(...auth_1.ADMIN_ROLES), (req, res, next) => {
    upload.single("logo")(req, res, (err) => {
        if (err) {
            return handleMulterError(err, req, res, next);
        }
        next();
    });
}, async (req, res) => {
    if (!req.file) {
        throw new errorHandler_1.AppError(400, "No file uploaded");
    }
    const logoUrl = `/uploads/assets/${req.tenantId}/${req.file.filename}`;
    // Get current tenant to delete old logo if exists
    const [currentTenant] = await db_1.db
        .select()
        .from(schema_1.tenants)
        .where((0, drizzle_orm_1.eq)(schema_1.tenants.id, req.tenantId))
        .limit(1);
    // Delete old logo file if exists
    if (currentTenant?.logo_url) {
        const oldLogoPath = path_1.default.join(process.cwd(), currentTenant.logo_url);
        if (fs_1.default.existsSync(oldLogoPath)) {
            try {
                fs_1.default.unlinkSync(oldLogoPath);
            }
            catch (error) {
                console.error("Failed to delete old logo:", error);
            }
        }
    }
    // If tenant doesn't exist yet, create a minimal record
    if (!currentTenant) {
        const [created] = await db_1.db
            .insert(schema_1.tenants)
            .values({
            id: req.tenantId,
            name: "New Organization", // Placeholder name
            slug: `tenant-${req.tenantId.slice(0, 8)}`, // Temporary slug
            logo_url: logoUrl,
        })
            .returning();
        return res.json({
            data: { logo_url: logoUrl },
            message: "Logo uploaded successfully",
        });
    }
    // Update existing tenant with new logo URL
    const [updated] = await db_1.db
        .update(schema_1.tenants)
        .set({ logo_url: logoUrl, updated_at: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.tenants.id, req.tenantId))
        .returning();
    res.json({
        data: { logo_url: logoUrl },
        message: "Logo uploaded successfully",
    });
});
// ─── DELETE Organization Logo ─────────────────────────────────────────────────
router.delete("/organization/logo", auth_1.authenticate, (0, auth_1.requireRole)(...auth_1.ADMIN_ROLES), async (req, res) => {
    const [currentTenant] = await db_1.db
        .select()
        .from(schema_1.tenants)
        .where((0, drizzle_orm_1.eq)(schema_1.tenants.id, req.tenantId))
        .limit(1);
    // If tenant doesn't exist, nothing to delete
    if (!currentTenant) {
        return res.json({ message: "No logo to delete" });
    }
    // Delete logo file if exists
    if (currentTenant.logo_url) {
        const logoPath = path_1.default.join(process.cwd(), currentTenant.logo_url);
        if (fs_1.default.existsSync(logoPath)) {
            try {
                fs_1.default.unlinkSync(logoPath);
            }
            catch (error) {
                // Log error but don't fail the request
                console.error("Failed to delete logo file:", error);
            }
        }
    }
    // Update tenant to remove logo URL
    const [updated] = await db_1.db
        .update(schema_1.tenants)
        .set({ logo_url: null, updated_at: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.tenants.id, req.tenantId))
        .returning();
    res.json({ message: "Logo deleted successfully" });
});
// ─── GET Bank Accounts ────────────────────────────────────────────────────────
router.get("/bank-accounts", auth_1.authenticate, async (req, res) => {
    const [tenant] = await db_1.db
        .select({ settings: schema_1.tenants.settings })
        .from(schema_1.tenants)
        .where((0, drizzle_orm_1.eq)(schema_1.tenants.id, req.tenantId))
        .limit(1);
    const accounts = tenant?.settings?.bank_accounts ?? [];
    res.json({ data: accounts });
});
// ─── PUT Bank Accounts ────────────────────────────────────────────────────────
router.put("/bank-accounts", auth_1.authenticate, (0, auth_1.requireRole)("super_admin", "md", "finance"), async (req, res) => {
    const schema = zod_1.z.array(zod_1.z.object({
        id: zod_1.z.string().uuid(),
        account_number: zod_1.z.string().min(1),
        account_name: zod_1.z.string().min(1),
        bank_name: zod_1.z.string().min(1),
        label: zod_1.z.string().optional(),
        is_active: zod_1.z.boolean().default(true),
    }));
    const accounts = schema.parse(req.body.accounts);
    await db_1.db
        .update(schema_1.tenants)
        .set({
        settings: (0, drizzle_orm_1.sql) `settings || ${JSON.stringify({ bank_accounts: accounts })}::jsonb`,
        updated_at: new Date(),
    })
        .where((0, drizzle_orm_1.eq)(schema_1.tenants.id, req.tenantId));
    res.json({ data: accounts, message: "Bank accounts saved" });
});
exports.default = router;
//# sourceMappingURL=settings.js.map