"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const path_1 = __importDefault(require("path"));
const db_1 = require("./db");
const logger_1 = require("./utils/logger");
const errorHandler_1 = require("./middleware/errorHandler");
// Routers
const auth_1 = __importDefault(require("./routes/auth"));
const samples_1 = __importDefault(require("./routes/samples"));
const results_1 = __importDefault(require("./routes/results"));
const suppliers_1 = __importDefault(require("./routes/suppliers"));
const settings_1 = __importDefault(require("./routes/settings"));
const sample_requests_1 = __importDefault(require("./routes/sample-requests"));
const inventory_assets_procurement_1 = require("./routes/inventory-assets-procurement");
const misc_routes_1 = require("./routes/misc-routes");
const app = (0, express_1.default)();
const PORT = parseInt(process.env.PORT || "3001", 10);
// ─── Security Middleware ──────────────────────────────────────────────────────
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: [
        process.env.FRONTEND_URL || "http://localhost:5173",
        "http://localhost:5174",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Tenant-ID"],
}));
// ─── Rate Limiting ────────────────────────────────────────────────────────────
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
});
app.use("/api/", limiter);
// ─── Auth rate limit (stricter) ───────────────────────────────────────────────
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: "Too many login attempts, please try again later" },
});
// ─── Parsing ──────────────────────────────────────────────────────────────────
app.use(express_1.default.json({ limit: "10mb" }));
app.use(express_1.default.urlencoded({ extended: true }));
// ─── Logging ──────────────────────────────────────────────────────────────────
app.use((0, morgan_1.default)(process.env.NODE_ENV === "production" ? "combined" : "dev", {
    stream: { write: (message) => logger_1.logger.info(message.trim()) },
}));
// ─── Health Check ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        app: "Countrylab LMS API",
        version: "1.0.0",
        schema: process.env.DATABASE_SCHEMA || "countrylab_lms",
        timestamp: new Date().toISOString(),
    });
});
// ─── API Routes ───────────────────────────────────────────────────────────────
const API = "/api/v1";
app.use(`${API}/auth`, authLimiter, auth_1.default);
app.use(`${API}/samples`, samples_1.default);
app.use(`${API}/results`, results_1.default);
app.use(`${API}/suppliers`, suppliers_1.default);
app.use(`${API}/settings`, settings_1.default);
app.use(`${API}/sample-requests`, sample_requests_1.default);
app.use(`${API}/inventory`, inventory_assets_procurement_1.inventoryRouter);
app.use(`${API}/assets`, inventory_assets_procurement_1.assetsRouter);
app.use(`${API}/procurement`, inventory_assets_procurement_1.procurementRouter);
app.use(`${API}/clients`, misc_routes_1.clientsRouter);
app.use(`${API}/users`, misc_routes_1.usersRouter);
app.use(`${API}/audit-logs`, misc_routes_1.auditRouter);
app.use(`${API}/dashboard`, misc_routes_1.dashboardRouter);
app.use(`${API}/notifications`, misc_routes_1.notificationsRouter);
app.use(`${API}/invoices`, misc_routes_1.invoicesRouter);
// Public verification endpoint (no auth)
app.use(`${API}/results/verify`, results_1.default);
// ─── Static Files ─────────────────────────────────────────────────────────────
// Serve uploaded files (must be BEFORE notFound handler)
const uploadsPath = path_1.default.join(process.cwd(), "uploads");
logger_1.logger.info(`📁 Serving static files from: ${uploadsPath}`);
app.use("/uploads", (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
}, express_1.default.static(uploadsPath));
// ─── Error Handling ───────────────────────────────────────────────────────────
app.use(errorHandler_1.notFound);
app.use(errorHandler_1.errorHandler);
// ─── Start Server ─────────────────────────────────────────────────────────────
async function bootstrap() {
    try {
        await (0, db_1.initializeSchema)();
        await (0, db_1.checkDbConnection)();
        app.listen(PORT, () => {
            logger_1.logger.info(`🚀 Countrylab LMS API running on port ${PORT}`);
            logger_1.logger.info(`📋 Environment: ${process.env.NODE_ENV || "development"}`);
            logger_1.logger.info(`🗄️  Database Schema: ${process.env.DATABASE_SCHEMA || "countrylab_lms"}`);
        });
    }
    catch (error) {
        logger_1.logger.error("Failed to start server:", error);
        process.exit(1);
    }
}
bootstrap();
exports.default = app;
//# sourceMappingURL=index.js.map