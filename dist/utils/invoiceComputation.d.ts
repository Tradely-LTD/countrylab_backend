/**
 * Computes invoice totals given a subtotal, tax rate, and discount parameters.
 *
 * @param subtotal - The sum of all line item amounts
 * @param taxRate - Tax rate as a percentage (e.g. 7.5 for 7.5%)
 * @param discountType - Either 'percentage' or 'fixed'
 * @param discountValue - The discount value (percentage 0–100, or fixed amount)
 * @returns discountAmount, taxableAmount, taxAmount, total
 */
export declare function computeInvoiceTotals(subtotal: number, taxRate: number, discountType: "percentage" | "fixed", discountValue: number): {
    discountAmount: number;
    taxableAmount: number;
    taxAmount: number;
    total: number;
};
//# sourceMappingURL=invoiceComputation.d.ts.map