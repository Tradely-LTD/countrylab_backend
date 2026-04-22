"use strict";
/**
 * Utility: pass/fail computation for result parameters.
 * Extracted from POST /api/results so it can be unit/property tested independently.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeParameterPassFail = computeParameterPassFail;
exports.computeParameters = computeParameters;
/**
 * Computes pass/warning flags for a single parameter.
 *
 * Rules:
 *  - Numerical parameters with a numeric calculated_value are checked against spec_min/spec_max.
 *    warning = true (and pass = false) when value is outside the range.
 *  - All other parameters (qualitative, or numerical without a numeric calculated_value)
 *    are returned unchanged — warning is never set to true by this function.
 */
function computeParameterPassFail(p) {
    if (p.data_type === "numerical" && typeof p.calculated_value === "number") {
        const hasMin = p.spec_min !== undefined && p.spec_min !== null;
        const hasMax = p.spec_max !== undefined && p.spec_max !== null;
        const belowMin = hasMin && p.calculated_value < p.spec_min;
        const aboveMax = hasMax && p.calculated_value > p.spec_max;
        const warning = belowMin || aboveMax;
        const pass = !warning;
        return { ...p, warning, pass };
    }
    return p;
}
/**
 * Applies computeParameterPassFail to every parameter in the array.
 */
function computeParameters(parameters) {
    return parameters.map(computeParameterPassFail);
}
//# sourceMappingURL=resultComputation.js.map