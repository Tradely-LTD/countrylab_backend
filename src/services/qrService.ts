import QRCode from "qrcode";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { logger } from "../utils/logger";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export function generateQRHash(resultId: string): string {
  return crypto
    .createHmac("sha256", process.env.JWT_SECRET!)
    .update(resultId)
    .digest("hex")
    .slice(0, 32);
}

export async function generateQRCode(
  qrHash: string,
  tenantId: string,
): Promise<string> {
  try {
    const verifyUrl = `${process.env.FRONTEND_URL}/verify/${qrHash}`;

    // Generate QR code as PNG buffer
    const qrBuffer = await QRCode.toBuffer(verifyUrl, {
      errorCorrectionLevel: "H",
      width: 300,
      margin: 2,
      color: { dark: "#1E293B", light: "#FFFFFF" },
    });

    // Try to upload to Supabase Storage if configured
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const fileName = `qrcodes/${tenantId}/${qrHash}.png`;
      const { error } = await supabase.storage
        .from(process.env.SUPABASE_STORAGE_BUCKET || "countrylab-files")
        .upload(fileName, qrBuffer, {
          contentType: "image/png",
          upsert: true,
        });

      if (!error) {
        const { data } = supabase.storage
          .from(process.env.SUPABASE_STORAGE_BUCKET || "countrylab-files")
          .getPublicUrl(fileName);

        return data.publicUrl;
      }

      logger.warn(
        "QR upload to Supabase failed, using data URL fallback:",
        error,
      );
    }

    // Fallback: Return as data URL (base64 encoded image)
    const base64Image = qrBuffer.toString("base64");
    return `data:image/png;base64,${base64Image}`;
  } catch (error) {
    logger.error("QR generation error:", error);
    // Last resort: generate inline QR code as data URL
    try {
      const verifyUrl = `${process.env.FRONTEND_URL}/verify/${qrHash}`;
      const dataUrl = await QRCode.toDataURL(verifyUrl, {
        errorCorrectionLevel: "H",
        width: 300,
        margin: 2,
        color: { dark: "#1E293B", light: "#FFFFFF" },
      });
      return dataUrl;
    } catch (fallbackError) {
      logger.error("QR fallback generation error:", fallbackError);
      throw new Error("Failed to generate QR code");
    }
  }
}
