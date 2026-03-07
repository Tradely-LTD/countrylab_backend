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
        const tenantDir = path_1.default.join(UPLOAD_DIR, req.tenantId);
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
// ─── GET Organization Settings ────────────────────────────────────────────────
router.get("/organization", auth_1.authenticate, async (req, res) => {
    const [tenant] = await db_1.db
        .select()
        .from(schema_1.tenants)
        .where((0, drizzle_orm_1.eq)(schema_1.tenants.id, req.tenantId))
        .limit(1);
    if (!tenant)
        throw new errorHandler_1.AppError(404, "Organization not found");
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
    const [updated] = await db_1.db
        .update(schema_1.tenants)
        .set({ ...body, updated_at: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.tenants.id, req.tenantId))
        .returning();
    if (!updated)
        throw new errorHandler_1.AppError(404, "Organization not found");
    res.json({ data: updated });
});
// ─── UPLOAD Organization Logo ─────────────────────────────────────────────────
router.post("/organization/logo", auth_1.authenticate, (0, auth_1.requireRole)(...auth_1.ADMIN_ROLES), upload.single("logo"), async (req, res) => {
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
            fs_1.default.unlinkSync(oldLogoPath);
        }
    }
    // Update tenant with new logo URL
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
    if (currentTenant?.logo_url) {
        const logoPath = path_1.default.join(process.cwd(), currentTenant.logo_url);
        if (fs_1.default.existsSync(logoPath)) {
            fs_1.default.unlinkSync(logoPath);
        }
    }
    const [updated] = await db_1.db
        .update(schema_1.tenants)
        .set({ logo_url: null, updated_at: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.tenants.id, req.tenantId))
        .returning();
    res.json({ message: "Logo deleted successfully" });
});
exports.default = router;
//# sourceMappingURL=settings.js.map