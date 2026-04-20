#!/usr/bin/env tsx
import "dotenv/config";
import { db } from "../src/db";
import {
  tenants,
  users,
  result_templates,
  result_template_parameters,
} from "../src/db/schema";
import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { getSeedTemplates } from "./seed-templates";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProvisionArgs {
  name: string;
  email: string;
  password: string;
  phone?: string;
  address?: string;
  accreditationNumber?: string;
}

// ─── Arg Parsing ──────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = "true";
      }
    }
  }
  return args;
}

const USAGE = `
Usage: tsx scripts/provision-tenant.ts \\
  --name "Acme Diagnostics" \\
  --email admin@acme.com \\
  --password SecurePass1 \\
  [--phone "+234-800-000-0000"] \\
  [--address "Lagos, Nigeria"] \\
  [--accreditation-number "ISO-17025-001"]

Required: --name, --email, --password
Optional: --phone, --address, --accreditation-number
`.trim();

export function validateArgs(raw: Record<string, string>): ProvisionArgs {
  const missing: string[] = [];
  if (!raw["name"]) missing.push("--name");
  if (!raw["email"]) missing.push("--email");
  if (!raw["password"]) missing.push("--password");

  if (missing.length > 0) {
    throw new Error(`Missing required arguments: ${missing.join(", ")}`);
  }

  if (raw["password"].length < 8) {
    throw new Error("Password must be at least 8 characters long");
  }

  return {
    name: raw["name"],
    email: raw["email"],
    password: raw["password"],
    phone: raw["phone"],
    address: raw["address"],
    accreditationNumber: raw["accreditation-number"],
  };
}

// ─── Slug Derivation ──────────────────────────────────────────────────────────

export function deriveSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const rawArgs = parseArgs(process.argv.slice(2));

  // Handle --help
  if (rawArgs["help"]) {
    console.log(USAGE);
    process.exit(0);
  }

  // Validate args — exit 1 on failure, no DB calls made
  let args: ProvisionArgs;
  try {
    args = validateArgs(rawArgs);
  } catch (err: unknown) {
    console.error(`❌ Validation error: ${(err as Error).message}`);
    console.error(`\n${USAGE}`);
    process.exit(1);
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    // ── 1. Derive slug and check for conflict ──────────────────────────────
    const slug = deriveSlug(args.name);

    const [slugConflict] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1);

    if (slugConflict) {
      console.error(
        `❌ A tenant with slug "${slug}" already exists. Choose a different organization name.`,
      );
      process.exit(1);
    }

    // ── 2. Check email conflict in Supabase Auth ───────────────────────────
    const { data: authList, error: listError } =
      await supabase.auth.admin.listUsers({ perPage: 1000 });

    if (listError) {
      throw new Error(`Failed to list Supabase users: ${listError.message}`);
    }

    const emailConflict = authList.users.find(
      (u) => u.email?.toLowerCase() === args.email.toLowerCase(),
    );

    if (emailConflict) {
      console.error(
        `❌ A user with email "${args.email}" already exists in Supabase Auth.`,
      );
      process.exit(1);
    }

    // ── 3. DB transaction + Supabase user creation ─────────────────────────
    let authUserId: string | null = null;

    const result = await db.transaction(async (tx) => {
      // Insert tenant row
      const [tenant] = await tx
        .insert(tenants)
        .values({
          name: args.name,
          slug,
          phone: args.phone,
          address: args.address,
          accreditation_number: args.accreditationNumber,
          is_active: true,
        })
        .returning();

      // Create Supabase auth user (outside DB but inside try/catch for rollback)
      const { data: authData, error: authError } =
        await supabase.auth.admin.createUser({
          email: args.email,
          password: args.password,
          email_confirm: true,
          user_metadata: { full_name: args.name + " Admin" },
        });

      if (authError) {
        // Re-throw — transaction will roll back the tenant insert
        throw new Error(`Supabase user creation failed: ${authError.message}`);
      }

      authUserId = authData.user.id;

      // Insert users row
      try {
        const [user] = await tx
          .insert(users)
          .values({
            tenant_id: tenant.id,
            supabase_user_id: authUserId,
            email: args.email,
            full_name: args.name + " Admin",
            role: "md",
            is_active: true,
          })
          .returning();

        // Seed the 5 standard product templates for the new tenant
        const seedTemplates = getSeedTemplates();
        for (const tmpl of seedTemplates) {
          const [inserted] = await tx
            .insert(result_templates)
            .values({
              tenant_id: tenant.id,
              name: tmpl.name,
              nis_standard: tmpl.nis_standard,
              nis_standard_ref: tmpl.nis_standard_ref,
              is_active: true,
            })
            .returning({ id: result_templates.id });

          await tx.insert(result_template_parameters).values(
            tmpl.parameters.map((p) => ({
              template_id: inserted.id,
              parameter_name: p.parameter_name,
              nis_limit: p.nis_limit,
              unit: p.unit ?? null,
              parameter_group: p.parameter_group,
              sequence_order: p.sequence_order,
              data_type: p.data_type,
              spec_min: p.spec_min ?? null,
              spec_max: p.spec_max ?? null,
            })),
          );
        }

        return { tenant, user };
      } catch (dbErr) {
        // DB insert failed — manually clean up the Supabase user
        await supabase.auth.admin.deleteUser(authUserId);
        throw dbErr;
      }
    });

    // ── 4. Success output ──────────────────────────────────────────────────
    console.log("\n✅ Tenant provisioned successfully!\n");
    console.log(`   Tenant ID : ${result.tenant.id}`);
    console.log(`   Org Name  : ${result.tenant.name}`);
    console.log(`   Slug      : ${result.tenant.slug}`);
    console.log(`   Admin     : ${args.email}`);
    console.log(
      "\n⚠️  IMPORTANT: Ask the admin to change their password after first login!\n",
    );

    process.exit(0);
  } catch (err: unknown) {
    console.error(`❌ Provisioning failed: ${(err as Error).message}`);
    process.exit(1);
  }
}

main();
