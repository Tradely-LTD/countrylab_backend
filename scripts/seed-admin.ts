#!/usr/bin/env tsx
import "dotenv/config";
import { db } from "../src/db";
import { tenants, users } from "../src/db/schema";
import { createClient } from "@supabase/supabase-js";
import { logger } from "../src/utils/logger";
import { eq } from "drizzle-orm";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

async function seedAdmin() {
  try {
    logger.info("🌱 Starting database seeding...");

    // 1. Create or get tenant
    logger.info("Creating tenant...");
    const existingTenant = await db.query.tenants.findFirst({
      where: eq(tenants.slug, "countrylab"),
    });

    let tenant;
    if (existingTenant) {
      logger.info("✅ Tenant already exists");
      tenant = existingTenant;
    } else {
      const [newTenant] = await db
        .insert(tenants)
        .values({
          name: "Countrylab Diagnostics",
          slug: "countrylab",
          email: "admin@countrylab.com",
          phone: "+234-800-000-0000",
          address: "Lagos, Nigeria",
          accreditation_number: "NAFDAC-LAB-001",
          is_active: true,
        })
        .returning();
      tenant = newTenant;
      logger.info("✅ Tenant created");
    }

    // 2. Create Supabase auth user
    logger.info("Creating Supabase auth user...");
    const email = "admin@countrylab.com";
    const password = "Admin@123456"; // Change this in production!

    // Check if user already exists in Supabase
    const { data: existingAuthUsers } = await supabase.auth.admin.listUsers();
    const existingAuthUser = existingAuthUsers?.users?.find(
      (u) => u.email === email,
    );

    let authUser;
    if (existingAuthUser) {
      logger.info("✅ Supabase auth user already exists");
      authUser = existingAuthUser;
    } else {
      const { data: newAuthUser, error: authError } =
        await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            full_name: "System Administrator",
          },
        });

      if (authError) {
        throw new Error(`Failed to create auth user: ${authError.message}`);
      }

      authUser = newAuthUser.user;
      logger.info("✅ Supabase auth user created");
    }

    // 3. Create user in database
    logger.info("Creating database user...");
    const existingDbUser = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existingDbUser) {
      logger.info("✅ Database user already exists");
    } else {
      await db.insert(users).values({
        tenant_id: tenant.id,
        supabase_user_id: authUser.id,
        email,
        full_name: "System Administrator",
        role: "super_admin",
        department: "Administration",
        is_active: true,
      });
      logger.info("✅ Database user created");
    }

    logger.info("\n🎉 Seeding completed successfully!\n");
    logger.info("📋 Login Credentials:");
    logger.info(`   Email: ${email}`);
    logger.info(`   Password: ${password}`);
    logger.info(`   Role: super_admin`);
    logger.info("\n⚠️  IMPORTANT: Change the password after first login!\n");

    process.exit(0);
  } catch (error) {
    logger.error("❌ Seeding failed:", error);
    process.exit(1);
  }
}

seedAdmin();
