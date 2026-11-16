// ─── Lab-assigned Sample IDs ──────────────────────────────────────────────────
// Labs type their own IDs (e.g. CL/901/26/DF). An ID must be unique within the
// lab's organisation only; two organisations may use the same ID.

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { samples } from "../db/schema";
import { AppError } from "../middleware/errorHandler";

/** Matches the samples.ulid column (varchar 30). */
export const sampleIdSchema = z
  .string()
  .trim()
  .min(1, "Sample ID cannot be empty")
  .max(30, "Sample ID must be 30 characters or fewer");

function duplicateError(ulid: string) {
  return new AppError(409, `Sample ID ${ulid} already exists`);
}

/** Throw 409 if this organisation already has a sample with this ID. */
export async function assertSampleIdAvailable(tenantId: string, ulid: string) {
  const [existing] = await db
    .select({ id: samples.id })
    .from(samples)
    .where(and(eq(samples.tenant_id, tenantId), eq(samples.ulid, ulid)))
    .limit(1);
  if (existing) throw duplicateError(ulid);
}

/**
 * Turn a unique-constraint violation on insert into a 409. Covers two requests
 * racing for the same ID, and databases where migration 0011 hasn't yet
 * replaced the old organisation-wide constraint.
 */
export function rethrowDuplicateSampleId(error: unknown, ulid: string): never {
  const code = (error as any)?.code ?? (error as any)?.cause?.code;
  if (code === "23505") throw duplicateError(ulid);
  throw error;
}
