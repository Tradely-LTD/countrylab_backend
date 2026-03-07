"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const supabase_js_1 = require("@supabase/supabase-js");
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
// ─── POST /auth/forgot-password ───────────────────────────────────────────────
const forgotPasswordSchema = zod_1.z.object({
    email: zod_1.z.string().email("Invalid email address"),
});
router.post("/forgot-password", async (req, res) => {
    try {
        const { email } = forgotPasswordSchema.parse(req.body);
        // Check if user exists
        const [user] = await db_1.db
            .select()
            .from(schema_1.users)
            .where((0, drizzle_orm_1.eq)(schema_1.users.email, email.toLowerCase()))
            .limit(1);
        // Always return success to prevent email enumeration
        if (!user) {
            logger_1.logger.info(`Password reset requested for non-existent email: ${email}`);
            return res.json({
                message: "If an account exists with this email, you will receive password reset instructions.",
            });
        }
        // Use Supabase's built-in password reset
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${process.env.FRONTEND_URL || "http://localhost:5173"}/reset-password`,
        });
        if (error) {
            logger_1.logger.error("Supabase password reset error:", error);
            throw error;
        }
        logger_1.logger.info(`Password reset email sent to: ${email}`);
        res.json({
            message: "If an account exists with this email, you will receive password reset instructions.",
        });
    }
    catch (error) {
        logger_1.logger.error("Forgot password error:", error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                error: "Invalid email address",
                details: error.errors,
            });
        }
        res.status(500).json({
            error: "Failed to process password reset request",
        });
    }
});
// ─── POST /auth/reset-password ────────────────────────────────────────────────
const resetPasswordSchema = zod_1.z.object({
    token: zod_1.z.string().min(1, "Reset token is required"),
    password: zod_1.z.string().min(8, "Password must be at least 8 characters"),
});
router.post("/reset-password", async (req, res) => {
    try {
        const { token, password } = resetPasswordSchema.parse(req.body);
        // Verify the token and update password using Supabase
        const { data, error } = await supabase.auth.updateUser({
            password: password,
        });
        if (error) {
            logger_1.logger.error("Password reset error:", error);
            return res.status(400).json({
                error: "Invalid or expired reset token",
            });
        }
        logger_1.logger.info(`Password reset successful for user: ${data.user?.email}`);
        res.json({
            message: "Password reset successful. You can now login with your new password.",
        });
    }
    catch (error) {
        logger_1.logger.error("Reset password error:", error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                error: "Validation error",
                details: error.errors,
            });
        }
        res.status(500).json({
            error: "Failed to reset password",
        });
    }
});
exports.default = router;
//# sourceMappingURL=auth.js.map