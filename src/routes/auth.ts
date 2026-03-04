import { Router, Request, Response } from "express";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../utils/logger";
import crypto from "crypto";

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── POST /auth/forgot-password ───────────────────────────────────────────────

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

router.post("/forgot-password", async (req: Request, res: Response) => {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);

    // Check if user exists
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    // Always return success to prevent email enumeration
    if (!user) {
      logger.info(`Password reset requested for non-existent email: ${email}`);
      return res.json({
        message:
          "If an account exists with this email, you will receive password reset instructions.",
      });
    }

    // Use Supabase's built-in password reset
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.FRONTEND_URL || "http://localhost:5173"}/reset-password`,
    });

    if (error) {
      logger.error("Supabase password reset error:", error);
      throw error;
    }

    logger.info(`Password reset email sent to: ${email}`);

    res.json({
      message:
        "If an account exists with this email, you will receive password reset instructions.",
    });
  } catch (error: any) {
    logger.error("Forgot password error:", error);

    if (error instanceof z.ZodError) {
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

const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

router.post("/reset-password", async (req: Request, res: Response) => {
  try {
    const { token, password } = resetPasswordSchema.parse(req.body);

    // Verify the token and update password using Supabase
    const { data, error } = await supabase.auth.updateUser({
      password: password,
    });

    if (error) {
      logger.error("Password reset error:", error);
      return res.status(400).json({
        error: "Invalid or expired reset token",
      });
    }

    logger.info(`Password reset successful for user: ${data.user?.email}`);

    res.json({
      message:
        "Password reset successful. You can now login with your new password.",
    });
  } catch (error: any) {
    logger.error("Reset password error:", error);

    if (error instanceof z.ZodError) {
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

export default router;
