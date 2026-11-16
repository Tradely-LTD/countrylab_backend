// ─── Lab-assigned Sample IDs ──────────────────────────────────────────────────
// Labs type their own IDs (e.g. CL/901/26/DF). An ID must be unique within the
// lab's organisation only; two organisations may use the same ID.

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { samples, tenants } from "../db/schema";
import { AppError } from "../middleware/errorHandler";

/** Matches the samples.ulid column (varchar 30). */
export const sampleIdSchema = z
  .string()
  .trim()
  .min(1, "Sample ID cannot be empty")
  .max(30, "Sample ID must be 30 characters or fewer");

export const sampleIdPrefixSchema = z
  .string()
  .trim()
  .max(15, "Sample ID prefix must be 15 characters or fewer");

/** The organisation's required Sample ID prefix (e.g. "CL/"), or "" for none. */
export async function getSampleIdPrefix(tenantId: string): Promise<string> {
  const [tenant] = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  const prefix = (tenant?.settings as any)?.sample_id_prefix;
  return typeof prefix === "string" ? prefix.trim() : "";
}

/**
 * Resolve the Sample ID for a new sample. When the organisation has a prefix,
 * an ID is required and must start with it (case-sensitive, as entered).
 * Without a prefix, a missing ID falls back to a generated one.
 */
export async function resolveSampleId(
  tenantId: string,
  entered: string | undefined,
  generate: () => string,
): Promise<string> {
  const prefix = await getSampleIdPrefix(tenantId);
  if (!prefix) return entered || generate();
  if (!entered) {
    throw new AppError(400, `Sample ID is required and must start with "${prefix}"`);
  }
  if (!entered.startsWith(prefix) || entered.length === prefix.length) {
    throw new AppError(
      400,
      `Sample ID must start with "${prefix}" followed by the rest of the ID, e.g. ${prefix}901/26/DF`,
    );
  }
  return entered;
}

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
