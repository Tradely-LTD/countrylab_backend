"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppError = void 0;
exports.errorHandler = errorHandler;
exports.notFound = notFound;
const zod_1 = require("zod");
const logger_1 = require("../utils/logger");
class AppError extends Error {
    statusCode;
    message;
    code;
    constructor(statusCode, message, code) {
        super(message);
        this.statusCode = statusCode;
        this.message = message;
        this.code = code;
        this.name = 'AppError';
    }
}
exports.AppError = AppError;
function errorHandler(err, req, res, next) {
    // Zod validation errors
    if (err instanceof zod_1.ZodError) {
        return res.status(400).json({
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: err.errors.map((e) => ({
                field: e.path.join('.'),
                message: e.message,
            })),
        });
    }
    // App errors
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            error: err.message,
            code: err.code,
        });
    }
    // Database unique constraint
    if (err.code === '23505') {
        return res.status(409).json({
            error: 'Resource already exists',
            code: 'DUPLICATE_ENTRY',
        });
    }
    logger_1.logger.error('Unhandled error:', err);
    return res.status(500).json({
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
        code: 'INTERNAL_ERROR',
    });
}
function notFound(req, res) {
    res.status(404).json({
        error: `Route ${req.method} ${req.path} not found`,
        code: 'NOT_FOUND',
    });
}
//# sourceMappingURL=errorHandler.js.map