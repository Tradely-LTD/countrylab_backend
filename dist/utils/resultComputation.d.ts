/**
 * Utility: pass/fail computation for result parameters.
 * Extracted from POST /api/results so it can be unit/property tested independently.
 */
export interface ResultParameter {
    param_name: string;
    raw_value?: string | number | null;
    calculated_value?: string | number | null;
    unit?: string | null;
    spec_min?: number | null;
    spec_max?: number | null;
    pass?: boolean;
    warning?: boolean;
    data_type?: "numerical" | "qualitative";
}
/**
 * Computes pass/warning flags for a single parameter.
 *
 * Rules:
 *  - Numerical parameters with a numeric calculated_value are checked against spec_min/spec_max.
 *    warning = true (and pass = false) when value is outside the range.
 *  - All other parameters (qualitative, or numerical without a numeric calculated_value)
 *    are returned unchanged — warning is never set to true by this function.
 */
export declare function computeParameterPassFail(p: ResultParameter): ResultParameter;
/**
 * Applies computeParameterPassFail to every parameter in the array.
 */
export declare function computeParameters(parameters: ResultParameter[]): ResultParameter[];
//# sourceMappingURL=resultComputation.d.ts.map