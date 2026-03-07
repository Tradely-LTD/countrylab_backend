"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateQRHash = generateQRHash;
exports.generateQRCode = generateQRCode;
const qrcode_1 = __importDefault(require("qrcode"));
const crypto_1 = __importDefault(require("crypto"));
const supabase_js_1 = require("@supabase/supabase-js");
const logger_1 = require("../utils/logger");
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
function generateQRHash(resultId) {
    return crypto_1.default
        .createHmac("sha256", process.env.JWT_SECRET)
        .update(resultId)
        .digest("hex")
        .slice(0, 32);
}
async function generateQRCode(qrHash, tenantId) {
    try {
        const verifyUrl = `${process.env.FRONTEND_URL}/verify/${qrHash}`;
        // Generate QR code as PNG buffer
        const qrBuffer = await qrcode_1.default.toBuffer(verifyUrl, {
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
            logger_1.logger.warn("QR upload to Supabase failed, using data URL fallback:", error);
        }
        // Fallback: Return as data URL (base64 encoded image)
        const base64Image = qrBuffer.toString("base64");
        return `data:image/png;base64,${base64Image}`;
    }
    catch (error) {
        logger_1.logger.error("QR generation error:", error);
        // Last resort: generate inline QR code as data URL
        try {
            const verifyUrl = `${process.env.FRONTEND_URL}/verify/${qrHash}`;
            const dataUrl = await qrcode_1.default.toDataURL(verifyUrl, {
                errorCorrectionLevel: "H",
                width: 300,
                margin: 2,
                color: { dark: "#1E293B", light: "#FFFFFF" },
            });
            return dataUrl;
        }
        catch (fallbackError) {
            logger_1.logger.error("QR fallback generation error:", fallbackError);
            throw new Error("Failed to generate QR code");
        }
    }
}
//# sourceMappingURL=qrService.js.map