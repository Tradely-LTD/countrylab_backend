"use strict";
/**
 * Property-Based Tests for pass/fail computation (P6, P7)
 * Feature: lab-test-result-templates
 *
 * Uses fast-check + Node built-in test runner (node:test).
 * Run with: npx tsx --test src/tests/result-templates.pbt.test.ts
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const fc = __importStar(require("fast-check"));
const resultComputation_js_1 = require("../utils/resultComputation.js");
// ─── Arbitraries ──────────────────────────────────────────────────────────────
/** Generates a finite, non-NaN number (avoids Infinity which breaks comparisons). */
const finiteNumber = fc.float({ noNaN: true, noDefaultInfinity: true });
/**
 * Generates a numerical parameter with spec_min <= spec_max and a random
 * calculated_value. The range is guaranteed to be valid (min <= max).
 */
const numericalParamArb = fc
    .tuple(finiteNumber, finiteNumber, finiteNumber)
    .map(([a, b, value]) => {
    const spec_min = Math.min(a, b);
    const spec_max = Math.max(a, b);
    return {
        param_name: "test_param",
        data_type: "numerical",
        calculated_value: value,
        spec_min,
        spec_max,
    };
});
/**
 * Generates a qualitative parameter with any string value.
 * spec_min / spec_max are intentionally omitted to mirror real usage,
 * but we also test with them present to ensure they are ignored.
 */
const qualitativeParamArb = fc
    .record({
    param_name: fc.string({ minLength: 1, maxLength: 50 }),
    calculated_value: fc.oneof(fc.string(), fc.float({ noNaN: true })),
    spec_min: fc.option(finiteNumber, { nil: undefined }),
    spec_max: fc.option(finiteNumber, { nil: undefined }),
})
    .map((p) => ({
    ...p,
    data_type: "qualitative",
}));
// ─── Property 6: NIS limit pass/fail for numerical parameters ─────────────────
// Feature: lab-test-result-templates, Property 6: NIS limit pass/fail for numerical parameters
//
// Validates: Requirements 5.1, 5.2
(0, node_test_1.describe)("Property 6: NIS limit pass/fail for numerical parameters", () => {
    (0, node_test_1.it)("warning=true and pass=false when calculated_value is outside [spec_min, spec_max]", () => {
        fc.assert(fc.property(numericalParamArb, (param) => {
            const result = (0, resultComputation_js_1.computeParameterPassFail)(param);
            const value = param.calculated_value;
            const outsideRange = value < param.spec_min || value > param.spec_max;
            if (outsideRange) {
                strict_1.default.equal(result.warning, true, `Expected warning=true for value=${value} outside [${param.spec_min}, ${param.spec_max}]`);
                strict_1.default.equal(result.pass, false, `Expected pass=false for value=${value} outside [${param.spec_min}, ${param.spec_max}]`);
            }
        }), { numRuns: 200 });
    });
    (0, node_test_1.it)("warning=false and pass=true when calculated_value is within [spec_min, spec_max]", () => {
        fc.assert(fc.property(numericalParamArb, (param) => {
            const result = (0, resultComputation_js_1.computeParameterPassFail)(param);
            const value = param.calculated_value;
            const withinRange = value >= param.spec_min && value <= param.spec_max;
            if (withinRange) {
                strict_1.default.equal(result.warning, false, `Expected warning=false for value=${value} within [${param.spec_min}, ${param.spec_max}]`);
                strict_1.default.equal(result.pass, true, `Expected pass=true for value=${value} within [${param.spec_min}, ${param.spec_max}]`);
            }
        }), { numRuns: 200 });
    });
    (0, node_test_1.it)("pass and warning are always boolean complements for numerical parameters", () => {
        fc.assert(fc.property(numericalParamArb, (param) => {
            const result = (0, resultComputation_js_1.computeParameterPassFail)(param);
            // pass and warning must be defined and must be logical complements
            strict_1.default.equal(typeof result.pass, "boolean", "pass should be a boolean");
            strict_1.default.equal(typeof result.warning, "boolean", "warning should be a boolean");
            strict_1.default.equal(result.pass, !result.warning, `pass (${result.pass}) must equal !warning (${result.warning})`);
        }), { numRuns: 200 });
    });
    (0, node_test_1.it)("only spec_min bound triggers warning when spec_max is absent", () => {
        fc.assert(fc.property(fc.tuple(finiteNumber, finiteNumber).map(([min, value]) => ({
            param_name: "p",
            data_type: "numerical",
            calculated_value: value,
            spec_min: min,
            spec_max: undefined,
        })), (param) => {
            const result = (0, resultComputation_js_1.computeParameterPassFail)(param);
            const expectedWarning = param.calculated_value < param.spec_min;
            strict_1.default.equal(result.warning, expectedWarning);
            strict_1.default.equal(result.pass, !expectedWarning);
        }), { numRuns: 200 });
    });
    (0, node_test_1.it)("only spec_max bound triggers warning when spec_min is absent", () => {
        fc.assert(fc.property(fc.tuple(finiteNumber, finiteNumber).map(([max, value]) => ({
            param_name: "p",
            data_type: "numerical",
            calculated_value: value,
            spec_min: undefined,
            spec_max: max,
        })), (param) => {
            const result = (0, resultComputation_js_1.computeParameterPassFail)(param);
            const expectedWarning = param.calculated_value > param.spec_max;
            strict_1.default.equal(result.warning, expectedWarning);
            strict_1.default.equal(result.pass, !expectedWarning);
        }), { numRuns: 200 });
    });
});
// ─── Property 7: Qualitative parameters skip numeric validation ───────────────
// Feature: lab-test-result-templates, Property 7: Qualitative parameters skip numeric validation
//
// Validates: Requirements 5.4
(0, node_test_1.describe)("Property 7: Qualitative parameters skip numeric validation", () => {
    (0, node_test_1.it)("warning is never set to true for qualitative parameters", () => {
        fc.assert(fc.property(qualitativeParamArb, (param) => {
            const result = (0, resultComputation_js_1.computeParameterPassFail)(param);
            // The function must not set warning=true for qualitative params
            strict_1.default.notEqual(result.warning, true, `warning must not be true for qualitative param with value=${param.calculated_value}`);
        }), { numRuns: 200 });
    });
    (0, node_test_1.it)("qualitative parameters are returned unchanged (no mutation)", () => {
        fc.assert(fc.property(qualitativeParamArb, (param) => {
            const result = (0, resultComputation_js_1.computeParameterPassFail)(param);
            // The returned object should be the same reference (no transformation applied)
            strict_1.default.equal(result, param, "qualitative parameters should be returned as-is");
        }), { numRuns: 200 });
    });
    (0, node_test_1.it)("qualitative parameters with numeric-looking string values never trigger warning", () => {
        fc.assert(fc.property(fc.record({
            param_name: fc.constant("color"),
            data_type: fc.constant("qualitative"),
            // Numeric-looking strings that could be mistaken for numbers
            calculated_value: fc.oneof(fc.constant("0"), fc.constant("100"), fc.constant("-5"), fc.constant("999.99"), fc.float({ noNaN: true })),
            spec_min: fc.option(finiteNumber, { nil: undefined }),
            spec_max: fc.option(finiteNumber, { nil: undefined }),
        }), (param) => {
            const result = (0, resultComputation_js_1.computeParameterPassFail)(param);
            strict_1.default.notEqual(result.warning, true);
        }), { numRuns: 200 });
    });
});
//# sourceMappingURL=result-templates.pbt.test.js.map