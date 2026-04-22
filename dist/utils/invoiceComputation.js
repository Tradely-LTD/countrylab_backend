"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeInvoiceTotals = computeInvoiceTotals;
/**
 * Computes invoice totals given a subtotal, tax rate, and discount parameters.
 *
 * @param subtotal - The sum of all line item amounts
 * @param taxRate - Tax rate as a percentage (e.g. 7.5 for 7.5%)
 * @param discountType - Either 'percentage' or 'fixed'
 * @param discountValue - The discount value (percentage 0–100, or fixed amount)
 * @returns discountAmount, taxableAmount, taxAmount, total
 */
function computeInvoiceTotals(subtotal, taxRate, discountType, discountValue) {
    const discountAmount = discountType === "percentage"
        ? subtotal * (discountValue / 100)
        : Math.min(discountValue, subtotal);
    const taxableAmount = subtotal - discountAmount;
    const taxAmount = taxableAmount * (taxRate / 100);
    const total = taxableAmount + taxAmount;
    return { discountAmount, taxableAmount, taxAmount, total };
}
//# sourceMappingURL=invoiceComputation.js.map