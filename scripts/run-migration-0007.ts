import { Pool } from "pg";
import * as dotenv from "dotenv";
import { getSeedTemplates } from "./seed-templates";

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function runMigration() {
  console.log("🚀 Running migration 0007: Lab Test Result Templates...");

  try {
    // Create result_templates table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS countrylab_lms.result_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES countrylab_lms.tenants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        nis_standard VARCHAR(100),
        nis_standard_ref VARCHAR(100),
        effective_date DATE,
        version INTEGER DEFAULT 1,
        parent_template_id UUID REFERENCES countrylab_lms.result_templates(id),
        is_active BOOLEAN DEFAULT TRUE,
        created_by UUID REFERENCES countrylab_lms.users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log("✅ Created result_templates table");

    // Create result_template_parameters table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS countrylab_lms.result_template_parameters (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        template_id UUID NOT NULL REFERENCES countrylab_lms.result_templates(id) ON DELETE CASCADE,
        parameter_name VARCHAR(255) NOT NULL,
        nis_limit TEXT,
        unit VARCHAR(50),
        parameter_group VARCHAR(100),
        sequence_order INTEGER DEFAULT 0,
        data_type VARCHAR(20) DEFAULT 'numerical',
        spec_min REAL,
        spec_max REAL
      );
    `);

    console.log("✅ Created result_template_parameters table");

    // Add template_id and template_version columns to results table
    await pool.query(`
      ALTER TABLE countrylab_lms.results
      ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES countrylab_lms.result_templates(id),
      ADD COLUMN IF NOT EXISTS template_version INTEGER;
    `);

    console.log("✅ Added template_id and template_version to results table");

    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS result_templates_tenant_idx ON countrylab_lms.result_templates(tenant_id);
      CREATE INDEX IF NOT EXISTS result_templates_active_idx ON countrylab_lms.result_templates(tenant_id, is_active);
      CREATE INDEX IF NOT EXISTS result_template_params_template_idx ON countrylab_lms.result_template_parameters(template_id);
    `);

    console.log("✅ Created indexes");

    // Seed templates for each existing tenant
    const tenantsResult = await pool.query(
      `SELECT id FROM countrylab_lms.tenants`,
    );
    const tenants = tenantsResult.rows;

    console.log(`📦 Seeding templates for ${tenants.length} tenant(s)...`);

    for (const tenant of tenants) {
      await seedTemplatesForTenant(tenant.id);
    }

    console.log("🎉 Migration 0007 completed successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

async function seedTemplatesForTenant(tenantId: string) {
  const templates = getSeedTemplates();

  for (const template of templates) {
    const result = await pool.query(
      `INSERT INTO countrylab_lms.result_templates
        (tenant_id, name, nis_standard, nis_standard_ref, is_active)
       VALUES ($1, $2, $3, $4, TRUE)
       RETURNING id`,
      [
        tenantId,
        template.name,
        template.nis_standard,
        template.nis_standard_ref,
      ],
    );

    const templateId = result.rows[0].id;

    for (const param of template.parameters) {
      await pool.query(
        `INSERT INTO countrylab_lms.result_template_parameters
          (template_id, parameter_name, nis_limit, unit, parameter_group, sequence_order, data_type, spec_min, spec_max)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          templateId,
          param.parameter_name,
          param.nis_limit,
          param.unit ?? null,
          param.parameter_group,
          param.sequence_order,
          param.data_type,
          param.spec_min ?? null,
          param.spec_max ?? null,
        ],
      );
    }

    console.log(
      `  ✅ Seeded template "${template.name}" for tenant ${tenantId}`,
    );
  }
}

runMigration();
