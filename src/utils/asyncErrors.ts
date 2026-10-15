// Express 4 ignores promises returned by route handlers, so an error thrown in
// an async handler (AppError, ZodError, a failed query) became an unhandled
// rejection and crashed the whole process. Forward those rejections to next()
// so the central errorHandler answers with a proper status instead.
// Equivalent to the express-async-errors package, kept local to avoid a dependency.
// Must be imported before any router is created.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Layer = require("express/lib/router/layer");

const original = Layer.prototype.handle_request;

Layer.prototype.handle_request = function handleRequest(
  req: unknown,
  res: unknown,
  next: (err?: unknown) => void,
) {
  const fn = this.handle;
  // Error-handling middleware (4 args) keeps Express's own behaviour
  if (fn.length > 3) return original.call(this, req, res, next);
  try {
    const ret = fn(req, res, next);
    if (ret && typeof ret.then === "function" && typeof ret.catch === "function") {
      ret.catch((err: unknown) => next(err ?? new Error("Rejected with no reason")));
    }
  } catch (err) {
    next(err);
  }
};

export {};
