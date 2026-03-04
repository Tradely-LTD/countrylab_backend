import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import path from "path";

import { checkDbConnection, initializeSchema } from "./db";
import { logger } from "./utils/logger";
import { errorHandler, notFound } from "./middleware/errorHandler";

// Routers
import authRouter from "./routes/auth";
import samplesRouter from "./routes/samples";
import resultsRouter from "./routes/results";
import suppliersRouter from "./routes/suppliers";
import settingsRouter from "./routes/settings";
import sampleRequestsRouter from "./routes/sample-requests";
import {
  inventoryRouter,
  assetsRouter,
  procurementRouter,
} from "./routes/inventory-assets-procurement";
import {
  clientsRouter,
  usersRouter,
  auditRouter,
  dashboardRouter,
  notificationsRouter,
  invoicesRouter,
} from "./routes/misc-routes";

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

// ─── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: [
      process.env.FRONTEND_URL || "http://localhost:5173",
      "http://localhost:5174",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Tenant-ID"],
  }),
);

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/", limiter);

// ─── Auth rate limit (stricter) ───────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts, please try again later" },
});

// ─── Parsing ──────────────────────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ─── Logging ──────────────────────────────────────────────────────────────────
app.use(
  morgan(process.env.NODE_ENV === "production" ? "combined" : "dev", {
    stream: { write: (message) => logger.info(message.trim()) },
  }),
);

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

app.use(`${API}/auth`, authLimiter, authRouter);
app.use(`${API}/samples`, samplesRouter);
app.use(`${API}/results`, resultsRouter);
app.use(`${API}/suppliers`, suppliersRouter);
app.use(`${API}/settings`, settingsRouter);
app.use(`${API}/sample-requests`, sampleRequestsRouter);
app.use(`${API}/inventory`, inventoryRouter);
app.use(`${API}/assets`, assetsRouter);
app.use(`${API}/procurement`, procurementRouter);
app.use(`${API}/clients`, clientsRouter);
app.use(`${API}/users`, usersRouter);
app.use(`${API}/audit-logs`, auditRouter);
app.use(`${API}/dashboard`, dashboardRouter);
app.use(`${API}/notifications`, notificationsRouter);
app.use(`${API}/invoices`, invoicesRouter);

// Public verification endpoint (no auth)
app.use(`${API}/results/verify`, resultsRouter);

// ─── Static Files ─────────────────────────────────────────────────────────────
// Serve uploaded files (must be BEFORE notFound handler)
const uploadsPath = path.join(process.cwd(), "uploads");
logger.info(`📁 Serving static files from: ${uploadsPath}`);
app.use(
  "/uploads",
  (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(uploadsPath),
);

// ─── Error Handling ───────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── Start Server ─────────────────────────────────────────────────────────────
async function bootstrap() {
  try {
    await initializeSchema();
    await checkDbConnection();
    app.listen(PORT, () => {
      logger.info(`🚀 Countrylab LMS API running on port ${PORT}`);
      logger.info(`📋 Environment: ${process.env.NODE_ENV || "development"}`);
      logger.info(
        `🗄️  Database Schema: ${process.env.DATABASE_SCHEMA || "countrylab_lms"}`,
      );
    });
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
}

bootstrap();

export default app;
