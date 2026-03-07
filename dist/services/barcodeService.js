"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateULID = generateULID;
exports.generateBarcode = generateBarcode;
// ─── barcodeService.ts ────────────────────────────────────────────────────────
const crypto_1 = __importDefault(require("crypto"));
function generateULID() {
    const timestamp = Date.now().toString(36).toUpperCase().padStart(10, "0");
    const randomPart = crypto_1.default
        .randomBytes(10)
        .toString("hex")
        .toUpperCase()
        .slice(0, 16);
    return `CL-${timestamp}${randomPart}`.slice(0, 26);
}
async function generateBarcode(ulid) {
    try {
        // Generate QR code using external API
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(ulid)}`;
        // Test if the URL is accessible by making a HEAD request
        const response = await fetch(qrUrl, { method: "HEAD" });
        if (!response.ok) {
            console.error("QR code generation failed:", response.statusText);
            // Fallback to a different QR code service
            return `https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=${encodeURIComponent(ulid)}`;
        }
        return qrUrl;
    }
    catch (error) {
        console.error("Error generating barcode:", error);
        // Fallback to Google Charts API
        return `https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=${encodeURIComponent(ulid)}`;
    }
}
//# sourceMappingURL=barcodeService.js.map